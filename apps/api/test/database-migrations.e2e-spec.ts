import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";

import { runMigrations } from "../src/database/migration-runner";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let databaseUrl: string;

async function asRole<T>(role: "api_runtime" | "realtime_runtime", work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE ${role}`);
    return await work(client);
  } finally {
    await client.query("RESET ROLE").catch(() => undefined);
    client.release();
  }
}

async function denied(work: () => Promise<unknown>): Promise<void> {
  await assert.rejects(work, (error: unknown) => {
    return typeof error === "object" && error !== null && "code" in error && error.code === "42501";
  });
}

describe("database migrations and roles", { timeout: 120_000 }, () => {
  before(async () => {
    container = await new PostgreSqlContainer("postgres:17.6-alpine").start();
    databaseUrl = container.getConnectionUri();
    const migrationOptions = {
      migrationsDirectory: resolve(process.cwd(), "src/database/migrations"),
      rolesFile: resolve(process.cwd(), "src/database/roles/provision.sql"),
    };
    await runMigrations(databaseUrl, migrationOptions);
    await runMigrations(databaseUrl, migrationOptions);
    pool = new Pool({ connectionString: databaseUrl });
    await pool.query("INSERT INTO identity.users (id, privy_did) VALUES ('user_1', 'did:privy:user_1')");
    await pool.query("INSERT INTO economy.coin_accounts (user_id) VALUES ('user_1')");
    await pool.query(`
      INSERT INTO economy.ledger_accounts (id, owner_user_id, kind) VALUES
        ('user_1_available', 'user_1', 'user_available'),
        ('system_issuance', NULL, 'system_issuance')
    `);
    await pool.query(`
      INSERT INTO game.game_definitions
        (id, policy_version, display_name, maximum_players, entry_coin, policy_snapshot, policy_hash)
      VALUES ('standard', 1, 'Standard', 4, 100, '{}', decode(repeat('10', 32), 'hex'))
    `);
    await pool.query(`
      INSERT INTO game.game_sessions
        (id, room_id, game_definition_id, game_definition_version, creator_user_id, lifecycle,
         policy_snapshot, policy_hash, maximum_players, entry_coin)
      VALUES ('game_1', 'room_1', 'standard', 1, 'user_1', 'open', '{}',
              decode(repeat('10', 32), 'hex'), 4, 100)
    `);
  });

  after(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("applies once without drift and keeps migration_owner as DDL owner", async () => {
    const applied = await pool.query("SELECT name, length(checksum) AS checksum_length FROM infra.schema_migrations");
    assert.deepEqual(applied.rows, [
      { name: "0001-initial-authority.sql", checksum_length: 64 },
      { name: "0002-idempotent-operation-outcomes.sql", checksum_length: 64 },
      { name: "0003-session-admission-invariants.sql", checksum_length: 64 },
      { name: "0004-session-release-and-cancellation.sql", checksum_length: 64 },
      { name: "0005-internal-session-transitions.sql", checksum_length: 64 },
      { name: "0006-terminal-settlement-invariants.sql", checksum_length: 64 },
      { name: "0007-reconciliation-recovery-status.sql", checksum_length: 64 },
    ]);
    const owners = await pool.query<{ tableowner: string }>(`
      SELECT DISTINCT tableowner
      FROM pg_tables
      WHERE schemaname IN ('identity', 'economy', 'game', 'readmodel', 'realtime')
    `);
    assert.deepEqual(owners.rows, [{ tableowner: "migration_owner" }]);
    const runtimeRoles = await pool.query<{
      rolname: string;
      rolinherit: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
    }>(`
      SELECT rolname, rolinherit, rolcreatedb, rolcreaterole
      FROM pg_roles
      WHERE rolname IN ('api_runtime', 'realtime_runtime')
      ORDER BY rolname
    `);
    assert.deepEqual(runtimeRoles.rows, [
      { rolname: "api_runtime", rolinherit: false, rolcreatedb: false, rolcreaterole: false },
      { rolname: "realtime_runtime", rolinherit: false, rolcreatedb: false, rolcreaterole: false },
    ]);
  });

  it("enforces nonnegative balances and append-only balanced ledger operations", async () => {
    await assert.rejects(
      pool.query("UPDATE economy.coin_accounts SET available_coin = -1 WHERE user_id = 'user_1'"),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23514",
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO economy.coin_operations
          (id, actor_user_id, operation_scope, idempotency_key, request_hash)
        VALUES ('op_unbalanced', 'user_1', 'grant', 'grant:1', decode(repeat('00', 32), 'hex'))
      `);
      await client.query(`
        INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount)
        VALUES ('op_unbalanced', 'user_1_available', 100)
      `);
      await client.query(`
        UPDATE economy.coin_operations
        SET status = 'committed', response_snapshot = '{}', committed_at = now()
        WHERE id = 'op_unbalanced'
      `);
      await assert.rejects(client.query("COMMIT"), (error: unknown) => {
        return typeof error === "object" && error !== null && "code" in error && error.code === "23514";
      });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const balancedClient = await pool.connect();
    try {
      await balancedClient.query("BEGIN");
      await balancedClient.query(`
        INSERT INTO economy.coin_operations
          (id, actor_user_id, operation_scope, idempotency_key, request_hash)
        VALUES ('op_balanced', 'user_1', 'grant', 'grant:2', decode(repeat('01', 32), 'hex'))
      `);
      await balancedClient.query(`
        INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
          ('op_balanced', 'user_1_available', 1000),
          ('op_balanced', 'system_issuance', -1000)
      `);
      await balancedClient.query(`
        UPDATE economy.coin_operations
        SET status = 'committed', response_snapshot = '{}', committed_at = now()
        WHERE id = 'op_balanced'
      `);
      await balancedClient.query("COMMIT");
    } finally {
      balancedClient.release();
    }
    await assert.rejects(
      pool.query("UPDATE economy.coin_ledger_entries SET amount = 999 WHERE operation_id = 'op_balanced'"),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "55000",
    );

    await pool.query(`
      INSERT INTO economy.coin_operations
        (id, actor_user_id, operation_scope, idempotency_key, request_hash)
      VALUES ('op_race', 'user_1', 'grant', 'grant:race', decode(repeat('02', 32), 'hex'))
    `);
    const entryClient = await pool.connect();
    const commitClient = await pool.connect();
    try {
      await entryClient.query("BEGIN");
      await entryClient.query(`
        INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
          ('op_race', 'user_1_available', 1),
          ('op_race', 'system_issuance', -1)
      `);
      await commitClient.query("BEGIN");
      let commitUpdateSettled = false;
      const commitUpdate = commitClient.query(`
        UPDATE economy.coin_operations
        SET status = 'committed', response_snapshot = '{}', committed_at = now()
        WHERE id = 'op_race'
      `).finally(() => { commitUpdateSettled = true; });
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(commitUpdateSettled, false, "operation commit must wait for an in-flight ledger append");
      await entryClient.query("COMMIT");
      await commitUpdate;
      await commitClient.query("COMMIT");
    } finally {
      await entryClient.query("ROLLBACK").catch(() => undefined);
      await commitClient.query("ROLLBACK").catch(() => undefined);
      entryClient.release();
      commitClient.release();
    }
    await assert.rejects(
      pool.query(`
        INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
          ('op_race', 'user_1_available', 1),
          ('op_race', 'system_issuance', -1)
      `),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "55000",
    );

    const fakeRelease = await pool.connect();
    try {
      await fakeRelease.query("BEGIN");
      await fakeRelease.query(`
        INSERT INTO economy.coin_operations
          (id, actor_user_id, operation_scope, idempotency_key, request_hash)
        VALUES ('op_fake_release', 'user_1', 'releaseJoinIntent', 'release:fake', decode(repeat('05', 32), 'hex'))
      `);
      await fakeRelease.query(`
        UPDATE economy.coin_operations
        SET status = 'committed', response_snapshot = '{}', committed_at = now()
        WHERE id = 'op_fake_release'
      `);
      await assert.rejects(fakeRelease.query("COMMIT"), (error: unknown) => {
        return typeof error === "object" && error !== null && "code" in error && error.code === "23514";
      });
      await fakeRelease.query("ROLLBACK");
    } finally {
      fakeRelease.release();
    }
  });

  it("binds admission records while allowing consume-time seat creation", async () => {
    await pool.query("INSERT INTO identity.users (id, privy_did) VALUES ('user_2', 'did:privy:user_2')");
    await pool.query(`
      INSERT INTO economy.coin_operations
        (id, actor_user_id, operation_scope, idempotency_key, request_hash)
      VALUES ('op_reserve', 'user_1', 'reserve', 'reserve:1', decode(repeat('03', 32), 'hex'))
    `);
    await pool.query(`
      INSERT INTO economy.coin_reservations
        (id, operation_id, user_id, game_session_id, amount, status)
      VALUES ('reservation_1', 'op_reserve', 'user_1', 'game_1', 100, 'reserved')
    `);
    await assert.rejects(
      pool.query(`
        INSERT INTO game.session_players
          (game_session_id, player_id, user_id, seat_index, reservation_id)
        VALUES ('game_1', 'player_2', 'user_2', 1, 'reservation_1')
      `),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23503",
    );

    await asRole("api_runtime", async (client) => {
      await client.query(`
        INSERT INTO game.realtime_tickets
          (id, token_hash, user_id, game_session_id, room_id, reservation_id, player_id, role, expires_at)
        VALUES ('ticket_1', decode(repeat('04', 32), 'hex'), 'user_1', 'game_1', 'room_1',
                'reservation_1', 'player_1', 'player', now() + interval '1 minute')
      `);
      await client.query("BEGIN");
      try {
        await client.query(`
          INSERT INTO game.session_players
            (game_session_id, player_id, user_id, seat_index, reservation_id)
          VALUES ('game_1', 'player_1', 'user_1', 0, 'reservation_1')
        `);
        await client.query(`
          UPDATE game.realtime_tickets
          SET consumed_at = now(), consumed_by_room_instance = 'instance_1'
          WHERE id = 'ticket_1'
        `);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    await assert.rejects(
      pool.query("UPDATE game.session_players SET user_id = 'user_2' WHERE player_id = 'player_1'"),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "55000",
    );
    await assert.rejects(
      pool.query("UPDATE economy.coin_reservations SET operation_id = 'op_balanced', status = 'released', terminal_at = now() WHERE id = 'reservation_1'"),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "55000",
    );
    await assert.rejects(
      pool.query("UPDATE economy.coin_reservations SET status = 'released', terminal_at = created_at - interval '1 second' WHERE id = 'reservation_1'"),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23514",
    );
  });

  it("enforces API and realtime schema isolation", async () => {
    await asRole("api_runtime", async (client) => {
      await client.query("SELECT * FROM identity.users");
      await client.query("SELECT * FROM economy.coin_account_reconciliation");
      await client.query("SELECT * FROM realtime.api_settlement_proofs");
      await client.query("BEGIN");
      try {
        await client.query(`
          INSERT INTO game.realtime_tickets
            (id, token_hash, user_id, game_session_id, room_id, reservation_id, player_id, role, expires_at)
          VALUES ('ticket_expiry_probe', decode(repeat('6b', 32), 'hex'), 'user_1', 'game_1', 'room_1',
                  'reservation_1', 'player_1', 'player', clock_timestamp() + interval '1 minute')
        `);
        await assert.rejects(
          client.query(`
            UPDATE game.realtime_tickets
            SET consumed_at = expires_at + interval '1 second', consumed_by_room_instance = 'direct'
            WHERE id = 'ticket_expiry_probe'
          `),
          (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23514",
        );
      } finally {
        await client.query("ROLLBACK");
      }
      await client.query("BEGIN");
      try {
        await client.query("UPDATE game.game_sessions SET lifecycle = 'cancelling' WHERE id = 'game_1'");
        await client.query("UPDATE game.game_sessions SET lifecycle = 'cancelled', cancelled_at = now() WHERE id = 'game_1'");
        await assert.rejects(
          client.query("SET CONSTRAINTS game.cancelled_session_admission_closed IMMEDIATE"),
          (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23514",
        );
      } finally {
        await client.query("ROLLBACK");
      }
      await client.query("BEGIN");
      try {
        await client.query(`
          INSERT INTO game.game_sessions
            (id, room_id, game_definition_id, game_definition_version, creator_user_id, lifecycle,
             policy_snapshot, policy_hash, maximum_players, entry_coin, cancelled_at)
          VALUES ('game_closed', 'room_closed', 'standard', 1, 'user_1', 'cancelled', '{}',
                  decode(repeat('10', 32), 'hex'), 4, 100, clock_timestamp() + interval '1 millisecond')
        `);
        await client.query(`
          INSERT INTO economy.coin_operations
            (id, actor_user_id, operation_scope, idempotency_key, request_hash)
          VALUES ('op_closed_reserve', 'user_1', 'joinIntent', 'closed:reserve', decode(repeat('68', 32), 'hex'))
        `);
        await assert.rejects(
          client.query(`
            INSERT INTO economy.coin_reservations
              (id, operation_id, user_id, game_session_id, amount, status)
            VALUES ('reservation_closed', 'op_closed_reserve', 'user_1', 'game_closed', 100, 'reserved')
          `),
          (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23514",
        );
      } finally {
        await client.query("ROLLBACK");
      }
      await client.query("BEGIN");
      try {
        await client.query(`
          INSERT INTO economy.coin_operations
            (id, actor_user_id, operation_scope, idempotency_key, request_hash)
          VALUES ('op_api_grant', 'user_1', 'rescueGrant', 'api:grant', decode(repeat('66', 32), 'hex'))
        `);
        await client.query(`
          UPDATE economy.coin_accounts
          SET available_coin = available_coin + 10, version = version + 1, updated_at = now()
          WHERE user_id = 'user_1'
        `);
        await client.query(`
          INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
            ('op_api_grant', 'user_1_available', 10),
            ('op_api_grant', 'system_issuance', -10)
        `);
        await client.query(`
          UPDATE economy.coin_operations
          SET status = 'committed', response_snapshot = '{}', committed_at = now()
          WHERE id = 'op_api_grant'
        `);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      await denied(() => client.query("UPDATE identity.users SET privy_did = 'did:privy:other' WHERE id = 'user_1'"));
      await client.query("BEGIN");
      try {
        await client.query(`
          INSERT INTO economy.coin_operations
            (id, actor_user_id, operation_scope, idempotency_key, request_hash)
          VALUES ('op_api_release', 'user_1', 'releaseJoinIntent', 'api:release', decode(repeat('67', 32), 'hex'))
        `);
        await client.query(`
          UPDATE economy.coin_reservations
          SET status = 'released', terminal_at = now(), terminal_operation_id = 'op_api_release'
          WHERE id = 'reservation_1'
        `);
        await client.query("DELETE FROM game.session_players WHERE player_id = 'player_1'");
      } finally {
        await client.query("ROLLBACK");
      }
      await denied(() => client.query("SELECT * FROM realtime.room_checkpoints"));
      await client.query("SELECT game_session_id, room_id, lease_until, checkpoint_state_version, runtime_evidence_at FROM realtime.api_room_recovery_status");
      const recoveryGrant = await client.query<{ allowed: boolean }>(
        "SELECT has_column_privilege('api_runtime', 'game.game_sessions', 'recovery_required_at', 'UPDATE') AS allowed",
      );
      assert.deepEqual(recoveryGrant.rows, [{ allowed: true }]);
      await denied(() => client.query("CREATE TABLE identity.forbidden (id integer)"));
    });

    await asRole("realtime_runtime", async (client) => {
      await client.query(`
        INSERT INTO realtime.room_leases
          (room_id, game_session_id, instance_id, lease_until, fencing_token)
        VALUES ('room_1', 'game_1', 'instance_1', now() + interval '1 minute', 1)
      `);
      for (const statement of [
        "SELECT * FROM identity.users",
        "INSERT INTO identity.users (id, privy_did) VALUES ('attack', 'did:privy:attack')",
        "UPDATE economy.coin_accounts SET available_coin = 1",
        "DELETE FROM game.game_sessions",
        "SELECT * FROM economy.coin_account_reconciliation",
      ]) {
        await denied(() => client.query(statement));
      }
    });
  });

  it("rejects fabricated terminal settlements that do not commit exact financial facts", async () => {
    const setup = await pool.connect();
    try {
      await setup.query("BEGIN");
      await setup.query(`
        INSERT INTO identity.users (id, privy_did) VALUES
          ('settlement_user_1', 'did:privy:settlement_user_1'),
          ('settlement_user_2', 'did:privy:settlement_user_2')
      `);
      await setup.query(`
        INSERT INTO economy.coin_accounts (user_id, available_coin, reserved_coin) VALUES
          ('settlement_user_1', 900, 100), ('settlement_user_2', 900, 100)
      `);
      await setup.query(`
        INSERT INTO economy.ledger_accounts (id, owner_user_id, kind) VALUES
          ('settlement_user_1_available', 'settlement_user_1', 'user_available'),
          ('settlement_user_1_reserved', 'settlement_user_1', 'user_reserved'),
          ('settlement_user_2_available', 'settlement_user_2', 'user_available'),
          ('settlement_user_2_reserved', 'settlement_user_2', 'user_reserved')
      `);
      await setup.query(`
        INSERT INTO game.game_sessions
          (id, room_id, game_definition_id, game_definition_version, creator_user_id, lifecycle,
           policy_snapshot, policy_hash, maximum_players, entry_coin)
        VALUES ('settlement_game', 'settlement_room', 'standard', 1, 'settlement_user_1', 'open', '{}',
                decode(repeat('10', 32), 'hex'), 4, 100)
      `);
      await setup.query(`
        INSERT INTO economy.coin_operations
          (id, actor_user_id, operation_scope, idempotency_key, request_hash)
        VALUES
          ('settlement_reserve_1', 'settlement_user_1', 'createSession', 'settlement:reserve:1', decode(repeat('81', 32), 'hex')),
          ('settlement_reserve_2', 'settlement_user_2', 'joinIntent', 'settlement:reserve:2', decode(repeat('82', 32), 'hex'))
      `);
      await setup.query(`
        INSERT INTO economy.coin_reservations
          (id, operation_id, user_id, game_session_id, amount, status)
        VALUES
          ('settlement_reservation_1', 'settlement_reserve_1', 'settlement_user_1', 'settlement_game', 100, 'reserved'),
          ('settlement_reservation_2', 'settlement_reserve_2', 'settlement_user_2', 'settlement_game', 100, 'reserved')
      `);
      await setup.query(`
        INSERT INTO game.session_players
          (game_session_id, player_id, user_id, seat_index, reservation_id)
        VALUES
          ('settlement_game', 'settlement_player_1', 'settlement_user_1', 0, 'settlement_reservation_1'),
          ('settlement_game', 'settlement_player_2', 'settlement_user_2', 1, 'settlement_reservation_2')
      `);
      await setup.query(`
        INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
          ('settlement_reserve_1', 'settlement_user_1_available', 900),
          ('settlement_reserve_1', 'settlement_user_1_reserved', 100),
          ('settlement_reserve_1', 'system_issuance', -1000),
          ('settlement_reserve_2', 'settlement_user_2_available', 900),
          ('settlement_reserve_2', 'settlement_user_2_reserved', 100),
          ('settlement_reserve_2', 'system_issuance', -1000)
      `);
      await setup.query(`
        UPDATE economy.coin_operations
        SET status = 'committed', response_snapshot = '{}', committed_at = now()
        WHERE id IN ('settlement_reserve_1', 'settlement_reserve_2')
      `);
      await setup.query(`
        UPDATE game.game_sessions
        SET lifecycle = 'active', state_version = 1, started_at = clock_timestamp()
        WHERE id = 'settlement_game'
      `);
      await setup.query(`
        INSERT INTO realtime.room_leases
          (room_id, game_session_id, instance_id, lease_until, fencing_token)
        VALUES ('settlement_room', 'settlement_game', 'settlement_instance', now() + interval '1 minute', 1)
      `);
      await setup.query(`
        INSERT INTO realtime.terminal_proofs
          (game_session_id, room_id, state_version, checkpoint_checksum, winner_player_id, end_reason)
        VALUES ('settlement_game', 'settlement_room', 9, decode(repeat('83', 32), 'hex'),
                'settlement_player_2', 'lastPlayerStanding')
      `);
      await setup.query("COMMIT");
    } catch (error) {
      await setup.query("ROLLBACK");
      throw error;
    } finally {
      setup.release();
    }

    await asRole("api_runtime", async (client) => {
      for (const mode of ["pending", "unreconciled"] as const) {
        await client.query("BEGIN");
        try {
          const operationId = `fabricated_${mode}`;
          await client.query(
            `
              INSERT INTO economy.coin_operations
                (id, actor_user_id, operation_scope, idempotency_key, request_hash)
              VALUES ($1, 'settlement_user_1', 'settleSession', $1, decode(repeat('84', 32), 'hex'))
            `,
            [operationId],
          );
          await client.query(
            `
              UPDATE economy.coin_reservations
              SET status = 'captured', terminal_at = now(), terminal_operation_id = $1
              WHERE game_session_id = 'settlement_game' AND status = 'reserved'
            `,
            [operationId],
          );
          if (mode === "unreconciled") {
            await client.query(
              `
                INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
                  ($1, 'settlement_user_1_reserved', -100),
                  ($1, 'settlement_user_2_reserved', -100),
                  ($1, 'settlement_user_2_available', 200)
              `,
              [operationId],
            );
          }
          await client.query(
            `
              INSERT INTO readmodel.session_history
                (game_session_id, user_id, player_id, result, account_coin_delta, finished_at)
              VALUES
                ('settlement_game', 'settlement_user_1', 'settlement_player_1', 'lost', -100, now()),
                ('settlement_game', 'settlement_user_2', 'settlement_player_2', 'won', 100, now())
            `,
          );
          await client.query(
            `
              INSERT INTO economy.game_settlements
                (id, game_session_id, kind, operation_id, terminal_state_version,
                 checkpoint_checksum, winner_user_id)
              VALUES ($1, 'settlement_game', 'completed', $2, 9,
                      decode(repeat('83', 32), 'hex'), 'settlement_user_2')
            `,
            [`settlement_${mode}`, operationId],
          );
          await client.query(
            "UPDATE game.game_sessions SET lifecycle = 'settling', state_version = 9 WHERE id = 'settlement_game'",
          );
          await client.query(
            "UPDATE game.game_sessions SET lifecycle = 'settled', finished_at = now() WHERE id = 'settlement_game'",
          );
          if (mode === "unreconciled") {
            await client.query(
              "UPDATE economy.coin_operations SET status = 'committed', response_snapshot = '{}', committed_at = now() WHERE id = $1",
              [operationId],
            );
          }
          await assert.rejects(client.query("COMMIT"), (error: unknown) => {
            return typeof error === "object" && error !== null && "code" in error && error.code === "23514";
          });
        } finally {
          await client.query("ROLLBACK");
        }
      }
    });

    const unchanged = await pool.query(`
      SELECT
        (SELECT lifecycle FROM game.game_sessions WHERE id = 'settlement_game') AS lifecycle,
        (SELECT count(*)::int FROM economy.game_settlements WHERE game_session_id = 'settlement_game') AS settlements,
        (SELECT count(*)::int FROM economy.coin_reservations WHERE game_session_id = 'settlement_game' AND status = 'reserved') AS reserved,
        (SELECT sum(available_coin)::text FROM economy.coin_accounts WHERE user_id LIKE 'settlement_user_%') AS available,
        (SELECT sum(reserved_coin)::text FROM economy.coin_accounts WHERE user_id LIKE 'settlement_user_%') AS reserved_coin
    `);
    assert.deepEqual(unchanged.rows, [{
      lifecycle: "active",
      settlements: 0,
      reserved: 2,
      available: "1800",
      reserved_coin: "200",
    }]);
  });

  it("serializes direct admission inserts with lifecycle cancellation", async () => {
    await pool.query(`
      INSERT INTO game.game_sessions
        (id, room_id, game_definition_id, game_definition_version, creator_user_id, lifecycle,
         policy_snapshot, policy_hash, maximum_players, entry_coin)
      VALUES
        ('game_cancel_first', 'room_cancel_first', 'standard', 1, 'user_1', 'open', '{}',
         decode(repeat('10', 32), 'hex'), 4, 100),
        ('game_admit_first', 'room_admit_first', 'standard', 1, 'user_1', 'open', '{}',
         decode(repeat('10', 32), 'hex'), 4, 100)
    `);
    await pool.query(`
      INSERT INTO economy.coin_operations
        (id, actor_user_id, operation_scope, idempotency_key, request_hash)
      VALUES
        ('op_cancel_first_reserve', 'user_1', 'joinIntent', 'race:cancel-first', decode(repeat('69', 32), 'hex')),
        ('op_admit_first_reserve', 'user_1', 'joinIntent', 'race:admit-first', decode(repeat('6a', 32), 'hex'))
    `);

    const cancelClient = await pool.connect();
    const admissionClient = await pool.connect();
    try {
      await cancelClient.query("SET ROLE api_runtime");
      await admissionClient.query("SET ROLE api_runtime");

      await cancelClient.query("BEGIN");
      await admissionClient.query("BEGIN");
      await cancelClient.query("UPDATE game.game_sessions SET lifecycle = 'cancelling' WHERE id = 'game_cancel_first'");
      await cancelClient.query(
        "UPDATE game.game_sessions SET lifecycle = 'cancelled', cancelled_at = now() WHERE id = 'game_cancel_first'",
      );
      let lateInsertSettled = false;
      const lateInsert = admissionClient.query(`
        INSERT INTO economy.coin_reservations
          (id, operation_id, user_id, game_session_id, amount, status)
        VALUES ('reservation_cancel_first', 'op_cancel_first_reserve', 'user_1', 'game_cancel_first', 100, 'reserved')
      `).finally(() => { lateInsertSettled = true; });
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(lateInsertSettled, false, "admission insert must wait for the lifecycle writer");
      await cancelClient.query("COMMIT");
      await assert.rejects(lateInsert, (error: unknown) => {
        return typeof error === "object" && error !== null && "code" in error && error.code === "23514";
      });
      await admissionClient.query("ROLLBACK");

      await admissionClient.query("BEGIN");
      await cancelClient.query("BEGIN");
      await admissionClient.query(`
        INSERT INTO economy.coin_reservations
          (id, operation_id, user_id, game_session_id, amount, status)
        VALUES ('reservation_admit_first', 'op_admit_first_reserve', 'user_1', 'game_admit_first', 100, 'reserved')
      `);
      let lateCancellationSettled = false;
      const lateCancellation = (async () => {
        await cancelClient.query("UPDATE game.game_sessions SET lifecycle = 'cancelling' WHERE id = 'game_admit_first'");
        await cancelClient.query(
          "UPDATE game.game_sessions SET lifecycle = 'cancelled', cancelled_at = now() WHERE id = 'game_admit_first'",
        );
      })().finally(() => { lateCancellationSettled = true; });
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(lateCancellationSettled, false, "lifecycle update must wait for the admission writer");
      await admissionClient.query("COMMIT");
      await lateCancellation;
      await assert.rejects(cancelClient.query("COMMIT"), (error: unknown) => {
        return typeof error === "object" && error !== null && "code" in error && error.code === "23514";
      });
      await cancelClient.query("ROLLBACK");
    } finally {
      await cancelClient.query("ROLLBACK").catch(() => undefined);
      await admissionClient.query("ROLLBACK").catch(() => undefined);
      await cancelClient.query("RESET ROLE").catch(() => undefined);
      await admissionClient.query("RESET ROLE").catch(() => undefined);
      cancelClient.release();
      admissionClient.release();
    }

    const state = await pool.query(`
      SELECT id, lifecycle,
        (SELECT count(*)::int FROM economy.coin_reservations WHERE game_session_id = session.id) AS reservations
      FROM game.game_sessions session
      WHERE id IN ('game_cancel_first', 'game_admit_first')
      ORDER BY id
    `);
    assert.deepEqual(state.rows, [
      { id: "game_admit_first", lifecycle: "open", reservations: 1 },
      { id: "game_cancel_first", lifecycle: "cancelled", reservations: 0 },
    ]);
  });

  it("rejects migration drift, removed files, and retroactive files", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "pootown-migrations-"));
    const migrationsDirectory = join(temporaryRoot, "migrations");
    const rolesFile = join(temporaryRoot, "provision.sql");
    try {
      await cp(resolve(process.cwd(), "src/database/migrations"), migrationsDirectory, { recursive: true });
      await cp(resolve(process.cwd(), "src/database/roles/provision.sql"), rolesFile);
      const options = { migrationsDirectory, rolesFile };

      await writeFile(join(migrationsDirectory, "0008-noop.sql"), "SELECT 1;\n");
      await runMigrations(databaseUrl, options);
      await rm(join(migrationsDirectory, "0008-noop.sql"));
      await assert.rejects(runMigrations(databaseUrl, options), /Applied migration files are missing/);

      await writeFile(join(migrationsDirectory, "0008-noop.sql"), "SELECT 1;\n");
      await writeFile(join(migrationsDirectory, "0000-retroactive.sql"), "SELECT 1;\n");
      await assert.rejects(runMigrations(databaseUrl, options), /Retroactive migrations are not allowed/);
      await rm(join(migrationsDirectory, "0000-retroactive.sql"));

      await writeFile(join(migrationsDirectory, "0001-initial-authority.sql"), "SELECT 1;\n");
      await assert.rejects(runMigrations(databaseUrl, options), /Migration drift detected/);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
