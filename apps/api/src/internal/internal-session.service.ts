import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  CONTRACT_VERSION,
  GameIdSchema,
  OperationResponseSchema,
  type OperationResponse,
} from "@pootown/game-contracts";
import {
  SessionBootstrapResponseSchema,
  TicketConsumeResponseSchema,
  type SessionBootstrapResponse,
  type TicketConsumeRequest,
  type TicketConsumeResponse,
} from "@pootown/game-contracts/internal";
import type { Pool, PoolClient } from "pg";

import { DATABASE_POOL } from "../database/database.constants";
import { withTransaction } from "../database/transaction";
import { ApiHttpException } from "../platform/http/api-http.exception";

interface InternalOperationRow {
  readonly request_hash: Buffer;
  readonly response_snapshot: unknown;
  readonly status: "pending" | "committed" | "no_op";
}

interface SessionRow {
  readonly id: string;
  readonly room_id: string;
  readonly creator_user_id: string;
  readonly lifecycle: "open" | "cancelling" | "cancelled" | "active" | "settling" | "settled" | "recovery_required";
  readonly maximum_players: number;
  readonly state_version: string;
}

interface TicketRow {
  readonly user_id: string;
  readonly game_session_id: string;
  readonly room_id: string;
  readonly reservation_id: string;
  readonly player_id: string;
  readonly role: "player";
  readonly expires_at: Date;
  readonly consumed_at: Date | null;
  readonly consumed_by_room_instance: string | null;
}

interface SeatRow {
  readonly player_id: string;
  readonly reservation_id: string;
  readonly seat_index: number;
}

interface BootstrapSessionRow {
  readonly id: string;
  readonly room_id: string;
  readonly game_definition_id: string;
  readonly game_definition_version: number;
  readonly lifecycle: "open" | "cancelling" | "cancelled" | "active" | "settling" | "settled" | "recovery_required";
  readonly state_version: string;
  readonly maximum_players: number;
  readonly time_limit_ms: number | null;
  readonly created_at: Date;
  readonly started_at: Date | null;
}

interface BootstrapPlayerRow {
  readonly player_id: string;
  readonly seat_index: number;
  readonly joined_at: Date;
  readonly is_creator: boolean;
}

function requestHash(value: unknown): Buffer {
  return createHash("sha256").update(JSON.stringify(value)).digest();
}

@Injectable()
export class InternalSessionService {
  public constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  public async bootstrap(gameId: string): Promise<SessionBootstrapResponse> {
    return withTransaction(this.pool, async (client) => {
      await this.advisoryLockSession(client, gameId);
      const sessionResult = await client.query<BootstrapSessionRow>(
        `
          SELECT id, room_id, game_definition_id, game_definition_version, lifecycle,
                 state_version::text, maximum_players, time_limit_ms, created_at, started_at
          FROM game.game_sessions WHERE id = $1
          FOR SHARE
        `,
        [gameId],
      );
      const session = sessionResult.rows[0];
      if (session === undefined) throw new ApiHttpException("SESSION_NOT_FOUND", 404, "Session was not found");
      if (session.lifecycle === "cancelling" || session.lifecycle === "cancelled") {
        throw new ApiHttpException("SESSION_NOT_OPEN", 409, "Cancelled session cannot be materialized");
      }
      const players = await client.query<BootstrapPlayerRow>(
        `
          SELECT player.player_id, player.seat_index, player.joined_at,
                 (player.user_id = session.creator_user_id) AS is_creator
          FROM game.session_players player
          JOIN game.game_sessions session ON session.id = player.game_session_id
          WHERE player.game_session_id = $1 AND player.active = true
          ORDER BY player.seat_index
        `,
        [gameId],
      );
      const creator = players.rows.find((player) => player.is_creator);
      if (creator === undefined) throw new Error("Session creator seat is missing");
      const lifecycle = session.lifecycle === "recovery_required" ? "recoveryRequired" : session.lifecycle;
      return SessionBootstrapResponseSchema.parse({
        contractVersion: CONTRACT_VERSION,
        gameId: session.id,
        gameDefinitionId: session.game_definition_id,
        gameDefinitionVersion: session.game_definition_version,
        rulesetId: "pootown-rust-source-v1",
        roomId: session.room_id,
        lifecycle,
        stateVersion: Number(session.state_version),
        creatorPlayerId: creator.player_id,
        maximumPlayers: session.maximum_players,
        timeLimitMs: session.time_limit_ms,
        createdAtMs: session.created_at.getTime(),
        startedAtMs: session.started_at?.getTime() ?? null,
        players: players.rows.map((player) => ({
          playerId: player.player_id,
          seatIndex: player.seat_index,
          joinedAtMs: player.joined_at.getTime(),
        })),
      });
    });
  }

