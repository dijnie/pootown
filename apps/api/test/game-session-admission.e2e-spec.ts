import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";

import type { AuthenticatedPrincipal } from "../src/auth/auth.types";
import { runMigrations } from "../src/database/migration-runner";
import { EconomyService } from "../src/economy/economy.service";
import { GameSessionsService } from "../src/game-sessions/game-sessions.service";
import { ProvisioningTestIdentityService } from "./provisioning-test-identity.service";
import { InternalSessionService } from "../src/internal/internal-session.service";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let economy: EconomyService;
let sessions: GameSessionsService;
let internalSessions: InternalSessionService;

// Keep scenario clocks after database-owned creation timestamps so these tests
// remain deterministic regardless of the wall-clock time on their run date.
const SCENARIO_DATE = "2099-08-11";

function principal(id: string): AuthenticatedPrincipal {
  return { userId: id, sessionId: `session_${id}` };
}

function apiCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

async function spendTo(userId: string, target: bigint, now: Date): Promise<void> {
  const account = await pool.query<{ available_coin: string }>(
    "SELECT available_coin::text FROM economy.coin_accounts WHERE user_id = $1",
    [userId],
  );
  const amount = BigInt(account.rows[0]?.available_coin ?? "0") - target;
  assert.equal(amount > 0n, true);
  const operationId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO economy.ledger_accounts (id, owner_user_id, kind)
      VALUES ('system_entry', NULL, 'system_entry')
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(
      `
        INSERT INTO economy.coin_operations
          (id, actor_user_id, operation_scope, idempotency_key, request_hash)
        VALUES ($1, $2, 'testSpend', $1, decode(repeat('88', 32), 'hex'))
      `,
      [operationId, userId],
    );
    await client.query(
      `
        UPDATE economy.coin_accounts
        SET available_coin = available_coin - $2::numeric, version = version + 1, updated_at = $3
        WHERE user_id = $1
      `,
      [userId, amount.toString(), now],
    );
    const ledger = await client.query<{ id: string }>(
      "SELECT id FROM economy.ledger_accounts WHERE owner_user_id = $1 AND kind = 'user_available'",
      [userId],
    );
    await client.query(
      `
        INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
          ($1, $2, -$3::numeric),
          ($1, 'system_entry', $3::numeric)
      `,
      [operationId, ledger.rows[0]?.id, amount.toString()],
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
}

describe("game session admission authority", { timeout: 120_000 }, () => {
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
    economy = new EconomyService(pool, config, new ProvisioningTestIdentityService());
    sessions = new GameSessionsService(pool, config, economy);
    internalSessions = new InternalSessionService(pool);
    await pool.query(`
      INSERT INTO game.game_definitions
        (id, policy_version, display_name, maximum_players, entry_coin, time_limit_ms, policy_snapshot, policy_hash)
      VALUES
        ('classic_100', 1, 'Classic', 4, 100, 3600000, '{"rules":"classic"}', decode(repeat('99', 32), 'hex')),
        ('free', 1, 'Free', 4, 0, 3600000, '{"rules":"classic"}', decode(repeat('ab', 32), 'hex')),
        ('expensive', 1, 'Expensive', 4, 1001, 3600000, '{"rules":"classic"}', decode(repeat('aa', 32), 'hex'))
    `);
  });

  after(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("lists active server-owned game definitions without policy internals", async () => {
    const definitions = await sessions.listDefinitions();
    assert.deepEqual(definitions, {
      contractVersion: 1,
      items: [
        { contractVersion: 1, gameDefinitionId: "classic_100", displayName: "Classic", maximumPlayers: 4, entryCoin: "100", timeLimitMs: 3_600_000, policyVersion: 1 },
        { contractVersion: 1, gameDefinitionId: "expensive", displayName: "Expensive", maximumPlayers: 4, entryCoin: "1001", timeLimitMs: 3_600_000, policyVersion: 1 },
        { contractVersion: 1, gameDefinitionId: "free", displayName: "Free", maximumPlayers: 4, entryCoin: "0", timeLimitMs: 3_600_000, policyVersion: 1 },
      ],
    });
  });

  it("preserves monotonic account timestamps when the application clock moves backward", async () => {
    const owner = principal("clock-rollback-owner");
    const accountCreatedAt = new Date(`${SCENARIO_DATE}T13:00:00.000Z`);
    await economy.provisionPrincipal(owner, new Date(`${SCENARIO_DATE}T12:59:59.000Z`));
    await pool.query(
      "UPDATE economy.coin_accounts SET created_at = $2, updated_at = $2 WHERE user_id = $1",
      [owner.userId, accountCreatedAt],
    );

    const created = await sessions.createSession(
      owner,
      "classic_100",
      "create:clock-rollback",
      new Date(`${SCENARIO_DATE}T12:59:59.500Z`),
    );
    const account = await pool.query<{ available_coin: string; reserved_coin: string; updated_at: Date }>(
      `SELECT available_coin::text, reserved_coin::text, updated_at
       FROM economy.coin_accounts WHERE user_id = $1`,
      [owner.userId],
    );
    assert.equal(created.session.currentPlayers, 1);
    assert.equal(account.rows[0]?.available_coin, "900");
    assert.equal(account.rows[0]?.reserved_coin, "100");
    assert.equal(account.rows[0]?.updated_at.getTime(), accountCreatedAt.getTime());
  });

  it("atomically creates creator reserve, seat, and hash-only ticket with replay rotation", async () => {
    const first = await sessions.createSession(
      principal("creator"),
      "classic_100",
      "create:creator:1",
      new Date(`${SCENARIO_DATE}T14:00:00.000Z`),
    );
    const replay = await sessions.createSession(
      principal("creator"),
      "classic_100",
      "create:creator:1",
      new Date(`${SCENARIO_DATE}T14:00:01.000Z`),
    );
    assert.equal(replay.session.gameId, first.session.gameId);
    assert.equal(replay.admission.reservationId, first.admission.reservationId);
    assert.equal(replay.admission.playerId, first.admission.playerId);
    assert.notEqual(replay.admission.ticket, first.admission.ticket);
    assert.deepEqual(replay.session.players, [{ playerId: first.admission.playerId, seatIndex: 0 }]);
    const bootstrap = await internalSessions.bootstrap(first.session.gameId);
    assert.deepEqual(bootstrap, {
      contractVersion: 1,
      gameId: first.session.gameId,
      gameDefinitionId: "classic_100",
      gameDefinitionVersion: 1,
      rulesetId: "pootown-rust-source-v1",
      roomId: first.session.roomId,
      lifecycle: "open",
      stateVersion: 0,
      creatorPlayerId: first.admission.playerId,
      maximumPlayers: 4,
      timeLimitMs: 3_600_000,
      createdAtMs: new Date(`${SCENARIO_DATE}T14:00:00.000Z`).getTime(),
      startedAtMs: null,
      players: [{
        playerId: first.admission.playerId,
        seatIndex: 0,
        joinedAtMs: new Date(`${SCENARIO_DATE}T14:00:00.000Z`).getTime(),
      }],
    });
    assert.equal(JSON.stringify(bootstrap).includes("user"), false);
    assert.equal(JSON.stringify(bootstrap).includes("coin"), false);

    const state = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM game.game_sessions WHERE id = $1) AS sessions,
        (SELECT count(*)::int FROM economy.coin_reservations WHERE game_session_id = $1) AS reservations,
        (SELECT count(*)::int FROM game.session_players WHERE game_session_id = $1) AS players,
        (SELECT count(*)::int FROM game.realtime_tickets WHERE game_session_id = $1) AS tickets,
        (SELECT count(*)::int FROM economy.coin_operations
         WHERE operation_scope = 'createSession'
           AND actor_user_id = (SELECT creator_user_id FROM game.game_sessions WHERE id = $1)) AS operations
    `, [first.session.gameId]);
    assert.deepEqual(state.rows, [{ sessions: 1, reservations: 1, players: 1, tickets: 1, operations: 1 }]);
    const account = await pool.query(`
      SELECT available_coin::text, reserved_coin::text FROM economy.coin_accounts
      WHERE user_id = (SELECT creator_user_id FROM game.game_sessions WHERE id = $1)
    `, [first.session.gameId]);
    assert.deepEqual(account.rows, [{ available_coin: "900", reserved_coin: "100" }]);
    const stored = await pool.query<{ token_hash: Buffer; response_snapshot: unknown }>(`
      SELECT ticket.token_hash, operation.response_snapshot
      FROM game.realtime_tickets ticket
      JOIN economy.coin_operations operation ON operation.actor_user_id = ticket.user_id
      WHERE ticket.game_session_id = $1 AND operation.operation_scope = 'createSession'
    `, [first.session.gameId]);
    assert.equal(stored.rows[0]?.token_hash.equals(createHash("sha256").update(replay.admission.ticket).digest()), true);
    assert.equal(JSON.stringify(stored.rows[0]?.response_snapshot).includes(replay.admission.ticket), false);

    await pool.query(`
      UPDATE game.realtime_tickets
      SET consumed_at = '2099-08-11T14:00:01.000Z', consumed_by_room_instance = 'room-instance-1'
      WHERE game_session_id = $1
    `, [first.session.gameId]);
    const consumedReplay = await sessions.createSession(
      principal("creator"),
      "classic_100",
      "create:creator:1",
      new Date(`${SCENARIO_DATE}T14:00:01.000Z`),
    );
    assert.equal(consumedReplay.admission.playerId, first.admission.playerId);
    assert.equal(consumedReplay.admission.reservationId, first.admission.reservationId);
    const sameTimestampReplay = await sessions.createSession(
      principal("creator"),
      "classic_100",
      "create:creator:1",
      new Date(`${SCENARIO_DATE}T14:00:01.000Z`),
    );
    assert.equal(sameTimestampReplay.admission.playerId, first.admission.playerId);
    const replayState = await pool.query(`
      SELECT
        count(*)::int AS tickets,
        count(*) FILTER (WHERE consumed_at IS NULL)::int AS unused,
        count(DISTINCT reservation_id)::int AS reservations
      FROM game.realtime_tickets
      WHERE game_session_id = $1
    `, [first.session.gameId]);
    assert.deepEqual(replayState.rows, [{ tickets: 2, unused: 1, reservations: 1 }]);

    await assert.rejects(
      sessions.createSession(principal("creator"), "expensive", "create:creator:1"),
      (error: unknown) => apiCode(error) === "IDEMPOTENCY_CONFLICT",
    );
  });

  it("admits exactly one of 20 players racing for the last seat", async () => {
    const target = await sessions.createSession(principal("seat-owner"), "classic_100", "create:seat-owner");
    await sessions.joinSession(principal("seat-two"), target.session.gameId, "join:seat-two");
    await sessions.joinSession(principal("seat-three"), target.session.gameId, "join:seat-three");

    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        sessions.joinSession(principal(`seat-racer-${index}`), target.session.gameId, `join:seat-racer-${index}`)),
    );
    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 19);
    assert.equal(rejected.every((attempt) => apiCode(attempt.reason) === "SESSION_FULL"), true);
    const detail = await sessions.getSession(target.session.gameId);
    assert.equal(detail.currentPlayers, 4);
    assert.deepEqual(detail.players.map((player) => player.seatIndex), [0, 1, 2, 3]);
  });

  it("admits exactly one session when two joins race for the last sufficient balance", async () => {
    const left = await sessions.createSession(principal("balance-owner-left"), "classic_100", "create:balance-left");
    const right = await sessions.createSession(principal("balance-owner-right"), "classic_100", "create:balance-right");
    const contender = await economy.provisionPrincipal(principal("balance-contender"));
    await spendTo(contender.user.userId, 100n, new Date(`${SCENARIO_DATE}T15:00:00.000Z`));

    const attempts = await Promise.allSettled([
      sessions.joinSession(principal("balance-contender"), left.session.gameId, "join:balance:left"),
      sessions.joinSession(principal("balance-contender"), right.session.gameId, "join:balance:right"),
    ]);
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    const failure = attempts.find((attempt) => attempt.status === "rejected");
    assert.equal(failure?.status === "rejected" ? apiCode(failure.reason) : undefined, "INSUFFICIENT_COINS");
    const account = await pool.query(
      "SELECT available_coin::text, reserved_coin::text FROM economy.coin_accounts WHERE user_id = $1",
      [contender.user.userId],
    );
    assert.deepEqual(account.rows, [{ available_coin: "0", reserved_coin: "100" }]);
    const reservations = await pool.query(
      "SELECT count(*)::int AS count FROM economy.coin_reservations WHERE user_id = $1",
      [contender.user.userId],
    );
    assert.equal(reservations.rows[0]?.count, 1);
  });

  it("fails insufficient create atomically and cursor-paginates public session metadata", async () => {
    await assert.rejects(
      sessions.createSession(principal("too-poor"), "expensive", "create:too-poor"),
      (error: unknown) => apiCode(error) === "INSUFFICIENT_COINS",
    );
    const failed = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM game.game_sessions session
         JOIN identity.users users ON users.id = session.creator_user_id
         WHERE users.id = 'too-poor') AS sessions,
        (SELECT count(*)::int FROM economy.coin_operations operation
         JOIN identity.users users ON users.id = operation.actor_user_id
         WHERE users.id = 'too-poor' AND operation.operation_scope = 'createSession') AS operations
    `);
    assert.deepEqual(failed.rows, [{ sessions: 0, operations: 0 }]);

    const firstPage = await sessions.listSessions(2);
    assert.equal(firstPage.items.length, 2);
    assert.notEqual(firstPage.nextCursor, null);
    const secondPage = await sessions.listSessions(100, firstPage.nextCursor ?? undefined);
    assert.equal(secondPage.items.length > 0, true);
    assert.equal(
      new Set([...firstPage.items, ...secondPage.items].map((session) => session.gameId)).size,
      firstPage.items.length + secondPage.items.length,
    );
    const malformed = Buffer.from(JSON.stringify({ createdAt: "0", id: "game_1" })).toString("base64url");
    await assert.rejects(sessions.listSessions(20, malformed), /cursor is invalid/);
  });

  it("admits zero-cost sessions without fake ledger entries", async () => {
    const created = await sessions.createSession(principal("free-owner"), "free", "create:free-owner");
    const joined = await sessions.joinSession(principal("free-joiner"), created.session.gameId, "join:free-joiner");
    assert.equal(created.session.entryCoin, "0");
    assert.equal(joined.session.currentPlayers, 2);
    const state = await pool.query(`
      SELECT
        count(*) FILTER (WHERE reservation.amount = 0)::int AS free_reservations,
        count(entry.id)::int AS ledger_entries
      FROM economy.coin_reservations reservation
      LEFT JOIN economy.coin_ledger_entries entry ON entry.operation_id = reservation.operation_id
      WHERE reservation.game_session_id = $1
    `, [created.session.gameId]);
    assert.deepEqual(state.rows, [{ free_reservations: 2, ledger_entries: 0 }]);
  });

  it("releases a non-creator exactly once and permits a clean rejoin into the vacant seat", async () => {
    const created = await sessions.createSession(
      principal("release-owner"),
      "classic_100",
      "create:release-owner",
      new Date("2026-08-11T16:00:00.000Z"),
    );
    const joined = await sessions.joinSession(
      principal("release-player"),
      created.session.gameId,
      "join:release-player",
      new Date("2026-08-11T16:00:01.000Z"),
    );

    await assert.rejects(
      sessions.releaseJoinIntent(
        principal("release-owner"),
        created.session.gameId,
        "release:creator",
        new Date("2026-08-11T16:00:02.000Z"),
      ),
      (error: unknown) => apiCode(error) === "CREATOR_CANNOT_LEAVE",
    );
    const released = await sessions.releaseJoinIntent(
      principal("release-player"),
      created.session.gameId,
      "release:player",
      new Date("2026-08-11T16:00:02.000Z"),
    );
    const replay = await sessions.releaseJoinIntent(
      principal("release-player"),
      created.session.gameId,
      "release:player",
      new Date("2026-08-11T16:00:03.000Z"),
    );
    assert.deepEqual(replay, released);

    const releasedState = await pool.query(`
      SELECT
        reservation.status,
        reservation.terminal_operation_id,
        account.available_coin::text,
        account.reserved_coin::text,
        (SELECT count(*)::int FROM game.session_players WHERE reservation_id = reservation.id) AS seats,
        (SELECT expires_at FROM game.realtime_tickets WHERE reservation_id = reservation.id) AS expires_at
      FROM economy.coin_reservations reservation
      JOIN economy.coin_accounts account ON account.user_id = reservation.user_id
      WHERE reservation.id = $1
    `, [joined.admission.reservationId]);
    assert.equal(releasedState.rows[0]?.status, "released");
    assert.equal(releasedState.rows[0]?.terminal_operation_id, released.operationId);
    assert.equal(releasedState.rows[0]?.available_coin, "1000");
    assert.equal(releasedState.rows[0]?.reserved_coin, "0");
    assert.equal(releasedState.rows[0]?.seats, 0);
    assert.equal(new Date(releasedState.rows[0]?.expires_at as string).getTime(), Date.parse("2026-08-11T16:00:02.000Z"));

    const rejoined = await sessions.joinSession(
      principal("release-player"),
      created.session.gameId,
      "join:release-player:again",
      new Date("2026-08-11T16:00:04.000Z"),
    );
    assert.equal(rejoined.admission.reservationId === joined.admission.reservationId, false);
    assert.deepEqual(rejoined.session.players.map((player) => player.seatIndex), [0, 1]);
  });

  it("cancels only by the creator and atomically refunds every participant once", async () => {
    const created = await sessions.createSession(
      principal("cancel-owner"),
      "classic_100",
      "create:cancel-owner",
      new Date("2026-08-11T17:00:00.000Z"),
    );
    await sessions.joinSession(
      principal("cancel-player"),
      created.session.gameId,
      "join:cancel-player",
      new Date("2026-08-11T17:00:01.000Z"),
    );
    await assert.rejects(
      sessions.cancelSession(
        principal("cancel-player"),
        created.session.gameId,
        "cancel:not-owner",
        new Date("2026-08-11T17:00:02.000Z"),
      ),
      (error: unknown) => apiCode(error) === "SESSION_FORBIDDEN",
    );

    const cancelled = await sessions.cancelSession(
      principal("cancel-owner"),
      created.session.gameId,
      "cancel:owner",
      new Date("2026-08-11T17:00:03.000Z"),
    );
    const replay = await sessions.cancelSession(
      principal("cancel-owner"),
      created.session.gameId,
      "cancel:owner",
      new Date("2026-08-11T17:00:04.000Z"),
    );
    assert.deepEqual(replay, cancelled);

    const state = await pool.query(`
      SELECT
        (SELECT lifecycle FROM game.game_sessions WHERE id = $1) AS lifecycle,
        (SELECT count(*)::int FROM game.session_players WHERE game_session_id = $1) AS players,
        (SELECT count(*)::int FROM economy.coin_reservations
         WHERE game_session_id = $1 AND status = 'reserved') AS active_reservations,
        (SELECT count(*)::int FROM economy.coin_reservations
         WHERE game_session_id = $1 AND status = 'released' AND terminal_operation_id = $2) AS released_reservations,
        (SELECT count(*)::int FROM economy.coin_ledger_entries WHERE operation_id = $2) AS refund_entries,
        (SELECT count(*)::int FROM readmodel.session_history
         WHERE game_session_id = $1 AND result = 'cancelled' AND account_coin_delta = 0) AS history
    `, [created.session.gameId, cancelled.operationId]);
    assert.deepEqual(state.rows, [{
      lifecycle: "cancelled",
      players: 0,
      active_reservations: 0,
      released_reservations: 2,
      refund_entries: 4,
      history: 2,
    }]);
    const balances = await pool.query(`
      SELECT account.available_coin::text, account.reserved_coin::text
      FROM economy.coin_accounts account
      JOIN identity.users users ON users.id = account.user_id
      WHERE users.id IN ('cancel-owner', 'cancel-player')
      ORDER BY users.id
    `);
    assert.deepEqual(balances.rows, [
      { available_coin: "1000", reserved_coin: "0" },
      { available_coin: "1000", reserved_coin: "0" },
    ]);
    const playerHistory = await economy.listOperations(principal("cancel-player"), 100);
    assert.equal(playerHistory.items.some((item) =>
      item.operationId === cancelled.operationId && item.kind === "release" &&
      item.availableDelta === "100" && item.reservedDelta === "-100"), true);
    await assert.rejects(
      sessions.reconnectTicket(principal("cancel-player"), created.session.gameId, "reconnect:cancelled"),
      (error: unknown) => apiCode(error) === "SESSION_NOT_OPEN",
    );
  });

  it("rotates reconnect tickets without another reservation or plaintext persistence", async () => {
    const created = await sessions.createSession(
      principal("reconnect-owner"),
      "classic_100",
      "create:reconnect-owner",
      new Date("2026-08-11T18:00:00.000Z"),
    );
    const first = await sessions.reconnectTicket(
      principal("reconnect-owner"),
      created.session.gameId,
      "reconnect:owner",
      new Date("2026-08-11T18:00:01.000Z"),
    );
    const replay = await sessions.reconnectTicket(
      principal("reconnect-owner"),
      created.session.gameId,
      "reconnect:owner",
      new Date("2026-08-11T18:00:02.000Z"),
    );
    assert.equal(first.admission.reservationId, created.admission.reservationId);
    assert.equal(replay.admission.playerId, created.admission.playerId);
    assert.notEqual(replay.admission.ticket, first.admission.ticket);
    const stored = await pool.query<{ token_hash: Buffer; response_snapshot: unknown }>(`
      SELECT ticket.token_hash, operation.response_snapshot
      FROM game.realtime_tickets ticket
      JOIN economy.coin_operations operation ON operation.actor_user_id = ticket.user_id
      WHERE ticket.reservation_id = $1 AND operation.operation_scope = 'reconnectTicket'
    `, [created.admission.reservationId]);
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0]?.token_hash.equals(createHash("sha256").update(replay.admission.ticket).digest()), true);
    assert.equal(JSON.stringify(stored.rows[0]?.response_snapshot).includes(replay.admission.ticket), false);
    const counts = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM economy.coin_reservations WHERE game_session_id = $1) AS reservations,
        (SELECT count(*)::int FROM economy.coin_operations
         WHERE actor_user_id = (SELECT creator_user_id FROM game.game_sessions WHERE id = $1)
           AND operation_scope = 'reconnectTicket') AS reconnect_operations
    `, [created.session.gameId]);
    assert.deepEqual(counts.rows, [{ reservations: 1, reconnect_operations: 1 }]);
  });

  it("releases and cancels free sessions without manufacturing ledger entries", async () => {
    const releasedSession = await sessions.createSession(principal("free-release-owner"), "free", "create:free-release-owner");
    await sessions.joinSession(principal("free-release-player"), releasedSession.session.gameId, "join:free-release-player");
    const released = await sessions.releaseJoinIntent(
      principal("free-release-player"),
      releasedSession.session.gameId,
      "release:free-player",
    );

    const cancelledSession = await sessions.createSession(principal("free-cancel-owner"), "free", "create:free-cancel-owner");
    await sessions.joinSession(principal("free-cancel-player"), cancelledSession.session.gameId, "join:free-cancel-player");
    const cancelled = await sessions.cancelSession(
      principal("free-cancel-owner"),
      cancelledSession.session.gameId,
      "cancel:free-owner",
    );
    const result = await pool.query(`
      SELECT operation.id, count(entry.id)::int AS entries
      FROM economy.coin_operations operation
      LEFT JOIN economy.coin_ledger_entries entry ON entry.operation_id = operation.id
      WHERE operation.id = ANY($1::varchar[])
      GROUP BY operation.id
      ORDER BY operation.id
    `, [[released.operationId, cancelled.operationId].sort()]);
    assert.deepEqual(result.rows.map((row) => row.entries), [0, 0]);
  });

  it("finalizes durable room leave and cancel facts from exact server bindings", async () => {
    const leaveSession = await sessions.createSession(
      principal("room-finalize-leave-owner"),
      "classic_100",
      "create:room-finalize-leave-owner",
    );
    const joiner = await sessions.joinSession(
      principal("room-finalize-leave-player"),
      leaveSession.session.gameId,
      "join:room-finalize-leave-player",
    );
    const leaveRequest = {
      contractVersion: 1 as const,
      roomId: leaveSession.session.roomId,
      playerId: joiner.admission.playerId,
      reservationId: joiner.admission.reservationId,
      action: "leave" as const,
    };
    await pool.query(`
      INSERT INTO realtime.room_leases
        (room_id, game_session_id, instance_id, lease_until, fencing_token)
      VALUES ($1, $2, 'room-finalize-leave', now() + interval '1 minute', 1)
    `, [leaveSession.session.roomId, leaveSession.session.gameId]);
    await assert.rejects(
      sessions.releaseJoinIntent(
        principal("room-finalize-leave-player"),
        leaveSession.session.gameId,
        "room-finalize:public-leave",
      ),
      (error: unknown) => apiCode(error) === "SESSION_NOT_OPEN",
    );
    await assert.rejects(
      sessions.finalizeRoomCommand(leaveSession.session.gameId, {
        ...leaveRequest,
        playerId: leaveSession.admission.playerId,
      }, "room-finalize:forged"),
      (error: unknown) => apiCode(error) === "SESSION_FORBIDDEN",
    );
    const left = await sessions.finalizeRoomCommand(
      leaveSession.session.gameId,
      leaveRequest,
      "room-finalize:leave",
    );
    const leftReplay = await sessions.finalizeRoomCommand(
      leaveSession.session.gameId,
      leaveRequest,
      "room-finalize:leave",
    );
    assert.deepEqual(leftReplay, left);

    const cancelSession = await sessions.createSession(
      principal("room-finalize-cancel-owner"),
      "classic_100",
      "create:room-finalize-cancel-owner",
    );
    await sessions.joinSession(
      principal("room-finalize-cancel-player"),
      cancelSession.session.gameId,
      "join:room-finalize-cancel-player",
    );
    await pool.query(`
      INSERT INTO realtime.room_leases
        (room_id, game_session_id, instance_id, lease_until, fencing_token)
      VALUES ($1, $2, 'room-finalize-cancel', now() + interval '1 minute', 1)
    `, [cancelSession.session.roomId, cancelSession.session.gameId]);
    await assert.rejects(
      sessions.cancelSession(
        principal("room-finalize-cancel-owner"),
        cancelSession.session.gameId,
        "room-finalize:public-cancel",
      ),
      (error: unknown) => apiCode(error) === "SESSION_NOT_OPEN",
    );
    const cancelled = await sessions.finalizeRoomCommand(cancelSession.session.gameId, {
      contractVersion: 1,
      roomId: cancelSession.session.roomId,
      playerId: cancelSession.admission.playerId,
      reservationId: cancelSession.admission.reservationId,
      action: "cancel",
    }, "room-finalize:cancel");
    assert.equal(cancelled.committed, true);

    const state = await pool.query(`
      SELECT session.id, session.lifecycle,
        count(reservation.id) FILTER (WHERE reservation.status = 'reserved')::int AS reserved,
        count(DISTINCT player.player_id)::int AS players
      FROM game.game_sessions session
      LEFT JOIN economy.coin_reservations reservation ON reservation.game_session_id = session.id
      LEFT JOIN game.session_players player ON player.game_session_id = session.id
      WHERE session.id = ANY($1::varchar[])
      GROUP BY session.id, session.lifecycle ORDER BY session.id
    `, [[leaveSession.session.gameId, cancelSession.session.gameId]]);
    assert.deepEqual(state.rows.map((row) => ({ lifecycle: row.lifecycle, reserved: row.reserved, players: row.players }))
      .sort((left, right) => left.lifecycle.localeCompare(right.lifecycle)), [
      { lifecycle: "open", reserved: 1, players: 1 },
      { lifecycle: "cancelled", reserved: 0, players: 0 },
    ].sort((left, right) => left.lifecycle.localeCompare(right.lifecycle)));
  });

  it("serializes cancellation against admission without leaving a stranded reservation", async () => {
    const created = await sessions.createSession(principal("race-cancel-owner"), "classic_100", "create:race-cancel-owner");
    const attempts = await Promise.allSettled([
      sessions.cancelSession(principal("race-cancel-owner"), created.session.gameId, "cancel:race-owner"),
      sessions.joinSession(principal("race-cancel-player"), created.session.gameId, "join:race-player"),
    ]);
    assert.equal(attempts[0]?.status, "fulfilled");
    if (attempts[1]?.status === "rejected") {
      assert.equal(apiCode(attempts[1].reason), "SESSION_NOT_OPEN");
    }
    const invariant = await pool.query(`
      SELECT
        session.lifecycle,
        count(reservation.id) FILTER (WHERE reservation.status = 'reserved')::int AS active_reservations,
        count(player.player_id)::int AS players
      FROM game.game_sessions session
      LEFT JOIN economy.coin_reservations reservation ON reservation.game_session_id = session.id
      LEFT JOIN game.session_players player ON player.game_session_id = session.id
      WHERE session.id = $1
      GROUP BY session.lifecycle
    `, [created.session.gameId]);
    assert.deepEqual(invariant.rows, [{ lifecycle: "cancelled", active_reservations: 0, players: 0 }]);
    const racer = await economy.provisionPrincipal(principal("race-cancel-player"));
    assert.equal(BigInt(racer.balance.availableCoin) + BigInt(racer.balance.reservedCoin), 1000n);
    assert.equal(racer.balance.reservedCoin, "0");
  });

  it("does not release active-game reservations", async () => {
    const created = await sessions.createSession(
      principal("active-owner"),
      "classic_100",
      "create:active-owner",
      new Date("2026-08-11T19:00:00.000Z"),
    );
    await sessions.joinSession(
      principal("active-player"),
      created.session.gameId,
      "join:active-player",
      new Date("2026-08-11T19:00:01.000Z"),
    );
    await pool.query(
      "UPDATE game.game_sessions SET lifecycle = 'active', state_version = 1, started_at = $2 WHERE id = $1",
      [created.session.gameId, new Date("2026-08-11T19:00:02.000Z")],
    );
    await assert.rejects(
      sessions.releaseJoinIntent(principal("active-player"), created.session.gameId, "release:active-player"),
      (error: unknown) => apiCode(error) === "SESSION_NOT_OPEN",
    );
    await assert.rejects(
      sessions.cancelSession(principal("active-owner"), created.session.gameId, "cancel:active-owner"),
      (error: unknown) => apiCode(error) === "SESSION_NOT_OPEN",
    );
    const state = await pool.query(`
      SELECT
        count(*) FILTER (WHERE status = 'reserved')::int AS reservations,
        sum(amount)::text AS reserved_amount,
        (SELECT count(*)::int FROM game.session_players WHERE game_session_id = $1) AS players
      FROM economy.coin_reservations
      WHERE game_session_id = $1
    `, [created.session.gameId]);
    assert.deepEqual(state.rows, [{ reservations: 2, reserved_amount: "200", players: 2 }]);
  });

  it("deduplicates 20-way release, cancellation, and reconnect retries", async () => {
    const releaseSession = await sessions.createSession(principal("retry-release-owner"), "classic_100", "create:retry-release-owner");
    await sessions.joinSession(principal("retry-release-player"), releaseSession.session.gameId, "join:retry-release-player");
    const releases = await Promise.all(Array.from({ length: 20 }, () => sessions.releaseJoinIntent(
      principal("retry-release-player"),
      releaseSession.session.gameId,
      "release:retry-player",
    )));
    assert.equal(new Set(releases.map((response) => response.operationId)).size, 1);

    const cancelSession = await sessions.createSession(principal("retry-cancel-owner"), "classic_100", "create:retry-cancel-owner");
    await sessions.joinSession(principal("retry-cancel-player"), cancelSession.session.gameId, "join:retry-cancel-player");
    const cancellations = await Promise.all(Array.from({ length: 20 }, () => sessions.cancelSession(
      principal("retry-cancel-owner"),
      cancelSession.session.gameId,
      "cancel:retry-owner",
    )));
    assert.equal(new Set(cancellations.map((response) => response.operationId)).size, 1);

    const reconnectSession = await sessions.createSession(principal("retry-reconnect-owner"), "classic_100", "create:retry-reconnect-owner");
    const reconnects = await Promise.all(Array.from({ length: 20 }, () => sessions.reconnectTicket(
      principal("retry-reconnect-owner"),
      reconnectSession.session.gameId,
      "reconnect:retry-owner",
    )));
    assert.equal(new Set(reconnects.map((response) => response.admission.ticket)).size, 20);
    const counts = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM economy.coin_operations
         WHERE operation_scope = 'releaseJoinIntent' AND idempotency_key = 'release:retry-player') AS release_operations,
        (SELECT count(*)::int FROM economy.coin_operations
         WHERE operation_scope = 'cancelSession' AND idempotency_key = 'cancel:retry-owner') AS cancel_operations,
        (SELECT count(*)::int FROM economy.coin_operations
         WHERE operation_scope = 'reconnectTicket' AND idempotency_key = 'reconnect:retry-owner') AS reconnect_operations,
        (SELECT count(*)::int FROM game.realtime_tickets
         WHERE reservation_id = $1 AND consumed_at IS NULL) AS unused_tickets
    `, [reconnectSession.admission.reservationId]);
    assert.deepEqual(counts.rows, [{
      release_operations: 1,
      cancel_operations: 1,
      reconnect_operations: 1,
      unused_tickets: 1,
    }]);
  });

  it("consumes one-use tickets with exact binding, replay, and expiry semantics", async () => {
    const created = await sessions.createSession(
      principal("consume-owner"),
      "classic_100",
      "create:consume-owner",
      new Date("2026-08-11T20:00:00.000Z"),
    );
    const joined = await sessions.joinSession(
      principal("consume-player"),
      created.session.gameId,
      "join:consume-player",
      new Date("2026-08-11T20:00:01.000Z"),
    );
    const creatorConsume = await internalSessions.consumeTicket({
      contractVersion: 1,
      ticket: created.admission.ticket,
      gameId: created.session.gameId,
      roomId: created.session.roomId,
      roomInstanceId: "room-instance-clock-floor",
    }, "consume:creator:clock-floor", new Date("2026-08-11T19:59:59.000Z"));
    assert.equal(creatorConsume.reused, false);
    const creatorTicketTimestamp = await pool.query<{ ordered: boolean }>(
      `SELECT consumed_at >= created_at AS ordered
       FROM game.realtime_tickets WHERE reservation_id = $1`,
      [created.admission.reservationId],
    );
    assert.equal(creatorTicketTimestamp.rows[0]?.ordered, true);
    const request = {
      contractVersion: 1 as const,
      ticket: joined.admission.ticket,
      gameId: created.session.gameId,
      roomId: created.session.roomId,
      roomInstanceId: "room-instance-1",
    };
    const consumed = await internalSessions.consumeTicket(request, "consume:player", new Date("2026-08-11T20:00:02.000Z"));
    const retry = await internalSessions.consumeTicket(request, "consume:player", new Date("2026-08-11T20:00:03.000Z"));
    assert.deepEqual(retry, consumed);
    assert.equal(consumed.reused, false);
    assert.equal(consumed.seatIndex, 1);
    const reused = await internalSessions.consumeTicket(request, "consume:player:reattach", new Date("2026-08-11T20:00:04.000Z"));
    assert.equal(reused.reused, true);
    await assert.rejects(
      internalSessions.consumeTicket(
        { ...request, roomInstanceId: "room-instance-2" },
        "consume:player:wrong-instance",
        new Date("2026-08-11T20:00:05.000Z"),
      ),
      (error: unknown) => apiCode(error) === "TICKET_REPLAYED",
    );

    const other = await sessions.createSession(principal("consume-other-owner"), "classic_100", "create:consume-other-owner");
    await assert.rejects(
      internalSessions.consumeTicket(
        { ...request, gameId: other.session.gameId, roomId: other.session.roomId },
        "consume:player:wrong-binding",
      ),
      (error: unknown) => apiCode(error) === "TICKET_INVALID",
    );
    const expiring = await sessions.joinSession(
      principal("consume-expired"),
      created.session.gameId,
      "join:consume-expired",
      new Date("2026-08-11T20:00:06.000Z"),
    );
    await assert.rejects(
      internalSessions.consumeTicket({
        contractVersion: 1,
        ticket: expiring.admission.ticket,
        gameId: created.session.gameId,
        roomId: created.session.roomId,
        roomInstanceId: "room-instance-1",
      }, "consume:expired", new Date("2026-08-11T20:01:06.000Z")),
      (error: unknown) => apiCode(error) === "TICKET_EXPIRED",
    );
    const stored = await pool.query<{ response_snapshot: unknown }>(`
      SELECT operation.response_snapshot
      FROM economy.coin_operations operation
      WHERE operation.operation_scope = 'consumeTicket'
        AND operation.idempotency_key IN ('consume:player', 'consume:player:reattach')
      ORDER BY operation.idempotency_key
    `);
    assert.equal(stored.rows.length, 2);
    assert.equal(JSON.stringify(stored.rows).includes(joined.admission.ticket), false);
    await sessions.releaseJoinIntent(
      principal("consume-player"),
      created.session.gameId,
      "release:consumed-player",
      new Date("2026-08-11T20:01:07.000Z"),
    );
    await assert.rejects(
      internalSessions.consumeTicket(request, "consume:player", new Date("2026-08-11T20:01:08.000Z")),
      (error: unknown) => apiCode(error) === "RESERVATION_NOT_FOUND",
    );
  });

  it("materializes one coherent bootstrap snapshot across a concurrent lifecycle transition", async () => {
    const created = await sessions.createSession(
      principal("bootstrap-race-owner"),
      "classic_100",
      "create:bootstrap-race-owner",
      new Date("2026-08-11T20:00:00.000Z"),
    );
    const joined = await sessions.joinSession(
      principal("bootstrap-race-player"),
      created.session.gameId,
      "join:bootstrap-race-player",
      new Date("2026-08-11T20:00:01.000Z"),
    );
    const transitionClient = await pool.connect();
    let transactionOpen = false;
    let bootstrapCompleted = false;
    let bootstrapPromise: Promise<Awaited<ReturnType<InternalSessionService["bootstrap"]>>> | undefined;
    try {
      await transitionClient.query("BEGIN");
      transactionOpen = true;
      await transitionClient.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [created.session.gameId],
      );
      await transitionClient.query(
        `
          UPDATE game.game_sessions
          SET lifecycle = 'active', state_version = 1, started_at = $2
          WHERE id = $1
        `,
        [created.session.gameId, new Date("2026-08-11T20:00:02.000Z")],
      );

      bootstrapPromise = internalSessions.bootstrap(created.session.gameId).finally(() => {
        bootstrapCompleted = true;
      });
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(bootstrapCompleted, false);

      await transitionClient.query("COMMIT");
      transactionOpen = false;
      const bootstrap = await bootstrapPromise;
      assert.equal(bootstrap.lifecycle, "active");
      assert.equal(bootstrap.stateVersion, 1);
      assert.equal(bootstrap.startedAtMs, Date.parse("2026-08-11T20:00:02.000Z"));
      assert.deepEqual(bootstrap.players, [
        {
          playerId: created.admission.playerId,
          seatIndex: 0,
          joinedAtMs: Date.parse("2026-08-11T20:00:00.000Z"),
        },
        {
          playerId: joined.admission.playerId,
          seatIndex: 1,
          joinedAtMs: Date.parse("2026-08-11T20:00:01.000Z"),
        },
      ]);
    } finally {
      if (transactionOpen) await transitionClient.query("ROLLBACK");
      transitionClient.release();
      if (bootstrapPromise !== undefined) await bootstrapPromise.catch(() => undefined);
    }
  });

  it("starts only after every admitted player consumed a ticket and supports active reconnect", async () => {
    const created = await sessions.createSession(
      principal("start-owner"),
      "classic_100",
      "create:start-owner",
      new Date("2026-08-11T21:00:00.000Z"),
    );
    const joined = await sessions.joinSession(
      principal("start-player"),
      created.session.gameId,
      "join:start-player",
      new Date("2026-08-11T21:00:01.000Z"),
    );
    await assert.rejects(
      internalSessions.markStarted(created.session.gameId, created.session.roomId, 1, "start:not-ready"),
      (error: unknown) => apiCode(error) === "SESSION_NOT_READY",
    );
    await internalSessions.consumeTicket({
      contractVersion: 1,
      ticket: created.admission.ticket,
      gameId: created.session.gameId,
      roomId: created.session.roomId,
      roomInstanceId: "start-room-instance",
    }, "consume:start-owner", new Date("2026-08-11T21:00:02.000Z"));
    await internalSessions.consumeTicket({
      contractVersion: 1,
      ticket: joined.admission.ticket,
      gameId: created.session.gameId,
      roomId: created.session.roomId,
      roomInstanceId: "start-room-instance",
    }, "consume:start-player", new Date("2026-08-11T21:00:02.000Z"));
    await assert.rejects(
      internalSessions.markStarted(created.session.gameId, "wrong-room", 1, "start:wrong-room"),
      (error: unknown) => apiCode(error) === "REQUEST_INVALID",
    );
    const started = await internalSessions.markStarted(
      created.session.gameId,
      created.session.roomId,
      1,
      "start:ready",
      new Date("2026-08-11T21:00:03.000Z"),
    );
    const retry = await internalSessions.markStarted(
      created.session.gameId,
      created.session.roomId,
      1,
      "start:ready",
      new Date("2026-08-11T21:00:04.000Z"),
    );
    assert.deepEqual(retry, started);
    await assert.rejects(
      internalSessions.markStarted(created.session.gameId, created.session.roomId, 2, "start:ready"),
      (error: unknown) => apiCode(error) === "IDEMPOTENCY_CONFLICT",
    );
    const state = await pool.query(
      "SELECT lifecycle, state_version::text, started_at FROM game.game_sessions WHERE id = $1",
      [created.session.gameId],
    );
    assert.equal(state.rows[0]?.lifecycle, "active");
    assert.equal(state.rows[0]?.state_version, "1");
    assert.equal(new Date(state.rows[0]?.started_at as string).getTime(), Date.parse("2026-08-11T21:00:03.000Z"));
    const activeBootstrap = await internalSessions.bootstrap(created.session.gameId);
    assert.equal(activeBootstrap.lifecycle, "active");
    assert.equal(activeBootstrap.stateVersion, 1);
    assert.equal(activeBootstrap.startedAtMs, Date.parse("2026-08-11T21:00:03.000Z"));
    assert.deepEqual(activeBootstrap.players, [
      { playerId: created.admission.playerId, seatIndex: 0, joinedAtMs: Date.parse("2026-08-11T21:00:00.000Z") },
      { playerId: joined.admission.playerId, seatIndex: 1, joinedAtMs: Date.parse("2026-08-11T21:00:01.000Z") },
    ]);

    const reconnect = await sessions.reconnectTicket(
      principal("start-player"),
      created.session.gameId,
      "reconnect:active-player",
      new Date("2026-08-11T21:00:05.000Z"),
    );
    const activeConsume = await internalSessions.consumeTicket({
      contractVersion: 1,
      ticket: reconnect.admission.ticket,
      gameId: created.session.gameId,
      roomId: created.session.roomId,
      roomInstanceId: "start-room-instance-2",
    }, "consume:active-player", new Date("2026-08-11T21:00:06.000Z"));
    assert.equal(activeConsume.playerId, joined.admission.playerId);
    assert.equal(activeConsume.seatIndex, 1);
  });
});
