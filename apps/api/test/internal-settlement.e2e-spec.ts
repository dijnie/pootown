import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import type { RoomId } from "@pootown/game-contracts";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";

import type { AuthenticatedPrincipal } from "../src/auth/auth.types";
import { runMigrations } from "../src/database/migration-runner";
import { EconomyService } from "../src/economy/economy.service";
import { GameSessionsService } from "../src/game-sessions/game-sessions.service";
import { IdentityService } from "../src/identity/identity.service";
import { InternalSessionService } from "../src/internal/internal-session.service";
import { InternalSettlementService } from "../src/internal/internal-settlement.service";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let sessions: GameSessionsService;
let internalSessions: InternalSessionService;
let settlements: InternalSettlementService;

function principal(id: string): AuthenticatedPrincipal {
  return { privyDid: `did:privy:${id}`, privySessionId: `session_${id}` };
}

function apiCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

async function startTwoPlayerGame(prefix: string, now: Date): Promise<{
  readonly gameId: string;
  readonly roomId: RoomId;
  readonly creatorUserId: string;
  readonly joinerUserId: string;
  readonly winnerPlayerId: string;
}> {
  const creator = await sessions.createSession(principal(`${prefix}-creator`), "classic_100", `${prefix}:create`, now);
  const joiner = await sessions.joinSession(
    principal(`${prefix}-joiner`),
    creator.session.gameId,
    `${prefix}:join`,
    new Date(now.getTime() + 1),
  );
  const roomInstanceId = `${prefix}-room-instance`;
  const consumedCreator = await internalSessions.consumeTicket(
    {
      contractVersion: 1,
      ticket: creator.admission.ticket,
      gameId: creator.session.gameId,
      roomId: creator.session.roomId,
      roomInstanceId,
    },
    `${prefix}:consume:creator`,
    new Date(now.getTime() + 2),
  );
  const consumedJoiner = await internalSessions.consumeTicket(
    {
      contractVersion: 1,
      ticket: joiner.admission.ticket,
      gameId: creator.session.gameId,
      roomId: creator.session.roomId,
      roomInstanceId,
    },
    `${prefix}:consume:joiner`,
    new Date(now.getTime() + 3),
  );
  await internalSessions.markStarted(
    creator.session.gameId,
    creator.session.roomId,
    1,
    `${prefix}:started`,
    new Date(now.getTime() + 4),
  );
  return {
    gameId: creator.session.gameId,
    roomId: creator.session.roomId,
    creatorUserId: consumedCreator.userId,
    joinerUserId: consumedJoiner.userId,
    winnerPlayerId: consumedJoiner.playerId,
  };
}

async function insertTerminalProof(
  game: { readonly gameId: string; readonly roomId: RoomId; readonly winnerPlayerId: string },
  checksumHex: string,
  committedAt: Date,
): Promise<void> {
  await pool.query(
    `
      INSERT INTO realtime.room_leases
        (room_id, game_session_id, instance_id, lease_until, fencing_token, updated_at)
      VALUES ($1, $2, 'settlement-test', $3, 1, $4)
    `,
    [game.roomId, game.gameId, new Date(committedAt.getTime() + 60_000), committedAt],
  );
  await pool.query(
    `
      INSERT INTO realtime.terminal_proofs
        (game_session_id, room_id, state_version, checkpoint_checksum,
         winner_player_id, end_reason, committed_at)
      VALUES ($1, $2, 9, decode($3, 'hex'), $4, 'lastPlayerStanding', $5)
    `,
    [game.gameId, game.roomId, checksumHex, game.winnerPlayerId, committedAt],
  );
}