  public async consumeTicket(
    request: TicketConsumeRequest,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<TicketConsumeResponse> {
    const hash = requestHash(request);
    const tokenHash = createHash("sha256").update(request.ticket).digest();
    return withTransaction(this.pool, async (client) => {
      await this.advisoryLockSession(client, request.gameId);
      const session = await this.lockSession(client, request.gameId);
      const ticketResult = await client.query<TicketRow>(
        `
          SELECT user_id, game_session_id, room_id, reservation_id, player_id, role,
                 expires_at, consumed_at, consumed_by_room_instance
          FROM game.realtime_tickets
          WHERE token_hash = $1
          FOR UPDATE
        `,
        [tokenHash],
      );
      const ticket = ticketResult.rows[0];
      if (
        ticket === undefined ||
        ticket.game_session_id !== request.gameId ||
        ticket.room_id !== request.roomId ||
        session.room_id !== request.roomId ||
        ticket.role !== "player"
      ) {
        throw new ApiHttpException("TICKET_INVALID", 401, "Realtime ticket binding is invalid");
      }

      if (session.lifecycle !== "open" && session.lifecycle !== "active") {
        throw new ApiHttpException("SESSION_NOT_OPEN", 409, "Session is not accepting ticket consumption");
      }
      const reservation = await client.query(
        `
          SELECT 1 FROM economy.coin_reservations
          WHERE id = $1 AND user_id = $2 AND game_session_id = $3 AND status = 'reserved'
          FOR UPDATE
        `,
        [ticket.reservation_id, ticket.user_id, ticket.game_session_id],
      );
      if (reservation.rowCount !== 1) {
        throw new ApiHttpException("RESERVATION_NOT_FOUND", 409, "Ticket reservation is not active");
      }
      const prior = await this.findOperation(client, ticket.user_id, "consumeTicket", idempotencyKey);
      if (prior !== undefined) this.assertNoOpReplay(prior, hash);
      if (ticket.consumed_at !== null) {
        if (ticket.consumed_by_room_instance !== request.roomInstanceId) {
          throw new ApiHttpException("TICKET_REPLAYED", 409, "Realtime ticket was consumed by another room instance");
        }
        const seat = await this.requireBoundSeat(client, ticket);
        if (prior !== undefined) {
          return TicketConsumeResponseSchema.parse(prior.response_snapshot);
        }
        const response = this.ticketResponse(ticket, seat.seat_index, true);
        await this.insertNoOp(client, randomUUID(), ticket.user_id, "consumeTicket", idempotencyKey, hash, response, now);
        return response;
      }
      if (now.getTime() >= ticket.expires_at.getTime()) {
        throw new ApiHttpException("TICKET_EXPIRED", 410, "Realtime ticket has expired");
      }
      if (prior !== undefined) {
        throw new Error("Consumed ticket operation has no consumed ticket");
      }
      const seat = await this.ensureBoundSeat(client, session, ticket, now);
      await client.query(
        `
          UPDATE game.realtime_tickets
          SET consumed_at = $2, consumed_by_room_instance = $3
          WHERE token_hash = $1 AND consumed_at IS NULL
        `,
        [tokenHash, now, request.roomInstanceId],
      );
      const response = this.ticketResponse(ticket, seat.seat_index, false);
      await this.insertNoOp(client, randomUUID(), ticket.user_id, "consumeTicket", idempotencyKey, hash, response, now);
      return response;
    });
  }

  public async markStarted(
    gameId: string,
    roomId: string,
    stateVersion: number,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<OperationResponse> {
    const hash = requestHash({ contractVersion: CONTRACT_VERSION, gameId, roomId, stateVersion });
    return withTransaction(this.pool, async (client) => {
      await this.advisoryLockSession(client, gameId);
      const session = await this.lockSession(client, gameId);
      const prior = await this.findOperation(client, session.creator_user_id, "markStarted", idempotencyKey);
      if (prior !== undefined) {
        this.assertNoOpReplay(prior, hash);
        return OperationResponseSchema.parse(prior.response_snapshot);
      }
      if (session.room_id !== roomId) throw new ApiHttpException("REQUEST_INVALID", 400, "Room binding is invalid");
      if (session.lifecycle !== "open") throw new ApiHttpException("SESSION_NOT_OPEN", 409, "Session cannot be started");
      if (stateVersion <= 0 || BigInt(session.state_version) !== 0n) {
        throw new ApiHttpException("REQUEST_INVALID", 400, "Initial state version is invalid");
      }
      const readiness = await client.query<{ players: number; consumed: number }>(
        `
          SELECT
            count(*)::int AS players,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM game.realtime_tickets ticket
              WHERE ticket.reservation_id = player.reservation_id AND ticket.consumed_at IS NOT NULL
            ))::int AS consumed
          FROM game.session_players player
          JOIN economy.coin_reservations reservation ON reservation.id = player.reservation_id
          WHERE player.game_session_id = $1 AND player.active = true AND reservation.status = 'reserved'
        `,
        [gameId],
      );
      const counts = readiness.rows[0];
      if (counts === undefined || counts.players < 2 || counts.consumed !== counts.players) {
        throw new ApiHttpException("SESSION_NOT_READY", 409, "Every admitted player must consume a ticket before start");
      }
      const operationId = randomUUID();
      const response = OperationResponseSchema.parse({ contractVersion: CONTRACT_VERSION, operationId, committed: true });
      await client.query(
        `
          UPDATE game.game_sessions
          SET lifecycle = 'active', state_version = $2, started_at = $3
          WHERE id = $1
        `,
        [gameId, stateVersion, now],
      );
      await this.insertNoOp(client, operationId, session.creator_user_id, "markStarted", idempotencyKey, hash, response, now);
      return response;
    });
  }

  private async ensureBoundSeat(
    client: PoolClient,
    session: SessionRow,
    ticket: TicketRow,
    now: Date,
  ): Promise<SeatRow> {
    const existing = await client.query<SeatRow>(
      `
        SELECT player_id, reservation_id, seat_index
        FROM game.session_players
        WHERE game_session_id = $1 AND user_id = $2 AND active = true
      `,
      [ticket.game_session_id, ticket.user_id],
    );
    const seat = existing.rows[0];
    if (seat !== undefined) {
      if (seat.player_id !== ticket.player_id || seat.reservation_id !== ticket.reservation_id) {
        throw new ApiHttpException("TICKET_INVALID", 409, "Ticket seat binding is invalid");
      }
      return seat;
    }
    if (session.lifecycle !== "open") {
      throw new ApiHttpException("TICKET_INVALID", 409, "Active session ticket has no durable seat");
    }
    const occupied = await client.query<{ seat_index: number }>(
      "SELECT seat_index FROM game.session_players WHERE game_session_id = $1 ORDER BY seat_index",
      [ticket.game_session_id],
    );
    const occupiedSeats = new Set(occupied.rows.map((row) => row.seat_index));
    const seatIndex = Array.from({ length: session.maximum_players }, (_, index) => index)
      .find((index) => !occupiedSeats.has(index));
    if (seatIndex === undefined) throw new ApiHttpException("SESSION_FULL", 409, "Session has no available seat");
    await client.query(
      `
        INSERT INTO game.session_players
          (game_session_id, player_id, user_id, seat_index, reservation_id, joined_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [ticket.game_session_id, ticket.player_id, ticket.user_id, seatIndex, ticket.reservation_id, now],
    );
    await client.query(
      `
        UPDATE game.join_intents SET status = 'admitted', updated_at = $2
        WHERE reservation_id = $1 AND status = 'pending'
      `,
      [ticket.reservation_id, now],
    );
    return { player_id: ticket.player_id, reservation_id: ticket.reservation_id, seat_index: seatIndex };
  }

  private async requireBoundSeat(client: PoolClient, ticket: TicketRow): Promise<SeatRow> {
    const result = await client.query<SeatRow>(
      `
        SELECT player_id, reservation_id, seat_index
        FROM game.session_players
        WHERE game_session_id = $1 AND user_id = $2 AND active = true
      `,
      [ticket.game_session_id, ticket.user_id],
    );
    const seat = result.rows[0];
    if (seat === undefined || seat.player_id !== ticket.player_id || seat.reservation_id !== ticket.reservation_id) {
      throw new ApiHttpException("TICKET_INVALID", 409, "Consumed ticket has no durable seat");
    }
    return seat;
  }

  private ticketResponse(ticket: TicketRow, seatIndex: number, reused: boolean): TicketConsumeResponse {
    return TicketConsumeResponseSchema.parse({
      contractVersion: CONTRACT_VERSION,
      userId: ticket.user_id,
      gameId: ticket.game_session_id,
      roomId: ticket.room_id,
      reservationId: ticket.reservation_id,
      playerId: ticket.player_id,
      seatIndex,
      role: ticket.role,
      reused,
    });
  }

  private async lockSession(client: PoolClient, gameId: string): Promise<SessionRow> {
    const result = await client.query<SessionRow>(
      `
        SELECT id, room_id, creator_user_id, lifecycle, maximum_players, state_version::text
        FROM game.game_sessions WHERE id = $1 FOR UPDATE
      `,
      [GameIdSchema.parse(gameId)],
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
  ): Promise<InternalOperationRow | undefined> {
    const result = await client.query<InternalOperationRow>(
      `
        SELECT request_hash, response_snapshot, status
        FROM economy.coin_operations
        WHERE actor_user_id = $1 AND operation_scope = $2 AND idempotency_key = $3
      `,
      [userId, scope, idempotencyKey],
    );
    return result.rows[0];
  }

  private assertNoOpReplay(operation: InternalOperationRow, hash: Buffer): void {
    if (!operation.request_hash.equals(hash)) {
      throw new ApiHttpException("IDEMPOTENCY_CONFLICT", 409, "Idempotency key was already used");
    }
    if (operation.status !== "no_op") throw new Error("Internal operation is incomplete");
  }

  private insertNoOp(
    client: PoolClient,
    operationId: string,
    actorUserId: string,
    scope: string,
    idempotencyKey: string,
    hash: Buffer,
    response: unknown,
    now: Date,
  ): Promise<unknown> {
    return client.query(
      `
        INSERT INTO economy.coin_operations
          (id, actor_user_id, operation_scope, idempotency_key, request_hash,
           response_snapshot, status, committed_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'no_op', $7)
      `,
      [operationId, actorUserId, scope, idempotencyKey, hash, response, now],
    );
  }

  private advisoryLockSession(client: PoolClient, gameId: string): Promise<unknown> {
    return client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [gameId]);
  }
}
