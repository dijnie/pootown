import assert from "node:assert/strict";
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
import { ReconciliationService } from "../src/internal/reconciliation.service";

const WAITING_TTL_MS = 900_000;
const TICKET_GRACE_MS = 30_000;
const RECOVERY_GRACE_MS = 120_000;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let sessions: GameSessionsService;
let internalSessions: InternalSessionService;
let settlements: InternalSettlementService;
let reconciliation: ReconciliationService;

function principal(id: string): AuthenticatedPrincipal {
  return { privyDid: `did:privy:${id}`, privySessionId: `session_${id}` };
}

async function startTwoPlayerGame(prefix: string, now: Date): Promise<{
  readonly gameId: string;
  readonly roomId: RoomId;
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
  await internalSessions.consumeTicket({
    contractVersion: 1,
    ticket: creator.admission.ticket,
    gameId: creator.session.gameId,
    roomId: creator.session.roomId,
    roomInstanceId,
  }, `${prefix}:consume:creator`, new Date(now.getTime() + 2));
  const winner = await internalSessions.consumeTicket({
    contractVersion: 1,
    ticket: joiner.admission.ticket,
    gameId: creator.session.gameId,
    roomId: creator.session.roomId,
    roomInstanceId,
  }, `${prefix}:consume:joiner`, new Date(now.getTime() + 3));
  await internalSessions.markStarted(
    creator.session.gameId,
    creator.session.roomId,
    1,
    `${prefix}:started`,
    new Date(now.getTime() + 4),
  );
  return { gameId: creator.session.gameId, roomId: creator.session.roomId, winnerPlayerId: winner.playerId };
}

async function insertLiveCheckpoint(
  game: { readonly gameId: string; readonly roomId: RoomId },
  now: Date,
  leaseUntil = new Date(now.getTime() + 60_000),
): Promise<void> {
  await pool.query(
    `
      INSERT INTO realtime.room_leases
        (room_id, game_session_id, instance_id, lease_until, fencing_token, updated_at)
      VALUES ($1, $2, 'reconciliation-test', $3, 1, $4)
    `,
    [game.roomId, game.gameId, leaseUntil, now],
  );
  await pool.query(
    `
      INSERT INTO realtime.room_checkpoints
        (room_id, game_session_id, schema_version, state_version, fencing_token,
         checksum, private_state, updated_at)
      VALUES ($1, $2, 1, 1, 1, decode(repeat('42', 32), 'hex'), '{"state":"active"}', $3)
    `,
    [game.roomId, game.gameId, now],
  );
}

