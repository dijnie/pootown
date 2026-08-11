import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  CONTRACT_VERSION,
  OperationResponseSchema,
  type OperationResponse,
} from "@pootown/game-contracts";
import type { AbortSessionRequest, SettlementRequest } from "@pootown/game-contracts/internal";
import type { Pool, PoolClient } from "pg";

import { DATABASE_POOL } from "../database/database.constants";
import { withTransaction } from "../database/transaction";
import { ApiHttpException } from "../platform/http/api-http.exception";

const MAX_ACCOUNT_COIN = 10n ** 78n - 1n;

interface SessionRow {
  readonly id: string;
  readonly room_id: string;
  readonly creator_user_id: string;
  readonly lifecycle: "active" | "recovery_required" | "settling" | "settled" | string;
  readonly state_version: string;
}

interface ReservationRow {
  readonly id: string;
  readonly user_id: string;
  readonly player_id: string;
  readonly amount: string;
}

interface OperationRow {
  readonly request_hash: Buffer;
  readonly response_snapshot: unknown;
  readonly status: "pending" | "committed" | "no_op";
}

interface TerminalProofRow {
  readonly state_version: string;
  readonly checkpoint_checksum: Buffer;
  readonly winner_player_id: string;
}

function hashRequest(value: unknown): Buffer {
  return createHash("sha256").update(JSON.stringify(value)).digest();
}

