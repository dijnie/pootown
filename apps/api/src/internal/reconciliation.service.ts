import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { CONTRACT_VERSION } from "@pootown/game-contracts";
import {
  ReconciliationResponseSchema,
  RoomSessionFinalizationRequestSchema,
  SettlementRequestSchema,
  type ReconciliationResponse,
} from "@pootown/game-contracts/internal";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { DATABASE_POOL } from "../database/database.constants";
import { withTransaction } from "../database/transaction";
import { GameSessionsService } from "../game-sessions/game-sessions.service";
import { ApiHttpException } from "../platform/http/api-http.exception";
import { InternalSettlementService } from "./internal-settlement.service";

const RECONCILIATION_INTERVAL_MS = 30_000;
const RECONCILIATION_BATCH_SIZE = 100;
const RECONCILIATION_LOCK = "pootown-api-reconciliation";

interface TerminalCandidate {
  readonly id: string;
  readonly room_id: string;
  readonly state_version: string;
  readonly checkpoint_checksum: Buffer;
}

@Injectable()
export class ReconciliationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly waitingSessionTtlMs: number;
  private readonly ticketReleaseGraceMs: number;
  private readonly activeRecoveryGraceMs: number;
  private running = false;

  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    config: ConfigService,
    private readonly sessions: GameSessionsService,
    private readonly settlements: InternalSettlementService,
  ) {
    this.waitingSessionTtlMs = config.getOrThrow<number>("WAITING_SESSION_TTL_MS");
    this.ticketReleaseGraceMs = config.getOrThrow<number>("TICKET_RELEASE_GRACE_MS");
    this.activeRecoveryGraceMs = config.getOrThrow<number>("ACTIVE_RECOVERY_GRACE_MS");
  }

  public onApplicationBootstrap(): void {
    void this.run().catch((error: unknown) => this.logger.error("Startup reconciliation failed", error));
  }

  @Interval(RECONCILIATION_INTERVAL_MS)
  public runScheduled(): void {
    void this.run().catch((error: unknown) => this.logger.error("Scheduled reconciliation failed", error));
  }

  public async run(now = new Date()): Promise<ReconciliationResponse> {
    if (this.running) return this.response(true, 0, 0, 0, 0, 0, 0);
    this.running = true;
    let lockClient: PoolClient | undefined;
    let lockAcquired = false;
    try {
      lockClient = await this.pool.connect();
      const lock = await lockClient.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
        [RECONCILIATION_LOCK],
      );
      lockAcquired = lock.rows[0]?.acquired === true;
      if (!lockAcquired) return this.response(true, 0, 0, 0, 0, 0, 0);

      const roomCommandsFinalized = await this.finalizeRoomCommands(now);
      const waitingSessionsCancelled = await this.cancelExpiredWaitingSessions(now);
      const expiredAdmissionsReleased = await this.releaseExpiredAdmissions(now);
      const terminal = await this.commitTerminalSettlements(now);
      const offlineSessionsAborted = await this.abortOfflineSessions(now);
      const sessionsMarkedForRecovery = terminal.markedForRecovery + await this.markUnrecoverableSessions(now);
      return this.response(
        false,
        waitingSessionsCancelled,
        expiredAdmissionsReleased,
        terminal.committed,
        roomCommandsFinalized,
        offlineSessionsAborted,
        sessionsMarkedForRecovery,
      );
    } finally {
      if (lockAcquired && lockClient !== undefined) {
        await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [RECONCILIATION_LOCK]).catch(() => undefined);
      }
      lockClient?.release();
      this.running = false;
    }
  }

  private async finalizeRoomCommands(now: Date): Promise<number> {
    const candidates = await this.pool.query<{
      action: "leave" | "cancel";
      game_session_id: string;
      idempotency_key: string;
      player_id: string;
      request_id: string;
      reservation_id: string;
      room_id: string;
    }>(
      `
        SELECT game_session_id, room_id, player_id, reservation_id, request_id::text, action, idempotency_key
        FROM realtime.api_session_finalizations
        ORDER BY created_at, room_id, player_id, request_id
        LIMIT $1
      `,
      [RECONCILIATION_BATCH_SIZE],
    );
    let count = 0;
    for (const candidate of candidates.rows) {
      try {
        await this.sessions.finalizeRoomCommand(candidate.game_session_id, RoomSessionFinalizationRequestSchema.parse({
          contractVersion: CONTRACT_VERSION,
          roomId: candidate.room_id,
          playerId: candidate.player_id,
          reservationId: candidate.reservation_id,
          action: candidate.action,
        }), candidate.idempotency_key, now);
        count += 1;
      } catch (error: unknown) {
        this.logger.warn(
          `Room command finalization failed for ${candidate.game_session_id}: ${this.safeErrorCode(error)}`,
        );
      }
    }
    return count;
  }

  private async abortOfflineSessions(now: Date): Promise<number> {
    const candidates = await this.pool.query<{ game_session_id: string }>(
      `
        SELECT candidate.game_session_id
        FROM realtime.api_offline_abort_candidates candidate
        JOIN game.game_sessions session ON session.id = candidate.game_session_id
        LEFT JOIN economy.game_settlements settlement ON settlement.game_session_id = session.id
        WHERE session.lifecycle IN ('active', 'recovery_required')
          AND candidate.abort_deadline_at <= $1
          AND settlement.id IS NULL
        ORDER BY candidate.abort_deadline_at, candidate.game_session_id
        LIMIT $2
      `,
      [now, RECONCILIATION_BATCH_SIZE],
    );
    let count = 0;
    for (const candidate of candidates.rows) {
      try {
        await this.settlements.abort(
          candidate.game_session_id,
          { contractVersion: CONTRACT_VERSION, reason: "reconnectWindowExpired" },
          `reconcile:offline-abort:${candidate.game_session_id}`,
          now,
        );
        count += 1;
      } catch (error: unknown) {
        if (this.isSettledRace(error)) continue;
        this.logger.warn(`Offline abort reconciliation failed for ${candidate.game_session_id}: ${this.safeErrorCode(error)}`);
      }
    }
    return count;
  }

  private async cancelExpiredWaitingSessions(now: Date): Promise<number> {
    const expiresBefore = new Date(now.getTime() - this.waitingSessionTtlMs);
    const candidates = await this.pool.query<{ id: string }>(
      `
        SELECT id FROM game.game_sessions
        WHERE lifecycle = 'open' AND created_at <= $1
        ORDER BY created_at, id LIMIT $2
      `,
      [expiresBefore, RECONCILIATION_BATCH_SIZE],
    );
    let count = 0;
    for (const candidate of candidates.rows) {
      if (await this.sessions.cancelExpiredWaitingSession(candidate.id, expiresBefore, now)) count += 1;
    }
    return count;
  }

  private async releaseExpiredAdmissions(now: Date): Promise<number> {
    const expiredBefore = new Date(now.getTime() - this.ticketReleaseGraceMs);
    const candidates = await this.pool.query<{ reservation_id: string }>(
      `
        SELECT reservation.id AS reservation_id
        FROM economy.coin_reservations reservation
        JOIN game.game_sessions session ON session.id = reservation.game_session_id
        WHERE reservation.status = 'reserved' AND session.lifecycle = 'open'
          AND EXISTS (
            SELECT 1 FROM game.realtime_tickets ticket
            WHERE ticket.reservation_id = reservation.id
              AND ticket.consumed_at IS NULL AND ticket.expires_at <= $1
          )
          AND NOT EXISTS (
            SELECT 1 FROM game.session_players player
            WHERE player.reservation_id = reservation.id AND player.active = true
          )
        ORDER BY reservation.created_at, reservation.id LIMIT $2
      `,
      [expiredBefore, RECONCILIATION_BATCH_SIZE],
    );
    let count = 0;
    for (const candidate of candidates.rows) {
      if (await this.sessions.releaseExpiredAdmission(candidate.reservation_id, expiredBefore, now)) count += 1;
    }
    return count;
  }

  private async commitTerminalSettlements(now: Date): Promise<{ readonly committed: number; readonly markedForRecovery: number }> {
    const candidates = await this.pool.query<TerminalCandidate>(
      `
        SELECT session.id, proof.room_id, proof.state_version::text, proof.checkpoint_checksum
        FROM game.game_sessions session
        JOIN realtime.api_settlement_proofs proof ON proof.game_session_id = session.id
        LEFT JOIN economy.game_settlements settlement ON settlement.game_session_id = session.id
        WHERE (
          session.lifecycle IN ('active', 'settling')
          OR (session.lifecycle = 'recovery_required' AND proof.committed_at > session.recovery_required_at)
        ) AND settlement.id IS NULL
        ORDER BY proof.committed_at, session.id LIMIT $1
      `,
      [RECONCILIATION_BATCH_SIZE],
    );
    let committed = 0;
    let markedForRecovery = 0;
    for (const candidate of candidates.rows) {
      try {
        await this.settlements.settle(
          candidate.id,
          SettlementRequestSchema.parse({
            contractVersion: CONTRACT_VERSION,
            roomId: candidate.room_id,
            terminalStateVersion: Number(candidate.state_version),
            checkpointChecksum: candidate.checkpoint_checksum.toString("hex"),
          }),
          `reconcile:settle:${candidate.id}`,
          now,
        );
        committed += 1;
      } catch (error: unknown) {
        if (this.isSettledRace(error)) continue;
        this.logger.warn(`Terminal reconciliation failed for ${candidate.id}: ${this.safeErrorCode(error)}`);
        if (this.isDurablyInvalidProof(error) && await this.markProofRecoveryRequired(candidate.id, now)) {
          markedForRecovery += 1;
        }
      }
    }
    return { committed, markedForRecovery };
  }

  private async markUnrecoverableSessions(now: Date): Promise<number> {
    const inactiveBefore = new Date(now.getTime() - this.activeRecoveryGraceMs);
    const candidates = await this.pool.query<{ id: string }>(
      `
        SELECT session.id
        FROM game.game_sessions session
        WHERE session.lifecycle IN ('active', 'settling') AND session.started_at <= $1
          AND NOT EXISTS (
            SELECT 1 FROM realtime.api_settlement_proofs proof WHERE proof.game_session_id = session.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM realtime.api_room_recovery_status runtime
            WHERE runtime.game_session_id = session.id AND runtime.room_id = session.room_id
              AND runtime.runtime_evidence_at > $1
              AND runtime.checkpoint_state_version >= session.state_version
          )
        ORDER BY session.started_at, session.id LIMIT $2
      `,
      [inactiveBefore, RECONCILIATION_BATCH_SIZE],
    );
    let count = 0;
    for (const candidate of candidates.rows) {
      if (await this.markRecoveryRequired(candidate.id, inactiveBefore)) count += 1;
    }
    return count;
  }

  private markRecoveryRequired(gameId: string, inactiveBefore: Date): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`game-session:${gameId}`]);
      const result = await client.query<{ lifecycle: string; started_at: Date }>(
        `
          SELECT lifecycle, started_at FROM game.game_sessions
          WHERE id = $1 FOR UPDATE
        `,
        [gameId],
      );
      const session = result.rows[0];
      if (
        session === undefined ||
        (session.lifecycle !== "active" && session.lifecycle !== "settling") ||
        session.started_at.getTime() > inactiveBefore.getTime()
      ) return false;
      if (await this.hasTerminalProof(client, gameId)) return false;
      if (await this.hasRecentRuntimeEvidence(client, gameId, inactiveBefore)) return false;
      await client.query(
        "UPDATE game.game_sessions SET lifecycle = 'recovery_required', recovery_required_at = $2 WHERE id = $1",
        [gameId, new Date(inactiveBefore.getTime() + this.activeRecoveryGraceMs)],
      );
      return true;
    });
  }

  private markProofRecoveryRequired(gameId: string, now: Date): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`game-session:${gameId}`]);
      const result = await client.query<{ lifecycle: string }>(
        "SELECT lifecycle FROM game.game_sessions WHERE id = $1 FOR UPDATE",
        [gameId],
      );
      const session = result.rows[0];
      if (session === undefined || (session.lifecycle !== "active" && session.lifecycle !== "settling")) return false;
      const proof = await client.query(
        `
          SELECT 1 FROM realtime.api_settlement_proofs proof
          WHERE proof.game_session_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM economy.game_settlements settlement WHERE settlement.game_session_id = proof.game_session_id
            )
        `,
        [gameId],
      );
      if (proof.rowCount !== 1) return false;
      await client.query(
        "UPDATE game.game_sessions SET lifecycle = 'recovery_required', recovery_required_at = $2 WHERE id = $1",
        [gameId, now],
      );
      return true;
    });
  }

  private async hasTerminalProof(client: PoolClient, gameId: string): Promise<boolean> {
    const result = await client.query("SELECT 1 FROM realtime.api_settlement_proofs WHERE game_session_id = $1", [gameId]);
    return result.rowCount === 1;
  }

  private async hasRecentRuntimeEvidence(client: PoolClient, gameId: string, inactiveBefore: Date): Promise<boolean> {
    const result = await client.query(
      `
        SELECT 1
        FROM game.game_sessions session
        JOIN realtime.api_room_recovery_status runtime
          ON runtime.game_session_id = session.id AND runtime.room_id = session.room_id
        WHERE session.id = $1 AND runtime.runtime_evidence_at > $2
          AND runtime.checkpoint_state_version >= session.state_version
      `,
      [gameId, inactiveBefore],
    );
    return result.rowCount === 1;
  }

  private isSettledRace(error: unknown): boolean {
    return error instanceof ApiHttpException &&
      (error.code === "SETTLEMENT_ALREADY_COMMITTED" || error.code === "SESSION_NOT_OPEN");
  }

  private isDurablyInvalidProof(error: unknown): boolean {
    return error instanceof z.ZodError || (error instanceof ApiHttpException &&
      (error.code === "TERMINAL_PROOF_INVALID" || error.code === "ACCOUNT_COIN_OVERFLOW"));
  }

  private safeErrorCode(error: unknown): string {
    if (error instanceof ApiHttpException) return error.code;
    if (error instanceof z.ZodError) return "CONTRACT_INVALID";
    return "TRANSIENT_FAILURE";
  }

  private response(
    alreadyRunning: boolean,
    waitingSessionsCancelled: number,
    expiredAdmissionsReleased: number,
    terminalSettlementsCommitted: number,
    roomCommandsFinalized: number,
    offlineSessionsAborted: number,
    sessionsMarkedForRecovery: number,
  ): ReconciliationResponse {
    return ReconciliationResponseSchema.parse({
      contractVersion: CONTRACT_VERSION,
      waitingSessionsCancelled,
      expiredAdmissionsReleased,
      terminalSettlementsCommitted,
      roomCommandsFinalized,
      offlineSessionsAborted,
      sessionsMarkedForRecovery,
      alreadyRunning,
    });
  }
}