describe("session reconciliation", { timeout: 120_000 }, () => {
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
      WAITING_SESSION_TTL_MS: WAITING_TTL_MS,
      TICKET_RELEASE_GRACE_MS: TICKET_GRACE_MS,
      ACTIVE_RECOVERY_GRACE_MS: RECOVERY_GRACE_MS,
    });
    const economy = new EconomyService(pool, config, new IdentityService());
    sessions = new GameSessionsService(pool, config, economy);
    internalSessions = new InternalSessionService(pool);
    settlements = new InternalSettlementService(pool);
    reconciliation = new ReconciliationService(pool, config, sessions, settlements);
    await pool.query(`
      INSERT INTO game.game_definitions
        (id, policy_version, display_name, maximum_players, entry_coin,
         time_limit_ms, policy_snapshot, policy_hash)
      VALUES ('classic_100', 1, 'Classic', 4, 100, 3600000,
              '{"rules":"classic"}', decode(repeat('81', 32), 'hex'))
    `);
  });

  after(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("cancels an expired waiting session at the exact boundary and refunds once", async () => {
    const createdAt = new Date("2026-08-11T20:00:00.000Z");
    const created = await sessions.createSession(principal("waiting"), "classic_100", "waiting:create", createdAt);
    const before = await reconciliation.run(new Date(createdAt.getTime() + WAITING_TTL_MS - 1));
    assert.equal(before.waitingSessionsCancelled, 0);

    const atBoundary = await Promise.all(
      Array.from({ length: 20 }, () => reconciliation.run(new Date(createdAt.getTime() + WAITING_TTL_MS))),
    );
    assert.equal(atBoundary.reduce((sum, result) => sum + result.waitingSessionsCancelled, 0), 1);
    assert.equal(atBoundary.filter((result) => result.alreadyRunning).length > 0, true);
    const repeated = await reconciliation.run(new Date(createdAt.getTime() + WAITING_TTL_MS + 1));
    assert.equal(repeated.waitingSessionsCancelled, 0);

    const state = await pool.query(`
      SELECT
        (SELECT lifecycle FROM game.game_sessions WHERE id = $1) AS lifecycle,
        (SELECT status FROM economy.coin_reservations WHERE game_session_id = $1) AS reservation_status,
        (SELECT available_coin::text FROM economy.coin_accounts
          WHERE user_id = (SELECT creator_user_id FROM game.game_sessions WHERE id = $1)) AS available_coin,
        (SELECT reserved_coin::text FROM economy.coin_accounts
          WHERE user_id = (SELECT creator_user_id FROM game.game_sessions WHERE id = $1)) AS reserved_coin,
        (SELECT count(*)::int FROM economy.coin_operations
          WHERE operation_scope = 'cancelSession' AND idempotency_key = $2) AS operations
    `, [created.session.gameId, `reconcile:waiting:${created.session.gameId}`]);
    assert.deepEqual(state.rows, [{
      lifecycle: "cancelled",
      reservation_status: "released",
      available_coin: "1000",
      reserved_coin: "0",
      operations: 1,
    }]);
  });

  it("releases only an expired unused admission without a durable seat after grace", async () => {
    const createdAt = new Date("2026-08-11T21:00:00.000Z");
    const created = await sessions.createSession(principal("ticket-owner"), "classic_100", "ticket:create", createdAt);
    const joined = await sessions.joinSession(
      principal("ticket-joiner"),
      created.session.gameId,
      "ticket:join",
      new Date(createdAt.getTime() + 1),
    );
    await pool.query("DELETE FROM game.session_players WHERE reservation_id = $1", [joined.admission.reservationId]);
    const expiry = new Date(createdAt.getTime() + 2_000);
    await pool.query(
      "UPDATE game.realtime_tickets SET expires_at = $2 WHERE reservation_id = $1 AND consumed_at IS NULL",
      [joined.admission.reservationId, expiry],
    );

    const before = await reconciliation.run(new Date(expiry.getTime() + TICKET_GRACE_MS - 1));
    assert.equal(before.expiredAdmissionsReleased, 0);
    const atBoundary = await reconciliation.run(new Date(expiry.getTime() + TICKET_GRACE_MS));
    assert.equal(atBoundary.expiredAdmissionsReleased, 1);
    const state = await pool.query(`
      SELECT
        (SELECT status FROM economy.coin_reservations WHERE id = $1) AS reservation_status,
        (SELECT status FROM game.join_intents WHERE reservation_id = $1) AS intent_status,
        (SELECT count(*)::int FROM game.session_players WHERE reservation_id = $1) AS seats,
        (SELECT available_coin::text FROM economy.coin_accounts
          WHERE user_id = (SELECT user_id FROM economy.coin_reservations WHERE id = $1)) AS available_coin
    `, [joined.admission.reservationId]);
    assert.deepEqual(state.rows, [{ reservation_status: "released", intent_status: "released", seats: 0, available_coin: "1000" }]);

    const raceJoin = await sessions.joinSession(
      principal("ticket-race"),
      created.session.gameId,
      "ticket:race:join",
      new Date(createdAt.getTime() + 3),
    );
    await pool.query("DELETE FROM game.session_players WHERE reservation_id = $1", [raceJoin.admission.reservationId]);
    const raceExpiry = new Date(createdAt.getTime() + 4_000);
    await pool.query(
      "UPDATE game.realtime_tickets SET expires_at = $2 WHERE reservation_id = $1 AND consumed_at IS NULL",
      [raceJoin.admission.reservationId, raceExpiry],
    );
    const [consumeResult, cleanupResult] = await Promise.allSettled([
      internalSessions.consumeTicket({
        contractVersion: 1,
        ticket: raceJoin.admission.ticket,
        gameId: created.session.gameId,
        roomId: created.session.roomId,
        roomInstanceId: "ticket-race-room",
      }, "ticket:race:consume", new Date(raceExpiry.getTime() - 1)),
      reconciliation.run(new Date(raceExpiry.getTime() + TICKET_GRACE_MS)),
    ]);
    assert.equal(cleanupResult.status, "fulfilled");
    const raceState = await pool.query<{ reservation_status: string; seats: number; consumed: number }>(`
      SELECT
        (SELECT status FROM economy.coin_reservations WHERE id = $1) AS reservation_status,
        (SELECT count(*)::int FROM game.session_players WHERE reservation_id = $1 AND active = true) AS seats,
        (SELECT count(*)::int FROM game.realtime_tickets WHERE reservation_id = $1 AND consumed_at IS NOT NULL) AS consumed
    `, [raceJoin.admission.reservationId]);
    if (consumeResult.status === "fulfilled") {
      assert.deepEqual(raceState.rows, [{ reservation_status: "reserved", seats: 1, consumed: 1 }]);
      await sessions.releaseJoinIntent(
        principal("ticket-race"),
        created.session.gameId,
        "ticket:race:cleanup",
        new Date(raceExpiry.getTime() + TICKET_GRACE_MS + 1),
      );
    } else {
      assert.deepEqual(raceState.rows, [{ reservation_status: "released", seats: 0, consumed: 0 }]);
    }
    await sessions.cancelSession(
      principal("ticket-owner"),
      created.session.gameId,
      "ticket:cleanup",
      new Date(raceExpiry.getTime() + TICKET_GRACE_MS + 2),
    );
  });

  it("marks only stale active sessions without a live durable checkpoint for recovery", async () => {
    const startedAt = new Date("2026-08-11T22:00:00.000Z");
    const missing = await startTwoPlayerGame("missing-runtime", startedAt);
    const healthy = await startTwoPlayerGame("healthy-runtime", new Date(startedAt.getTime() + 10));
    const recentlyExpired = await startTwoPlayerGame("recently-expired-runtime", new Date(startedAt.getTime() + 20));
    const runAt = new Date(startedAt.getTime() + 10 + 4 + RECOVERY_GRACE_MS);
    await insertLiveCheckpoint(healthy, runAt);
    const recentLeaseExpiry = new Date(runAt.getTime() - 1);
    await insertLiveCheckpoint(recentlyExpired, new Date(runAt.getTime() - 60_000), recentLeaseExpiry);

    const result = await reconciliation.run(runAt);
    assert.equal(result.sessionsMarkedForRecovery, 1);
    const states = await pool.query<{ id: string; lifecycle: string; reserved: string }>(
      `
        SELECT session.id, session.lifecycle, sum(reservation.amount)::text AS reserved
        FROM game.game_sessions session
        JOIN economy.coin_reservations reservation ON reservation.game_session_id = session.id
        WHERE session.id = ANY($1::varchar[])
        GROUP BY session.id, session.lifecycle ORDER BY session.id
      `,
      [[missing.gameId, healthy.gameId, recentlyExpired.gameId]],
    );
    assert.equal(states.rows.find((row) => row.id === missing.gameId)?.lifecycle, "recovery_required");
    assert.equal(states.rows.find((row) => row.id === missing.gameId)?.reserved, "200");
    assert.equal(states.rows.find((row) => row.id === healthy.gameId)?.lifecycle, "active");
    assert.equal(states.rows.find((row) => row.id === recentlyExpired.gameId)?.lifecycle, "active");
    const lateProofAt = new Date(runAt.getTime() + 1);
    await pool.query(
      `
        INSERT INTO realtime.room_leases
          (room_id, game_session_id, instance_id, lease_until, fencing_token, updated_at)
        VALUES ($1, $2, 'late-terminal-runtime', $3, 1, $4)
      `,
      [missing.roomId, missing.gameId, new Date(lateProofAt.getTime() + 60_000), lateProofAt],
    );
    await pool.query(
      `
        INSERT INTO realtime.terminal_proofs
          (game_session_id, room_id, state_version, checkpoint_checksum,
           winner_player_id, end_reason, committed_at)
        VALUES ($1, $2, 9, decode(repeat('63', 32), 'hex'), $3, 'lastPlayerStanding', $4)
      `,
      [missing.gameId, missing.roomId, missing.winnerPlayerId, lateProofAt],
    );
    const atEvidenceBoundary = await reconciliation.run(new Date(recentLeaseExpiry.getTime() + RECOVERY_GRACE_MS));
    assert.equal(atEvidenceBoundary.sessionsMarkedForRecovery, 0);
    assert.equal(atEvidenceBoundary.offlineSessionsAborted, 1);
    assert.equal(atEvidenceBoundary.terminalSettlementsCommitted, 1);
    const expiredState = await pool.query<{ lifecycle: string }>(
      "SELECT lifecycle FROM game.game_sessions WHERE id = $1",
      [recentlyExpired.gameId],
    );
    assert.deepEqual(expiredState.rows, [{ lifecycle: "settled" }]);
    await settlements.abort(
      healthy.gameId,
      { contractVersion: 1, reason: "operatorDecision" },
      "healthy-runtime:test-cleanup",
      new Date(runAt.getTime() + 1),
    );
  });

  it("settles a durable terminal proof before recovery and remains idempotent", async () => {
    const startedAt = new Date("2026-08-11T23:00:00.000Z");
    const game = await startTwoPlayerGame("terminal", startedAt);
    const proofAt = new Date(startedAt.getTime() + 5);
    await pool.query(
      `
        INSERT INTO realtime.room_leases
          (room_id, game_session_id, instance_id, lease_until, fencing_token, updated_at)
        VALUES ($1, $2, 'terminal-runtime', $3, 1, $4)
      `,
      [game.roomId, game.gameId, new Date(proofAt.getTime() + 60_000), proofAt],
    );
    await pool.query(
      `
        INSERT INTO realtime.terminal_proofs
          (game_session_id, room_id, state_version, checkpoint_checksum,
           winner_player_id, end_reason, committed_at)
        VALUES ($1, $2, 9, decode(repeat('91', 32), 'hex'), $3, 'lastPlayerStanding', $4)
      `,
      [game.gameId, game.roomId, game.winnerPlayerId, proofAt],
    );

    const result = await reconciliation.run(new Date(startedAt.getTime() + RECOVERY_GRACE_MS + 4));
    assert.equal(result.terminalSettlementsCommitted, 1);
    assert.equal(result.sessionsMarkedForRecovery, 0);
    const repeated = await reconciliation.run(new Date(startedAt.getTime() + RECOVERY_GRACE_MS + 5));
    assert.equal(repeated.terminalSettlementsCommitted, 0);
    const state = await pool.query(`
      SELECT
        (SELECT lifecycle FROM game.game_sessions WHERE id = $1) AS lifecycle,
        (SELECT count(*)::int FROM economy.game_settlements WHERE game_session_id = $1) AS settlements,
        (SELECT count(*)::int FROM economy.coin_reservations
          WHERE game_session_id = $1 AND status = 'captured') AS captured
    `, [game.gameId]);
    assert.deepEqual(state.rows, [{ lifecycle: "settled", settlements: 1, captured: 2 }]);
  });

  it("isolates a poisoned terminal proof and still settles later valid candidates", async () => {
    const startedAt = new Date("2026-08-12T01:00:00.000Z");
    const poisoned = await startTwoPlayerGame("poisoned-terminal", startedAt);
    const valid = await startTwoPlayerGame("valid-after-poison", new Date(startedAt.getTime() + 10));
    const poisonedProofAt = new Date(startedAt.getTime() + 20);
    const validProofAt = new Date(startedAt.getTime() + 21);
    for (const [game, proofAt, winnerPlayerId, checksumByte] of [
      [poisoned, poisonedProofAt, "forged-player", "a1"],
      [valid, validProofAt, valid.winnerPlayerId, "a2"],
    ] as const) {
      await pool.query(
        `
          INSERT INTO realtime.room_leases
            (room_id, game_session_id, instance_id, lease_until, fencing_token, updated_at)
          VALUES ($1, $2, 'poison-isolation', $3, 1, $4)
        `,
        [game.roomId, game.gameId, new Date(proofAt.getTime() + 60_000), proofAt],
      );
      await pool.query(
        `
          INSERT INTO realtime.terminal_proofs
            (game_session_id, room_id, state_version, checkpoint_checksum,
             winner_player_id, end_reason, committed_at)
          VALUES ($1, $2, 9, decode(repeat($3, 32), 'hex'), $4, 'lastPlayerStanding', $5)
        `,
        [game.gameId, game.roomId, checksumByte, winnerPlayerId, proofAt],
      );
    }

    const result = await reconciliation.run(new Date(startedAt.getTime() + 30));
    assert.equal(result.terminalSettlementsCommitted, 1);
    assert.equal(result.sessionsMarkedForRecovery, 1);
    const states = await pool.query<{ id: string; lifecycle: string }>(
      "SELECT id, lifecycle FROM game.game_sessions WHERE id = ANY($1::varchar[]) ORDER BY id",
      [[poisoned.gameId, valid.gameId]],
    );
    assert.equal(states.rows.find((row) => row.id === poisoned.gameId)?.lifecycle, "recovery_required");
    assert.equal(states.rows.find((row) => row.id === valid.gameId)?.lifecycle, "settled");
    const repeated = await reconciliation.run(new Date(startedAt.getTime() + 31));
    assert.equal(repeated.terminalSettlementsCommitted, 0);
    assert.equal(repeated.sessionsMarkedForRecovery, 0);
    await settlements.abort(
      poisoned.gameId,
      { contractVersion: 1, reason: "operatorDecision" },
      "poisoned-terminal:test-cleanup",
      new Date(startedAt.getTime() + 32),
    );
  });

  it("aborts and refunds only after every player remains offline for the full window", async () => {
    const startedAt = new Date("2026-08-12T02:00:00.000Z");
    const game = await startTwoPlayerGame("offline-abort", startedAt);
    const allOfflineAt = new Date(startedAt.getTime() + 10_000);
    const deadline = new Date(allOfflineAt.getTime() + 120_000);
    await insertLiveCheckpoint(game, allOfflineAt, new Date(deadline.getTime() + 60_000));
    await pool.query(
      `
        INSERT INTO realtime.room_presence
          (room_id, game_session_id, fencing_token, all_offline_at, abort_deadline_at, updated_at)
        VALUES ($1, $2, 1, $3, $4, $3)
      `,
      [game.roomId, game.gameId, allOfflineAt, deadline],
    );

    const before = await reconciliation.run(new Date(deadline.getTime() - 1));
    assert.equal(before.offlineSessionsAborted, 0);
    const atDeadline = await reconciliation.run(deadline);
    assert.equal(atDeadline.offlineSessionsAborted, 1);
    const repeated = await reconciliation.run(new Date(deadline.getTime() + 1));
    assert.equal(repeated.offlineSessionsAborted, 0);
    const state = await pool.query(
      `
        SELECT
          (SELECT lifecycle FROM game.game_sessions WHERE id = $1) AS lifecycle,
          (SELECT count(*)::int FROM economy.coin_reservations
            WHERE game_session_id = $1 AND status = 'released') AS released,
          (SELECT count(*)::int FROM economy.game_settlements
            WHERE game_session_id = $1 AND kind = 'aborted') AS aborted
      `,
      [game.gameId],
    );
    assert.deepEqual(state.rows, [{ lifecycle: "settled", released: 2, aborted: 1 }]);

    const crashed = await startTwoPlayerGame("offline-crash", new Date(deadline.getTime() + 10));
    const leaseExpiredAt = new Date(deadline.getTime() + 20_000);
    await insertLiveCheckpoint(crashed, new Date(leaseExpiredAt.getTime() - 1), leaseExpiredAt);
    assert.equal(
      (await reconciliation.run(new Date(leaseExpiredAt.getTime() + 119_999))).offlineSessionsAborted,
      0,
    );
    assert.equal(
      (await reconciliation.run(new Date(leaseExpiredAt.getTime() + 120_000))).offlineSessionsAborted,
      1,
    );
  });

  it("uses a database advisory lock across API instances", async () => {
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('pootown-api-reconciliation'))");
      const result = await reconciliation.run(new Date("2026-08-12T00:00:00.000Z"));
      assert.deepEqual(result, {
        contractVersion: 1,
        waitingSessionsCancelled: 0,
        expiredAdmissionsReleased: 0,
        terminalSettlementsCommitted: 0,
        offlineSessionsAborted: 0,
        sessionsMarkedForRecovery: 0,
        alreadyRunning: true,
      });
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('pootown-api-reconciliation'))");
      client.release();
    }
  });
});