describe("internal settlement authority", { timeout: 120_000 }, () => {
  before(async () => {
    container = await new PostgreSqlContainer("postgres:17.6-alpine").start();
    const databaseUrl = container.getConnectionUri();
    await runMigrations(databaseUrl, {
      migrationsDirectory: resolve(process.cwd(), "src/database/migrations"),
      rolesFile: resolve(process.cwd(), "src/database/roles/provision.sql"),
    });
    pool = new Pool({ connectionString: databaseUrl, max: 30 });
    const config = new ConfigService({
      INITIAL_GRANT_COIN: "1000",
      RESCUE_BALANCE_COIN: "100",
      RESCUE_WINDOW_MS: 86_400_000,
      REALTIME_TICKET_TTL_MS: 60_000,
    });
    const economy = new EconomyService(pool, config, new IdentityService());
    sessions = new GameSessionsService(pool, config, economy);
    internalSessions = new InternalSessionService(pool);
    settlements = new InternalSettlementService(pool);
    await pool.query(`
      INSERT INTO game.game_definitions
        (id, policy_version, display_name, maximum_players, entry_coin,
         time_limit_ms, policy_snapshot, policy_hash)
      VALUES
        ('classic_100', 1, 'Classic', 4, 100, 3600000,
         '{"rules":"classic"}', decode(repeat('77', 32), 'hex')),
        ('free', 1, 'Free', 4, 0, 3600000,
         '{"rules":"classic"}', decode(repeat('78', 32), 'hex'))
    `);
  });

  after(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("captures every reservation and credits only the proof-bound winner exactly once", async () => {
    const now = new Date("2026-08-11T15:00:00.000Z");
    const game = await startTwoPlayerGame("complete", now);
    const checksum = "ab".repeat(32);
    await insertTerminalProof(game, checksum, new Date(now.getTime() + 5));

    await assert.rejects(
      settlements.settle(
        game.gameId,
        { contractVersion: 1, roomId: game.roomId, terminalStateVersion: 9, checkpointChecksum: "cd".repeat(32) },
        "complete:forged",
      ),
      (error: unknown) => apiCode(error) === "TERMINAL_PROOF_INVALID",
    );

    const request = {
      contractVersion: 1 as const,
      roomId: game.roomId,
      terminalStateVersion: 9,
      checkpointChecksum: checksum,
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => settlements.settle(game.gameId, request, "complete:settle", new Date(now.getTime() + 6))),
    );
    assert.equal(new Set(results.map((result) => result.operationId)).size, 1);

    const accounts = await pool.query<{ user_id: string; available_coin: string; reserved_coin: string }>(
      `
        SELECT user_id, available_coin::text, reserved_coin::text
        FROM economy.coin_accounts WHERE user_id = ANY($1::varchar[]) ORDER BY user_id
      `,
      [[game.creatorUserId, game.joinerUserId]],
    );
    const creator = accounts.rows.find((row) => row.user_id === game.creatorUserId);
    const joiner = accounts.rows.find((row) => row.user_id === game.joinerUserId);
    assert.deepEqual(creator, { user_id: game.creatorUserId, available_coin: "900", reserved_coin: "0" });
    assert.deepEqual(joiner, { user_id: game.joinerUserId, available_coin: "1100", reserved_coin: "0" });

    const terminal = await pool.query(`
      SELECT
        (SELECT lifecycle FROM game.game_sessions WHERE id = $1) AS lifecycle,
        (SELECT count(*)::int FROM economy.game_settlements WHERE game_session_id = $1) AS settlements,
        (SELECT count(*)::int FROM economy.coin_reservations WHERE game_session_id = $1 AND status = 'captured') AS captured,
        (SELECT count(*)::int FROM economy.coin_operations WHERE operation_scope = 'settleSession' AND status = 'committed') AS operations,
        (SELECT count(*)::int FROM readmodel.session_history WHERE game_session_id = $1) AS history
    `, [game.gameId]);
    assert.deepEqual(terminal.rows, [{ lifecycle: "settled", settlements: 1, captured: 2, operations: 1, history: 2 }]);
    const leaderboard = await pool.query<{ user_id: string; games_played: string; games_won: string; account_coin_won: string }>(
      `
        SELECT user_id, games_played::text, games_won::text, account_coin_won::text
        FROM readmodel.leaderboard_players WHERE user_id = ANY($1::varchar[]) ORDER BY user_id
      `,
      [[game.creatorUserId, game.joinerUserId]],
    );
    assert.equal(leaderboard.rows.find((row) => row.user_id === game.creatorUserId)?.games_won, "0");
    assert.deepEqual(leaderboard.rows.find((row) => row.user_id === game.joinerUserId), {
      user_id: game.joinerUserId,
      games_played: "1",
      games_won: "1",
      account_coin_won: "200",
    });
  });

  it("refunds an explicitly aborted active game once and cannot later settle it", async () => {
    const now = new Date("2026-08-11T16:00:00.000Z");
    const game = await startTwoPlayerGame("abort", now);
    const request = { contractVersion: 1 as const, reason: "reconnectWindowExpired" as const };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => settlements.abort(game.gameId, request, "abort:once", new Date(now.getTime() + 5))),
    );
    assert.equal(new Set(results.map((result) => result.operationId)).size, 1);
    const accounts = await pool.query<{ available_coin: string; reserved_coin: string }>(
      `
        SELECT available_coin::text, reserved_coin::text FROM economy.coin_accounts
        WHERE user_id = ANY($1::varchar[]) ORDER BY user_id
      `,
      [[game.creatorUserId, game.joinerUserId]],
    );
    assert.deepEqual(accounts.rows, [
      { available_coin: "1000", reserved_coin: "0" },
      { available_coin: "1000", reserved_coin: "0" },
    ]);
    const terminal = await pool.query(`
      SELECT
        (SELECT lifecycle FROM game.game_sessions WHERE id = $1) AS lifecycle,
        (SELECT kind FROM economy.game_settlements WHERE game_session_id = $1) AS kind,
        (SELECT abort_reason FROM economy.game_settlements WHERE game_session_id = $1) AS abort_reason,
        (SELECT count(*)::int FROM economy.coin_reservations WHERE game_session_id = $1 AND status = 'released') AS released,
        (SELECT count(*)::int FROM readmodel.session_history WHERE game_session_id = $1 AND result = 'aborted') AS history
    `, [game.gameId]);
    assert.deepEqual(terminal.rows, [{
      lifecycle: "settled",
      kind: "aborted",
      abort_reason: "reconnectWindowExpired",
      released: 2,
      history: 2,
    }]);
    await assert.rejects(
      settlements.settle(
        game.gameId,
        { contractVersion: 1, roomId: game.roomId, terminalStateVersion: 9, checkpointChecksum: "ef".repeat(32) },
        "abort:late-settle",
      ),
      (error: unknown) => apiCode(error) === "SETTLEMENT_ALREADY_COMMITTED",
    );
  });

  it("settles current seats after a historical participant released and rejoined", async () => {
    const now = new Date("2026-08-11T17:00:00.000Z");
    const creator = await sessions.createSession(principal("rejoin-creator"), "classic_100", "rejoin:create", now);
    await sessions.joinSession(principal("rejoin-player"), creator.session.gameId, "rejoin:first", new Date(now.getTime() + 1));
    await sessions.releaseJoinIntent(
      principal("rejoin-player"),
      creator.session.gameId,
      "rejoin:release",
      new Date(now.getTime() + 2),
    );
    const rejoined = await sessions.joinSession(
      principal("rejoin-player"),
      creator.session.gameId,
      "rejoin:second",
      new Date(now.getTime() + 3),
    );
    const creatorSeat = await internalSessions.consumeTicket(
      {
        contractVersion: 1,
        ticket: creator.admission.ticket,
        gameId: creator.session.gameId,
        roomId: creator.session.roomId,
        roomInstanceId: "rejoin-room-instance",
      },
      "rejoin:consume:creator",
      new Date(now.getTime() + 4),
    );
    const joinerSeat = await internalSessions.consumeTicket(
      {
        contractVersion: 1,
        ticket: rejoined.admission.ticket,
        gameId: creator.session.gameId,
        roomId: creator.session.roomId,
        roomInstanceId: "rejoin-room-instance",
      },
      "rejoin:consume:joiner",
      new Date(now.getTime() + 5),
    );
    await internalSessions.markStarted(
      creator.session.gameId,
      creator.session.roomId,
      1,
      "rejoin:started",
      new Date(now.getTime() + 6),
    );
    const game = {
      gameId: creator.session.gameId,
      roomId: creator.session.roomId,
      winnerPlayerId: joinerSeat.playerId,
    };
    const checksum = "12".repeat(32);
    await insertTerminalProof(game, checksum, new Date(now.getTime() + 7));
    await settlements.settle(
      game.gameId,
      { contractVersion: 1, roomId: game.roomId, terminalStateVersion: 9, checkpointChecksum: checksum },
      "rejoin:settle",
      new Date(now.getTime() + 8),
    );
    assert.notEqual(creatorSeat.userId, joinerSeat.userId);
    const reservations = await pool.query<{ status: string; count: number }>(
      `
        SELECT status, count(*)::int AS count FROM economy.coin_reservations
        WHERE game_session_id = $1 GROUP BY status ORDER BY status
      `,
      [game.gameId],
    );
    assert.deepEqual(reservations.rows, [
      { status: "captured", count: 2 },
      { status: "released", count: 1 },
    ]);
  });

  it("settles a zero-cost game without manufacturing ledger entries", async () => {
    const now = new Date("2026-08-11T18:00:00.000Z");
    const creator = await sessions.createSession(principal("free-settle-creator"), "free", "free-settle:create", now);
    const joiner = await sessions.joinSession(
      principal("free-settle-joiner"),
      creator.session.gameId,
      "free-settle:join",
      new Date(now.getTime() + 1),
    );
    const roomInstanceId = "free-settle-room";
    await internalSessions.consumeTicket({
      contractVersion: 1,
      ticket: creator.admission.ticket,
      gameId: creator.session.gameId,
      roomId: creator.session.roomId,
      roomInstanceId,
    }, "free-settle:consume:creator", new Date(now.getTime() + 2));
    const winner = await internalSessions.consumeTicket({
      contractVersion: 1,
      ticket: joiner.admission.ticket,
      gameId: creator.session.gameId,
      roomId: creator.session.roomId,
      roomInstanceId,
    }, "free-settle:consume:joiner", new Date(now.getTime() + 3));
    await internalSessions.markStarted(
      creator.session.gameId,
      creator.session.roomId,
      1,
      "free-settle:started",
      new Date(now.getTime() + 4),
    );
    const checksum = "34".repeat(32);
    await insertTerminalProof(
      { gameId: creator.session.gameId, roomId: creator.session.roomId, winnerPlayerId: winner.playerId },
      checksum,
      new Date(now.getTime() + 5),
    );
    const response = await settlements.settle(
      creator.session.gameId,
      { contractVersion: 1, roomId: creator.session.roomId, terminalStateVersion: 9, checkpointChecksum: checksum },
      "free-settle:settle",
      new Date(now.getTime() + 6),
    );
    const state = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM economy.coin_ledger_entries WHERE operation_id = $1) AS ledger_entries,
        (SELECT count(*)::int FROM economy.coin_reservations WHERE game_session_id = $2 AND status = 'captured') AS captured,
        (SELECT lifecycle FROM game.game_sessions WHERE id = $2) AS lifecycle
    `, [response.operationId, creator.session.gameId]);
    assert.deepEqual(state.rows, [{ ledger_entries: 0, captured: 2, lifecycle: "settled" }]);
  });

  it("rejects a winner balance overflow before mutating settlement state", async () => {
    const now = new Date("2026-08-11T19:00:00.000Z");
    const game = await startTwoPlayerGame("overflow", now);
    const checksum = "56".repeat(32);
    await insertTerminalProof(game, checksum, new Date(now.getTime() + 5));
    const maximum = 10n ** 78n - 1n;
    const account = await pool.query<{ available_coin: string }>(
      "SELECT available_coin::text FROM economy.coin_accounts WHERE user_id = $1",
      [game.joinerUserId],
    );
    const increase = maximum - BigInt(account.rows[0]?.available_coin ?? "0");
    const operationId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO economy.coin_operations
            (id, actor_user_id, operation_scope, idempotency_key, request_hash)
          VALUES ($1, $2, 'testOverflowSeed', $1, decode(repeat('91', 32), 'hex'))
        `,
        [operationId, game.joinerUserId],
      );
      await client.query(
        "UPDATE economy.coin_accounts SET available_coin = $2::numeric, version = version + 1 WHERE user_id = $1",
        [game.joinerUserId, maximum.toString()],
      );
      const ledger = await client.query<{ id: string }>(
        "SELECT id FROM economy.ledger_accounts WHERE owner_user_id = $1 AND kind = 'user_available'",
        [game.joinerUserId],
      );
      await client.query(
        `
          INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
            ($1, $2, $3::numeric), ($1, 'system_issuance', -$3::numeric)
        `,
        [operationId, ledger.rows[0]?.id, increase.toString()],
      );
      await client.query(
        "UPDATE economy.coin_operations SET status = 'committed', response_snapshot = '{}', committed_at = $2 WHERE id = $1",
        [operationId, now],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await assert.rejects(
      settlements.settle(
        game.gameId,
        { contractVersion: 1, roomId: game.roomId, terminalStateVersion: 9, checkpointChecksum: checksum },
        "overflow:settle",
        new Date(now.getTime() + 6),
      ),
      (error: unknown) => apiCode(error) === "ACCOUNT_COIN_OVERFLOW",
    );
    const state = await pool.query(`
      SELECT
        (SELECT lifecycle FROM game.game_sessions WHERE id = $1) AS lifecycle,
        (SELECT count(*)::int FROM economy.game_settlements WHERE game_session_id = $1) AS settlements,
        (SELECT count(*)::int FROM economy.coin_reservations WHERE game_session_id = $1 AND status = 'reserved') AS reserved,
        (SELECT count(*)::int FROM economy.coin_operations WHERE operation_scope = 'settleSession' AND idempotency_key = 'overflow:settle') AS operations
    `, [game.gameId]);
    assert.deepEqual(state.rows, [{ lifecycle: "active", settlements: 0, reserved: 2, operations: 0 }]);
  });
});