@Injectable()
export class InternalSettlementService {
  public constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  public settle(
    gameId: string,
    request: SettlementRequest,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<OperationResponse> {
    const hash = hashRequest({ gameId, ...request });
    return withTransaction(this.pool, async (client) => {
      await this.advisoryLockSession(client, gameId);
      await this.lockAccounts(client, await this.participantUserIds(client, gameId));
      const session = await this.lockSession(client, gameId);
      const prior = await this.findOperation(client, session.creator_user_id, "settleSession", idempotencyKey);
      if (prior !== undefined) return this.replay(prior, hash);
      await this.requireNoSettlement(client, gameId);
      if (session.room_id !== request.roomId) {
        throw new ApiHttpException("TERMINAL_PROOF_INVALID", 409, "Terminal proof room binding is invalid");
      }
      if (session.lifecycle !== "active") {
        throw new ApiHttpException("SESSION_NOT_OPEN", 409, "Session is not active for settlement");
      }

      const proofResult = await client.query<TerminalProofRow>(
        `
          SELECT state_version::text, checkpoint_checksum, winner_player_id
          FROM realtime.api_settlement_proofs
          WHERE game_session_id = $1 AND room_id = $2
        `,
        [gameId, request.roomId],
      );
      const proof = proofResult.rows[0];
      const suppliedChecksum = Buffer.from(request.checkpointChecksum, "hex");
      if (
        proof === undefined ||
        BigInt(proof.state_version) !== BigInt(request.terminalStateVersion) ||
        BigInt(proof.state_version) < BigInt(session.state_version) ||
        !proof.checkpoint_checksum.equals(suppliedChecksum)
      ) {
        throw new ApiHttpException("TERMINAL_PROOF_INVALID", 409, "Terminal checkpoint proof is invalid");
      }

      const reservations = await this.lockParticipants(client, gameId);
      if (reservations.length < 2) {
        throw new ApiHttpException("TERMINAL_PROOF_INVALID", 409, "Settlement requires seated participants");
      }
      const winner = reservations.find((reservation) => reservation.player_id === proof.winner_player_id);
      if (winner === undefined) {
        throw new ApiHttpException("TERMINAL_PROOF_INVALID", 409, "Terminal winner is not seated");
      }

      const operationId = randomUUID();
      const response = OperationResponseSchema.parse({ contractVersion: CONTRACT_VERSION, operationId, committed: true });
      const total = reservations.reduce((sum, reservation) => sum + BigInt(reservation.amount), 0n);
      await this.assertPayoutFits(client, winner.user_id, total);
      await this.insertOperation(client, operationId, session.creator_user_id, "settleSession", idempotencyKey, hash, now);
      for (const reservation of reservations) {
        await this.captureReservation(client, operationId, reservation, now);
      }
      if (total > 0n) await this.creditWinner(client, operationId, winner.user_id, total, now);
      await client.query(
        `
          INSERT INTO economy.game_settlements
            (id, game_session_id, kind, operation_id, terminal_state_version,
             checkpoint_checksum, winner_user_id, created_at)
          VALUES ($1, $2, 'completed', $3, $4, $5, $6, $7)
        `,
        [randomUUID(), gameId, operationId, request.terminalStateVersion, suppliedChecksum, winner.user_id, now],
      );
      await this.writeHistory(client, gameId, reservations, winner.user_id, total, "completed", now);
      await client.query(
        "UPDATE game.game_sessions SET lifecycle = 'settling', state_version = $2 WHERE id = $1",
        [gameId, request.terminalStateVersion],
      );
      await client.query(
        "UPDATE game.game_sessions SET lifecycle = 'settled', finished_at = $2 WHERE id = $1",
        [gameId, now],
      );
      await this.commitOperation(client, operationId, response, now);
      return response;
    });
  }

  public abort(
    gameId: string,
    request: AbortSessionRequest,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<OperationResponse> {
    const hash = hashRequest({ gameId, ...request });
    return withTransaction(this.pool, async (client) => {
      await this.advisoryLockSession(client, gameId);
      await this.lockAccounts(client, await this.participantUserIds(client, gameId));
      const session = await this.lockSession(client, gameId);
      const prior = await this.findOperation(client, session.creator_user_id, "abortSession", idempotencyKey);
      if (prior !== undefined) return this.replay(prior, hash);
      await this.requireNoSettlement(client, gameId);
      if (session.lifecycle !== "active" && session.lifecycle !== "recovery_required") {
        throw new ApiHttpException("SESSION_NOT_OPEN", 409, "Session is not active for abort");
      }
      const reservations = await this.lockParticipants(client, gameId);
      const operationId = randomUUID();
      const response = OperationResponseSchema.parse({ contractVersion: CONTRACT_VERSION, operationId, committed: true });
      await this.insertOperation(client, operationId, session.creator_user_id, "abortSession", idempotencyKey, hash, now);
      for (const reservation of reservations) {
        await this.releaseReservation(client, operationId, reservation, now);
      }
      await client.query(
        `
          INSERT INTO economy.game_settlements
            (id, game_session_id, kind, operation_id, terminal_state_version,
             checkpoint_checksum, winner_user_id, abort_reason, created_at)
          VALUES ($1, $2, 'aborted', $3, NULL, NULL, NULL, $4, $5)
        `,
        [randomUUID(), gameId, operationId, request.reason, now],
      );
      await this.writeHistory(client, gameId, reservations, null, 0n, "aborted", now);
      await client.query("UPDATE game.game_sessions SET lifecycle = 'settling' WHERE id = $1", [gameId]);
      await client.query(
        "UPDATE game.game_sessions SET lifecycle = 'settled', finished_at = $2 WHERE id = $1",
        [gameId, now],
      );
      await this.commitOperation(client, operationId, response, now);
      return response;
    });
  }

  private async lockSession(client: PoolClient, gameId: string): Promise<SessionRow> {
    const result = await client.query<SessionRow>(
      "SELECT id, room_id, creator_user_id, lifecycle, state_version::text FROM game.game_sessions WHERE id = $1 FOR UPDATE",
      [gameId],
    );
    const session = result.rows[0];
    if (session === undefined) throw new ApiHttpException("SESSION_NOT_FOUND", 404, "Session was not found");
    return session;
  }

  private async lockParticipants(client: PoolClient, gameId: string): Promise<ReservationRow[]> {
    const result = await client.query<ReservationRow>(
      `
        SELECT reservation.id, reservation.user_id, player.player_id, reservation.amount::text
        FROM economy.coin_reservations reservation
        JOIN game.session_players player
          ON player.reservation_id = reservation.id AND player.game_session_id = reservation.game_session_id
        WHERE reservation.game_session_id = $1 AND reservation.status = 'reserved' AND player.active = true
        ORDER BY reservation.user_id
        FOR UPDATE OF reservation, player
      `,
      [gameId],
    );
    return result.rows;
  }

  private async participantUserIds(client: PoolClient, gameId: string): Promise<string[]> {
    const result = await client.query<{ user_id: string }>(
      `
        SELECT reservation.user_id
        FROM economy.coin_reservations reservation
        JOIN game.session_players player ON player.reservation_id = reservation.id
        WHERE reservation.game_session_id = $1 AND reservation.status = 'reserved' AND player.active = true
        ORDER BY reservation.user_id
      `,
      [gameId],
    );
    return result.rows.map((row) => row.user_id);
  }

  private async lockAccounts(client: PoolClient, userIds: readonly string[]): Promise<void> {
    const unique = [...new Set(userIds)].sort();
    const result = await client.query(
      "SELECT user_id FROM economy.coin_accounts WHERE user_id = ANY($1::varchar[]) ORDER BY user_id FOR UPDATE",
      [unique],
    );
    if (result.rowCount !== unique.length) throw new Error("Settlement coin account is missing");
  }

  private async assertPayoutFits(client: PoolClient, winnerUserId: string, prize: bigint): Promise<void> {
    if (prize > MAX_ACCOUNT_COIN) {
      throw new ApiHttpException("ACCOUNT_COIN_OVERFLOW", 409, "Settlement payout exceeds the account-coin limit");
    }
    const result = await client.query<{ available_coin: string; account_coin_won: string }>(
      `
        SELECT account.available_coin::text,
               COALESCE(leaderboard.account_coin_won, 0)::text AS account_coin_won
        FROM economy.coin_accounts account
        LEFT JOIN readmodel.leaderboard_players leaderboard ON leaderboard.user_id = account.user_id
        WHERE account.user_id = $1
      `,
      [winnerUserId],
    );
    const winner = result.rows[0];
    if (
      winner === undefined ||
      BigInt(winner.available_coin) + prize > MAX_ACCOUNT_COIN ||
      BigInt(winner.account_coin_won) + prize > MAX_ACCOUNT_COIN
    ) {
      throw new ApiHttpException("ACCOUNT_COIN_OVERFLOW", 409, "Settlement payout exceeds the account-coin limit");
    }
  }

  private async captureReservation(
    client: PoolClient,
    operationId: string,
    reservation: ReservationRow,
    now: Date,
  ): Promise<void> {
    const amount = BigInt(reservation.amount);
    if (amount > 0n) {
      const updated = await client.query(
        `
          UPDATE economy.coin_accounts
          SET reserved_coin = reserved_coin - $2::numeric, version = version + 1, updated_at = $3
          WHERE user_id = $1 AND reserved_coin >= $2::numeric
          RETURNING user_id
        `,
        [reservation.user_id, reservation.amount, now],
      );
      if (updated.rowCount !== 1) throw new Error("Reservation balance cannot be captured");
      const ledger = await this.ledgerAccount(client, reservation.user_id, "user_reserved");
      await client.query(
        "INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES ($1, $2, -$3::numeric)",
        [operationId, ledger, reservation.amount],
      );
    }
    await client.query(
      `
        UPDATE economy.coin_reservations
        SET status = 'captured', terminal_at = $2, terminal_operation_id = $3
        WHERE id = $1
      `,
      [reservation.id, now, operationId],
    );
  }

  private async creditWinner(
    client: PoolClient,
    operationId: string,
    userId: string,
    amount: bigint,
    now: Date,
  ): Promise<void> {
    await client.query(
      `
        UPDATE economy.coin_accounts
        SET available_coin = available_coin + $2::numeric, version = version + 1, updated_at = $3
        WHERE user_id = $1
      `,
      [userId, amount.toString(), now],
    );
    const ledger = await this.ledgerAccount(client, userId, "user_available");
    await client.query(
      "INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES ($1, $2, $3::numeric)",
      [operationId, ledger, amount.toString()],
    );
  }

  private async releaseReservation(
    client: PoolClient,
    operationId: string,
    reservation: ReservationRow,
    now: Date,
  ): Promise<void> {
    const amount = BigInt(reservation.amount);
    if (amount > 0n) {
      const updated = await client.query(
        `
          UPDATE economy.coin_accounts
          SET available_coin = available_coin + $2::numeric,
              reserved_coin = reserved_coin - $2::numeric,
              version = version + 1,
              updated_at = $3
          WHERE user_id = $1 AND reserved_coin >= $2::numeric
          RETURNING user_id
        `,
        [reservation.user_id, reservation.amount, now],
      );
      if (updated.rowCount !== 1) throw new Error("Reservation balance cannot be released");
      const available = await this.ledgerAccount(client, reservation.user_id, "user_available");
      const reserved = await this.ledgerAccount(client, reservation.user_id, "user_reserved");
      await client.query(
        `
          INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
            ($1, $2, $4::numeric), ($1, $3, -$4::numeric)
        `,
        [operationId, available, reserved, reservation.amount],
      );
    }
    await client.query(
      `
        UPDATE economy.coin_reservations
        SET status = 'released', terminal_at = $2, terminal_operation_id = $3
        WHERE id = $1
      `,
      [reservation.id, now, operationId],
    );
  }

  private async writeHistory(
    client: PoolClient,
    gameId: string,
    reservations: readonly ReservationRow[],
    winnerUserId: string | null,
    prize: bigint,
    kind: "completed" | "aborted",
    now: Date,
  ): Promise<void> {
    for (const reservation of reservations) {
      const won = reservation.user_id === winnerUserId;
      const delta = kind === "aborted" ? 0n : (won ? prize : 0n) - BigInt(reservation.amount);
      await client.query(
        `
          INSERT INTO readmodel.session_history
            (game_session_id, user_id, player_id, result, account_coin_delta, finished_at)
          VALUES ($1, $2, $3, $4, $5::numeric, $6)
        `,
        [gameId, reservation.user_id, reservation.player_id, kind === "aborted" ? "aborted" : won ? "won" : "lost", delta.toString(), now],
      );
      if (kind === "completed") {
        await client.query(
          `
            INSERT INTO readmodel.leaderboard_players
              (user_id, player_id, games_played, games_won, account_coin_won, updated_at)
            VALUES ($1, $2, 1, $3, $4::numeric, $5)
            ON CONFLICT (user_id) DO UPDATE SET
              player_id = EXCLUDED.player_id,
              games_played = readmodel.leaderboard_players.games_played + 1,
              games_won = readmodel.leaderboard_players.games_won + EXCLUDED.games_won,
              account_coin_won = readmodel.leaderboard_players.account_coin_won + EXCLUDED.account_coin_won,
              updated_at = EXCLUDED.updated_at
          `,
          [reservation.user_id, reservation.player_id, won ? 1 : 0, won ? prize.toString() : "0", now],
        );
      }
    }
  }

  private async ledgerAccount(
    client: PoolClient,
    userId: string,
    kind: "user_available" | "user_reserved",
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM economy.ledger_accounts WHERE owner_user_id = $1 AND kind = $2",
      [userId, kind],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) throw new Error("User ledger account is missing");
    return id;
  }

  private async findOperation(
    client: PoolClient,
    actorUserId: string,
    scope: string,
    idempotencyKey: string,
  ): Promise<OperationRow | undefined> {
    const result = await client.query<OperationRow>(
      `
        SELECT request_hash, response_snapshot, status FROM economy.coin_operations
        WHERE actor_user_id = $1 AND operation_scope = $2 AND idempotency_key = $3
      `,
      [actorUserId, scope, idempotencyKey],
    );
    return result.rows[0];
  }

  private async requireNoSettlement(client: PoolClient, gameId: string): Promise<void> {
    const result = await client.query("SELECT 1 FROM economy.game_settlements WHERE game_session_id = $1", [gameId]);
    if (result.rowCount !== 0) {
      throw new ApiHttpException("SETTLEMENT_ALREADY_COMMITTED", 409, "Session already has a terminal settlement");
    }
  }

  private replay(operation: OperationRow, hash: Buffer): OperationResponse {
    if (!operation.request_hash.equals(hash)) {
      throw new ApiHttpException("IDEMPOTENCY_CONFLICT", 409, "Idempotency key was already used");
    }
    if (operation.status !== "committed") throw new Error("Settlement operation is incomplete");
    return OperationResponseSchema.parse(operation.response_snapshot);
  }

  private insertOperation(
    client: PoolClient,
    operationId: string,
    actorUserId: string,
    scope: string,
    idempotencyKey: string,
    hash: Buffer,
    now: Date,
  ): Promise<unknown> {
    return client.query(
      `
        INSERT INTO economy.coin_operations
          (id, actor_user_id, operation_scope, idempotency_key, request_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [operationId, actorUserId, scope, idempotencyKey, hash, now],
    );
  }

  private commitOperation(
    client: PoolClient,
    operationId: string,
    response: OperationResponse,
    now: Date,
  ): Promise<unknown> {
    return client.query(
      `
        UPDATE economy.coin_operations
        SET response_snapshot = $2, status = 'committed', committed_at = $3
        WHERE id = $1
      `,
      [operationId, response, now],
    );
  }

  private advisoryLockSession(client: PoolClient, gameId: string): Promise<unknown> {
    return client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [gameId]);
  }
}
