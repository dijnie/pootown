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
import { IdentityService } from "../src/identity/identity.service";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let economy: EconomyService;
let sessions: GameSessionsService;

function principal(id: string): AuthenticatedPrincipal {
  return { privyDid: `did:privy:${id}`, privySessionId: `session_${id}` };
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
    economy = new EconomyService(pool, config, new IdentityService());
    sessions = new GameSessionsService(pool, config, economy);
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

  it("atomically creates creator reserve, seat, and hash-only ticket with replay rotation", async () => {
    const first = await sessions.createSession(
      principal("creator"),
      "classic_100",
      "create:creator:1",
      new Date("2026-08-11T14:00:00.000Z"),
    );
    const replay = await sessions.createSession(
      principal("creator"),
      "classic_100",
      "create:creator:1",
      new Date("2026-08-11T14:00:01.000Z"),
    );
    assert.equal(replay.session.gameId, first.session.gameId);
    assert.equal(replay.admission.reservationId, first.admission.reservationId);
    assert.equal(replay.admission.playerId, first.admission.playerId);
    assert.notEqual(replay.admission.ticket, first.admission.ticket);
    assert.deepEqual(replay.session.players, [{ playerId: first.admission.playerId, seatIndex: 0 }]);

    const state = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM game.game_sessions WHERE id = $1) AS sessions,
        (SELECT count(*)::int FROM economy.coin_reservations WHERE game_session_id = $1) AS reservations,
        (SELECT count(*)::int FROM game.session_players WHERE game_session_id = $1) AS players,
        (SELECT count(*)::int FROM game.realtime_tickets WHERE game_session_id = $1) AS tickets,
        (SELECT count(*)::int FROM economy.coin_operations WHERE operation_scope = 'createSession') AS operations
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
      SET consumed_at = '2026-08-11T14:00:01.000Z', consumed_by_room_instance = 'room-instance-1'
      WHERE game_session_id = $1
    `, [first.session.gameId]);
    const consumedReplay = await sessions.createSession(
      principal("creator"),
      "classic_100",
      "create:creator:1",
      new Date("2026-08-11T14:00:01.000Z"),
    );
    assert.equal(consumedReplay.admission.playerId, first.admission.playerId);
    assert.equal(consumedReplay.admission.reservationId, first.admission.reservationId);
    const sameTimestampReplay = await sessions.createSession(
      principal("creator"),
      "classic_100",
      "create:creator:1",
      new Date("2026-08-11T14:00:01.000Z"),
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
    await spendTo(contender.user.userId, 100n, new Date("2026-08-11T15:00:00.000Z"));

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
         WHERE users.privy_did = 'did:privy:too-poor') AS sessions,
        (SELECT count(*)::int FROM economy.coin_operations operation
         JOIN identity.users users ON users.id = operation.actor_user_id
         WHERE users.privy_did = 'did:privy:too-poor' AND operation.operation_scope = 'createSession') AS operations
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
});
