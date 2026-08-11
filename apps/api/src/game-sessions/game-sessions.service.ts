import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AdmissionResponseSchema,
  CONTRACT_VERSION,
  GameDefinitionIdSchema,
  GameIdSchema,
  PlayerIdSchema,
  OperationResponseSchema,
  ReservationIdSchema,
  RoomIdSchema,
  SessionDetailSchema,
  SessionListResponseSchema,
  type AdmissionResponse,
  type OperationResponse,
  type SessionDetail,
  type SessionListResponse,
  type SessionView,
} from "@pootown/game-contracts";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { DATABASE_POOL } from "../database/database.constants";
import { withTransaction } from "../database/transaction";
import { EconomyService } from "../economy/economy.service";
import { ApiHttpException } from "../platform/http/api-http.exception";

const LogicalAdmissionSchema = z.strictObject({
  gameId: GameIdSchema,
  roomId: RoomIdSchema,
  reservationId: ReservationIdSchema,
  playerId: PlayerIdSchema,
});

interface DefinitionRow {
  readonly id: string;
  readonly policy_version: number;
  readonly display_name: string;
  readonly maximum_players: number;
  readonly entry_coin: string;
  readonly time_limit_ms: number | null;
  readonly policy_snapshot: unknown;
  readonly policy_hash: Buffer;
}

interface AccountRow {
  readonly available_coin: string;
}

interface OperationRow {
  readonly request_hash: Buffer;
  readonly response_snapshot: unknown;
  readonly status: "pending" | "committed" | "no_op";
}

interface SessionRow {
  readonly id: string;
  readonly room_id: string;
  readonly game_definition_id: string;
  readonly lifecycle: "open" | "cancelling" | "cancelled" | "active" | "settling" | "settled" | "recovery_required";
  readonly maximum_players: number;
  readonly entry_coin: string;
  readonly created_at: Date;
  readonly started_at: Date | null;
  readonly finished_at: Date | null;
}

interface PlayerRow {
  readonly player_id: string;
  readonly seat_index: number;
}

interface TicketRow {
  readonly id: string;
  readonly consumed_at: Date | null;
}

interface ReservationRow {
  readonly id: string;
  readonly user_id: string;
  readonly amount: string;
}

function requestHash(value: unknown): Buffer {
  return createHash("sha256").update(JSON.stringify(value)).digest();
}

function lifecycle(value: SessionRow["lifecycle"]): SessionView["lifecycle"] {
  return value === "recovery_required" ? "recoveryRequired" : value;
}

@Injectable()
export class GameSessionsService {
  private readonly ticketTtlMs: number;

  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
    private readonly economy: EconomyService,
  ) {
    this.ticketTtlMs = this.config.getOrThrow<number>("REALTIME_TICKET_TTL_MS");
  }

  public async createSession(
    principal: AuthenticatedPrincipal,
    gameDefinitionId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<AdmissionResponse> {
    const provisioned = await this.economy.provisionPrincipal(principal, now);
    const hash = requestHash({ contractVersion: CONTRACT_VERSION, gameDefinitionId });
    return withTransaction(this.pool, async (client) => {
      await this.lockAccount(client, provisioned.user.userId);
      const prior = await this.findOperation(client, provisioned.user.userId, "createSession", idempotencyKey);
      if (prior !== undefined) {
        this.assertReplay(prior, hash);
        return this.reissueAdmission(client, LogicalAdmissionSchema.parse(prior.response_snapshot), now);
      }

      const definitionResult = await client.query<DefinitionRow>(
        `
          SELECT id, policy_version, display_name, maximum_players, entry_coin::text,
                 time_limit_ms, policy_snapshot, policy_hash
          FROM game.game_definitions
          WHERE id = $1 AND active = true
          ORDER BY policy_version DESC
          LIMIT 1
        `,
        [gameDefinitionId],
      );
      const definition = definitionResult.rows[0];
      if (definition === undefined) throw new ApiHttpException("REQUEST_INVALID", 400, "Game definition is unavailable");

      const logical = LogicalAdmissionSchema.parse({
        gameId: randomUUID(),
        roomId: randomUUID(),
        reservationId: randomUUID(),
        playerId: randomUUID(),
      });
      const operationId = randomUUID();
      await this.insertOperation(client, operationId, provisioned.user.userId, "createSession", idempotencyKey, hash);
      await client.query(
        `
          INSERT INTO game.game_sessions
            (id, room_id, game_definition_id, game_definition_version, creator_user_id, lifecycle,
             policy_snapshot, policy_hash, maximum_players, entry_coin, time_limit_ms, created_at)
          VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9::numeric, $10, $11)
        `,
        [
          logical.gameId,
          logical.roomId,
          definition.id,
          definition.policy_version,
          provisioned.user.userId,
          definition.policy_snapshot,
          definition.policy_hash,
          definition.maximum_players,
          definition.entry_coin,
          definition.time_limit_ms,
          now,
        ],
      );
      await this.reserveAndSeat(
        client,
        operationId,
        provisioned.user.userId,
        logical,
        0,
        definition.entry_coin,
        now,
      );
      const ticket = await this.issueTicket(client, provisioned.user.userId, logical, now);
      await this.commitOperation(client, operationId, logical, now);
      return this.admissionResponse(client, logical, ticket, now);
    });
  }

  public async releaseJoinIntent(
    principal: AuthenticatedPrincipal,
    gameId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<OperationResponse> {
    const provisioned = await this.economy.provisionPrincipal(principal, now);
    const hash = requestHash({ contractVersion: CONTRACT_VERSION, gameId });
    return withTransaction(this.pool, async (client) => {
      await this.advisoryLockSession(client, gameId);
      await this.lockAccount(client, provisioned.user.userId);
      const session = await this.lockSession(client, gameId);
      const prior = await this.findOperation(client, provisioned.user.userId, "releaseJoinIntent", idempotencyKey);
      if (prior !== undefined) {
        this.assertReplay(prior, hash, "committed");
        return OperationResponseSchema.parse(prior.response_snapshot);
      }
      if (session.lifecycle !== "open") throw new ApiHttpException("SESSION_NOT_OPEN", 409, "Session is not open");
      const creator = await client.query<{ creator_user_id: string }>(
        "SELECT creator_user_id FROM game.game_sessions WHERE id = $1",
        [gameId],
      );
      if (creator.rows[0]?.creator_user_id === provisioned.user.userId) {
        throw new ApiHttpException("CREATOR_CANNOT_LEAVE", 409, "Session creator must cancel instead");
      }
      const reservationResult = await client.query<ReservationRow>(
        `
          SELECT id, user_id, amount::text
          FROM economy.coin_reservations
          WHERE game_session_id = $1 AND user_id = $2 AND status = 'reserved'
          FOR UPDATE
        `,
        [gameId, provisioned.user.userId],
      );
      const reservation = reservationResult.rows[0];
      if (reservation === undefined) throw new ApiHttpException("RESERVATION_NOT_FOUND", 404, "Reservation was not found");
      const operationId = randomUUID();
      await this.insertOperation(client, operationId, provisioned.user.userId, "releaseJoinIntent", idempotencyKey, hash);
      await this.releaseReservation(client, operationId, reservation, now);
      await client.query(
        "UPDATE game.join_intents SET status = 'released', updated_at = $2 WHERE reservation_id = $1",
        [reservation.id, now],
      );
      await client.query("DELETE FROM game.session_players WHERE reservation_id = $1", [reservation.id]);
      await this.expireUnusedTickets(client, reservation.id, now);
      const response = OperationResponseSchema.parse({ contractVersion: CONTRACT_VERSION, operationId, committed: true });
      await this.commitOperation(client, operationId, response, now);
      return response;
    });
  }

  public async cancelSession(
    principal: AuthenticatedPrincipal,
    gameId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<OperationResponse> {
    const provisioned = await this.economy.provisionPrincipal(principal, now);
    const hash = requestHash({ contractVersion: CONTRACT_VERSION, gameId });
    return withTransaction(this.pool, async (client) => {
      await this.advisoryLockSession(client, gameId);
      const creator = await client.query<{ creator_user_id: string }>(
        "SELECT creator_user_id FROM game.game_sessions WHERE id = $1",
        [gameId],
      );
      if (creator.rows[0] === undefined) {
        throw new ApiHttpException("SESSION_NOT_FOUND", 404, "Session was not found");
      }
      if (creator.rows[0].creator_user_id !== provisioned.user.userId) {
        throw new ApiHttpException("SESSION_FORBIDDEN", 403, "Only the session creator can cancel");
      }
      const prior = await this.findOperation(client, provisioned.user.userId, "cancelSession", idempotencyKey);
      if (prior !== undefined) {
        this.assertReplay(prior, hash, "committed");
        return OperationResponseSchema.parse(prior.response_snapshot);
      }
      const reservationResult = await client.query<ReservationRow>(
        `
          SELECT id, user_id, amount::text
          FROM economy.coin_reservations
          WHERE game_session_id = $1 AND status = 'reserved'
          ORDER BY user_id
        `,
        [gameId],
      );
      const userIds = [...new Set(reservationResult.rows.map((reservation) => reservation.user_id))].sort();
      const locked = await client.query<{ user_id: string }>(
        `
          SELECT user_id FROM economy.coin_accounts
          WHERE user_id = ANY($1::varchar[])
          ORDER BY user_id
          FOR UPDATE
        `,
        [userIds],
      );
      if (locked.rows.length !== userIds.length) throw new Error("Cancellation account set is incomplete");
      const session = await this.lockSession(client, gameId);
      if (session.lifecycle !== "open") throw new ApiHttpException("SESSION_NOT_OPEN", 409, "Session is not open");

      const operationId = randomUUID();
      await this.insertOperation(client, operationId, provisioned.user.userId, "cancelSession", idempotencyKey, hash);
      await client.query("UPDATE game.game_sessions SET lifecycle = 'cancelling' WHERE id = $1", [gameId]);
      for (const reservation of reservationResult.rows) {
        await this.releaseReservation(client, operationId, reservation, now);
      }
      await client.query(
        `
          UPDATE game.join_intents
          SET status = 'released', updated_at = $2
          WHERE game_session_id = $1 AND status IN ('pending', 'admitted')
        `,
        [gameId, now],
      );
      await client.query("DELETE FROM game.session_players WHERE game_session_id = $1", [gameId]);
      await client.query(
        `
          UPDATE game.realtime_tickets
          SET expires_at = GREATEST(created_at + interval '1 millisecond', $2::timestamptz)
          WHERE game_session_id = $1 AND consumed_at IS NULL
        `,
        [gameId, now],
      );
      await client.query(
        "UPDATE game.game_sessions SET lifecycle = 'cancelled', cancelled_at = $2 WHERE id = $1",
        [gameId, now],
      );
      const response = OperationResponseSchema.parse({ contractVersion: CONTRACT_VERSION, operationId, committed: true });
      await this.commitOperation(client, operationId, response, now);
      return response;
    });
  }

  public async reconnectTicket(
    principal: AuthenticatedPrincipal,
    gameId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<AdmissionResponse> {
    const provisioned = await this.economy.provisionPrincipal(principal, now);
    const hash = requestHash({ contractVersion: CONTRACT_VERSION, gameId });
    return withTransaction(this.pool, async (client) => {
      await this.advisoryLockSession(client, gameId);
      await this.lockAccount(client, provisioned.user.userId);
      const session = await this.lockSession(client, gameId);
      if (session.lifecycle !== "open" && session.lifecycle !== "active") {
        const code = session.lifecycle === "cancelling" ? "SESSION_CANCELLING" : "SESSION_NOT_OPEN";
        throw new ApiHttpException(code, 409, "Session is not accepting ticket issuance");
      }
      const prior = await this.findOperation(client, provisioned.user.userId, "reconnectTicket", idempotencyKey);
      if (prior !== undefined) {
        this.assertReplay(prior, hash, "no_op");
        return this.reissueAdmission(client, LogicalAdmissionSchema.parse(prior.response_snapshot), now);
      }
      const binding = await client.query<{
        player_id: string;
        reservation_id: string;
        room_id: string;
      }>(
        `
          SELECT player.player_id, player.reservation_id, session.room_id
          FROM game.session_players player
          JOIN game.game_sessions session ON session.id = player.game_session_id
          JOIN economy.coin_reservations reservation ON reservation.id = player.reservation_id
          WHERE player.game_session_id = $1 AND player.user_id = $2 AND player.active = true
            AND reservation.status = 'reserved'
        `,
        [gameId, provisioned.user.userId],
      );
      const row = binding.rows[0];
      if (row === undefined) throw new ApiHttpException("RESERVATION_NOT_FOUND", 404, "Active seat was not found");
      const logical = LogicalAdmissionSchema.parse({
        gameId,
        roomId: row.room_id,
        reservationId: row.reservation_id,
        playerId: row.player_id,
      });
      const response = await this.reissueAdmission(client, logical, now);
      await client.query(
        `
          INSERT INTO economy.coin_operations
            (id, actor_user_id, operation_scope, idempotency_key, request_hash,
             response_snapshot, status, committed_at)
          VALUES ($1, $2, 'reconnectTicket', $3, $4, $5, 'no_op', $6)
        `,
        [randomUUID(), provisioned.user.userId, idempotencyKey, hash, logical, now],
      );
      return response;
    });
  }

  public async joinSession(
    principal: AuthenticatedPrincipal,
    gameId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<AdmissionResponse> {
    const provisioned = await this.economy.provisionPrincipal(principal, now);
    const hash = requestHash({ contractVersion: CONTRACT_VERSION, gameId });
    return withTransaction(this.pool, async (client) => {
      await this.advisoryLockSession(client, gameId);
      await this.lockAccount(client, provisioned.user.userId);
      const session = await this.lockSession(client, gameId);
      const prior = await this.findOperation(client, provisioned.user.userId, "joinIntent", idempotencyKey);
      if (prior !== undefined) {
        this.assertReplay(prior, hash);
        return this.reissueAdmission(client, LogicalAdmissionSchema.parse(prior.response_snapshot), now);
      }
      if (session.lifecycle !== "open") {
        const code = session.lifecycle === "cancelling" ? "SESSION_CANCELLING" : "SESSION_NOT_OPEN";
        throw new ApiHttpException(code, 409, "Session is not accepting players");
      }
      const existingPlayer = await client.query(
        "SELECT 1 FROM game.session_players WHERE game_session_id = $1 AND user_id = $2",
        [gameId, provisioned.user.userId],
      );
      if (existingPlayer.rowCount !== 0) throw new ApiHttpException("ALREADY_SEATED", 409, "User is already seated");
      const seats = await client.query<{ seat_index: number }>(
        "SELECT seat_index FROM game.session_players WHERE game_session_id = $1 ORDER BY seat_index",
        [gameId],
      );
      const occupied = new Set(seats.rows.map((row) => row.seat_index));
      const seatIndex = Array.from({ length: session.maximum_players }, (_, index) => index)
        .find((index) => !occupied.has(index));
      if (seatIndex === undefined) throw new ApiHttpException("SESSION_FULL", 409, "Session is full");

      const logical = LogicalAdmissionSchema.parse({
        gameId: session.id,
        roomId: session.room_id,
        reservationId: randomUUID(),
        playerId: randomUUID(),
      });
      const operationId = randomUUID();
      await this.insertOperation(client, operationId, provisioned.user.userId, "joinIntent", idempotencyKey, hash);
      await this.reserveAndSeat(
        client,
        operationId,
        provisioned.user.userId,
        logical,
        seatIndex,
        session.entry_coin,
        now,
      );
      const ticket = await this.issueTicket(client, provisioned.user.userId, logical, now);
      await this.commitOperation(client, operationId, logical, now);
      return this.admissionResponse(client, logical, ticket, now);
    });
  }

  public async listSessions(limit: number, cursor?: string): Promise<SessionListResponse> {
    const boundary = cursor === undefined ? undefined : this.decodeCursor(cursor);
    const sessions = await this.pool.query<SessionRow>(
      `
        SELECT id, room_id, game_definition_id, lifecycle, maximum_players, entry_coin::text,
               created_at, started_at, finished_at
        FROM game.game_sessions
        WHERE lifecycle IN ('open', 'active')
          AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::varchar))
        ORDER BY created_at DESC, id DESC
        LIMIT $1
      `,
      [limit + 1, boundary?.createdAt ?? null, boundary?.id ?? ""],
    );
    const page = sessions.rows.slice(0, limit);
    const items = await Promise.all(page.map((session) => this.sessionView(session)));
    const last = page.at(-1);
    return SessionListResponseSchema.parse({
      contractVersion: CONTRACT_VERSION,
      items,
      nextCursor: sessions.rows.length > limit && last !== undefined
        ? Buffer.from(JSON.stringify({ createdAt: last.created_at.toISOString(), id: last.id })).toString("base64url")
        : null,
    });
  }

  public async getSession(gameId: string): Promise<SessionDetail> {
    const result = await this.pool.query<SessionRow>(
      `
        SELECT id, room_id, game_definition_id, lifecycle, maximum_players, entry_coin::text,
               created_at, started_at, finished_at
        FROM game.game_sessions WHERE id = $1
      `,
      [gameId],
    );
    const session = result.rows[0];
    if (session === undefined) throw new ApiHttpException("SESSION_NOT_FOUND", 404, "Session was not found");
    return this.sessionDetail(this.pool, session);
  }

  private async lockAccount(client: PoolClient, userId: string): Promise<AccountRow> {
    const result = await client.query<AccountRow>(
      "SELECT available_coin::text FROM economy.coin_accounts WHERE user_id = $1 FOR UPDATE",
      [userId],
    );
    const account = result.rows[0];
    if (account === undefined) throw new ApiHttpException("ACCOUNT_NOT_FOUND", 404, "Coin account was not found");
    return account;
  }

  private async lockSession(client: PoolClient, gameId: string): Promise<SessionRow> {
    const result = await client.query<SessionRow>(
      `
        SELECT id, room_id, game_definition_id, lifecycle, maximum_players, entry_coin::text,
               created_at, started_at, finished_at
        FROM game.game_sessions WHERE id = $1 FOR UPDATE
      `,
      [gameId],
    );
    const session = result.rows[0];
    if (session === undefined) throw new ApiHttpException("SESSION_NOT_FOUND", 404, "Session was not found");
    return session;
  }

  private async findOperation(
    client: PoolClient,
    userId: string,
    scope: string,
    idempotencyKey: string,
  ): Promise<OperationRow | undefined> {
    const result = await client.query<OperationRow>(
      `
        SELECT request_hash, response_snapshot, status
        FROM economy.coin_operations
        WHERE actor_user_id = $1 AND operation_scope = $2 AND idempotency_key = $3
      `,
      [userId, scope, idempotencyKey],
    );
    return result.rows[0];
  }

  private assertReplay(operation: OperationRow, hash: Buffer, expectedStatus: "committed" | "no_op" = "committed"): void {
    if (!operation.request_hash.equals(hash)) {
      throw new ApiHttpException("IDEMPOTENCY_CONFLICT", 409, "Idempotency key was already used");
    }
    if (operation.status !== expectedStatus) throw new Error("Admission operation is incomplete");
  }

  private insertOperation(
    client: PoolClient,
    operationId: string,
    userId: string,
    scope: string,
    idempotencyKey: string,
    hash: Buffer,
  ): Promise<unknown> {
    return client.query(
      `
        INSERT INTO economy.coin_operations
          (id, actor_user_id, operation_scope, idempotency_key, request_hash)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [operationId, userId, scope, idempotencyKey, hash],
    );
  }

  private async reserveAndSeat(
    client: PoolClient,
    operationId: string,
    userId: string,
    logical: z.infer<typeof LogicalAdmissionSchema>,
    seatIndex: number,
    amount: string,
    now: Date,
  ): Promise<void> {
    if (BigInt(amount) > 0n) {
      const updated = await client.query(
        `
          UPDATE economy.coin_accounts
          SET available_coin = available_coin - $2::numeric,
              reserved_coin = reserved_coin + $2::numeric,
              version = version + 1,
              updated_at = $3
          WHERE user_id = $1 AND available_coin >= $2::numeric
          RETURNING user_id
        `,
        [userId, amount, now],
      );
      if (updated.rowCount !== 1) throw new ApiHttpException("INSUFFICIENT_COINS", 422, "Insufficient account coins");
      const ledgers = await client.query<{ id: string; kind: string }>(
        "SELECT id, kind FROM economy.ledger_accounts WHERE owner_user_id = $1",
        [userId],
      );
      const availableLedger = ledgers.rows.find((row) => row.kind === "user_available")?.id;
      const reservedLedger = ledgers.rows.find((row) => row.kind === "user_reserved")?.id;
      if (availableLedger === undefined || reservedLedger === undefined) throw new Error("User ledger accounts are missing");
      await client.query(
        `
          INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
            ($1, $2, -$4::numeric),
            ($1, $3, $4::numeric)
        `,
        [operationId, availableLedger, reservedLedger, amount],
      );
    }
    await client.query(
      `
        INSERT INTO economy.coin_reservations
          (id, operation_id, user_id, game_session_id, amount, status, created_at)
        VALUES ($1, $2, $3, $4, $5::numeric, 'reserved', $6)
      `,
      [logical.reservationId, operationId, userId, logical.gameId, amount, now],
    );
    await client.query(
      `
        INSERT INTO game.session_players
          (game_session_id, player_id, user_id, seat_index, reservation_id, joined_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [logical.gameId, logical.playerId, userId, seatIndex, logical.reservationId, now],
    );
    await client.query(
      `
        INSERT INTO game.join_intents
          (id, game_session_id, user_id, reservation_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'admitted', $5, $5)
      `,
      [randomUUID(), logical.gameId, userId, logical.reservationId, now],
    );
  }

  private async issueTicket(
    client: PoolClient,
    userId: string,
    logical: z.infer<typeof LogicalAdmissionSchema>,
    now: Date,
  ): Promise<{ readonly ticket: string; readonly expiresAt: Date }> {
    const ticket = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(ticket).digest();
    const expiresAt = new Date(now.getTime() + this.ticketTtlMs);
    await client.query(
      `
        INSERT INTO game.realtime_tickets
          (id, token_hash, user_id, game_session_id, room_id, reservation_id, player_id, role,
           expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'player', $8, $9)
      `,
      [
        randomUUID(),
        tokenHash,
        userId,
        logical.gameId,
        logical.roomId,
        logical.reservationId,
        logical.playerId,
        expiresAt,
        now,
      ],
    );
    return { ticket, expiresAt };
  }

  private async reissueAdmission(
    client: PoolClient,
    logical: z.infer<typeof LogicalAdmissionSchema>,
    now: Date,
  ): Promise<AdmissionResponse> {
    const session = await this.lockSession(client, logical.gameId);
    if (session.lifecycle !== "open" && session.lifecycle !== "active") {
      const code = session.lifecycle === "cancelling" ? "SESSION_CANCELLING" : "SESSION_NOT_OPEN";
      throw new ApiHttpException(code, 409, "Session is not accepting ticket issuance");
    }
    const binding = await client.query<{ user_id: string }>(
      `
        SELECT reservation.user_id
        FROM economy.coin_reservations reservation
        WHERE reservation.id = $1 AND reservation.game_session_id = $2 AND reservation.status = 'reserved'
      `,
      [logical.reservationId, logical.gameId],
    );
    const userId = binding.rows[0]?.user_id;
    if (userId === undefined) throw new ApiHttpException("RESERVATION_NOT_FOUND", 409, "Reservation is no longer active");
    const latest = await client.query<TicketRow>(
      `
        SELECT id, consumed_at
        FROM game.realtime_tickets
        WHERE reservation_id = $1 AND consumed_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [logical.reservationId],
    );
    const ticket = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(ticket).digest();
    const expiresAt = new Date(now.getTime() + this.ticketTtlMs);
    const current = latest.rows[0];
    if (current !== undefined) {
      await client.query(
        "UPDATE game.realtime_tickets SET token_hash = $2, expires_at = $3 WHERE id = $1",
        [current.id, tokenHash, expiresAt],
      );
    } else {
      await client.query(
        `
          INSERT INTO game.realtime_tickets
            (id, token_hash, user_id, game_session_id, room_id, reservation_id, player_id, role,
             expires_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'player', $8, $9)
        `,
        [randomUUID(), tokenHash, userId, logical.gameId, logical.roomId, logical.reservationId, logical.playerId, expiresAt, now],
      );
    }
    return this.admissionResponse(client, logical, { ticket, expiresAt }, now);
  }

  private async commitOperation(
    client: PoolClient,
    operationId: string,
    response: unknown,
    now: Date,
  ): Promise<void> {
    await client.query(
      `
        UPDATE economy.coin_operations
        SET status = 'committed', response_snapshot = $2, committed_at = $3
        WHERE id = $1
      `,
      [operationId, response, now],
    );
  }

  private async admissionResponse(
    client: PoolClient,
    logical: z.infer<typeof LogicalAdmissionSchema>,
    ticket: { readonly ticket: string; readonly expiresAt: Date },
    _now: Date,
  ): Promise<AdmissionResponse> {
    const sessionResult = await client.query<SessionRow>(
      `
        SELECT id, room_id, game_definition_id, lifecycle, maximum_players, entry_coin::text,
               created_at, started_at, finished_at
        FROM game.game_sessions WHERE id = $1
      `,
      [logical.gameId],
    );
    const session = sessionResult.rows[0];
    if (session === undefined) throw new ApiHttpException("SESSION_NOT_FOUND", 404, "Session was not found");
    const detail = await this.sessionDetail(client, session);
    return AdmissionResponseSchema.parse({
      contractVersion: CONTRACT_VERSION,
      session: detail,
      admission: {
        contractVersion: CONTRACT_VERSION,
        gameId: logical.gameId,
        roomId: logical.roomId,
        reservationId: logical.reservationId,
        playerId: logical.playerId,
        role: "player",
        ticket: ticket.ticket,
        expiresAtMs: ticket.expiresAt.getTime(),
      },
    });
  }

  private async sessionView(session: SessionRow): Promise<SessionView> {
    const count = await this.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM game.session_players WHERE game_session_id = $1 AND active = true",
      [session.id],
    );
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: GameIdSchema.parse(session.id),
      gameDefinitionId: GameDefinitionIdSchema.parse(session.game_definition_id),
      roomId: RoomIdSchema.parse(session.room_id),
      lifecycle: lifecycle(session.lifecycle),
      currentPlayers: count.rows[0]?.count ?? 0,
      maximumPlayers: session.maximum_players,
      entryCoin: session.entry_coin as SessionView["entryCoin"],
      createdAtMs: session.created_at.getTime(),
      startedAtMs: session.started_at?.getTime() ?? null,
      finishedAtMs: session.finished_at?.getTime() ?? null,
    };
  }

  private async sessionDetail(client: Pick<PoolClient, "query"> | Pool, session: SessionRow): Promise<SessionDetail> {
    const players = await client.query<PlayerRow>(
      `
        SELECT player_id, seat_index
        FROM game.session_players
        WHERE game_session_id = $1 AND active = true
        ORDER BY seat_index
      `,
      [session.id],
    );
    return SessionDetailSchema.parse({
      contractVersion: CONTRACT_VERSION,
      gameId: session.id,
      gameDefinitionId: session.game_definition_id,
      roomId: session.room_id,
      lifecycle: lifecycle(session.lifecycle),
      currentPlayers: players.rows.length,
      maximumPlayers: session.maximum_players,
      entryCoin: session.entry_coin,
      createdAtMs: session.created_at.getTime(),
      startedAtMs: session.started_at?.getTime() ?? null,
      finishedAtMs: session.finished_at?.getTime() ?? null,
      players: players.rows.map((player) => ({ playerId: player.player_id, seatIndex: player.seat_index })),
    });
  }

  private advisoryLockSession(client: PoolClient, gameId: string): Promise<unknown> {
    return client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [gameId]);
  }

  private async releaseReservation(
    client: PoolClient,
    operationId: string,
    reservation: ReservationRow,
    now: Date,
  ): Promise<void> {
    if (BigInt(reservation.amount) > 0n) {
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
      const ledgers = await client.query<{ id: string; kind: string }>(
        "SELECT id, kind FROM economy.ledger_accounts WHERE owner_user_id = $1",
        [reservation.user_id],
      );
      const available = ledgers.rows.find((row) => row.kind === "user_available")?.id;
      const reserved = ledgers.rows.find((row) => row.kind === "user_reserved")?.id;
      if (available === undefined || reserved === undefined) throw new Error("User ledger accounts are missing");
      await client.query(
        `
          INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
            ($1, $2, $4::numeric),
            ($1, $3, -$4::numeric)
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

  private expireUnusedTickets(client: PoolClient, reservationId: string, now: Date): Promise<unknown> {
    return client.query(
      `
        UPDATE game.realtime_tickets
        SET expires_at = GREATEST(created_at + interval '1 millisecond', $2::timestamptz)
        WHERE reservation_id = $1 AND consumed_at IS NULL
      `,
      [reservationId, now],
    );
  }

  private decodeCursor(cursor: string): { readonly createdAt: string; readonly id: string } {
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (typeof value !== "object" || value === null || !("createdAt" in value) || !("id" in value)) throw new Error();
      const createdAt = value.createdAt;
      const id = value.id;
      const parsedCreatedAt = typeof createdAt === "string" ? new Date(createdAt) : null;
      if (
        Object.keys(value).sort().join(",") !== "createdAt,id" ||
        typeof createdAt !== "string" ||
        parsedCreatedAt === null ||
        !Number.isFinite(parsedCreatedAt.getTime()) ||
        parsedCreatedAt.toISOString() !== createdAt ||
        typeof id !== "string" ||
        !GameIdSchema.safeParse(id).success
      ) {
        throw new Error();
      }
      return { createdAt, id };
    } catch {
      throw new ApiHttpException("REQUEST_INVALID", 400, "Session cursor is invalid");
    }
  }
}
