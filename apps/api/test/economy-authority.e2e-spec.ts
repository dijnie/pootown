import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";

import type { AuthenticatedPrincipal } from "../src/auth/auth.types";
import { runMigrations } from "../src/database/migration-runner";
import { EconomyService } from "../src/economy/economy.service";
import { ProvisioningTestIdentityService } from "./provisioning-test-identity.service";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let economy: EconomyService;

const principal = (session: number): AuthenticatedPrincipal => ({
  userId: "economy-user",
  sessionId: `session_${session}`,
});

async function spend(userId: string, amount: bigint, now: Date): Promise<void> {
  const client = await pool.connect();
  const operationId = randomUUID();
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
        VALUES ($1, $2, 'testSpend', $1, decode(repeat('55', 32), 'hex'))
      `,
      [operationId, userId],
    );
    const account = await client.query<{ available_coin: string }>(
      `
        UPDATE economy.coin_accounts
        SET available_coin = available_coin - $2::numeric,
            version = version + 1,
            updated_at = $3
        WHERE user_id = $1 AND available_coin >= $2::numeric
        RETURNING available_coin
      `,
      [userId, amount.toString(), now],
    );
    assert.equal(account.rowCount, 1);
    const availableLedger = await client.query<{ id: string }>(
      "SELECT id FROM economy.ledger_accounts WHERE owner_user_id = $1 AND kind = 'user_available'",
      [userId],
    );
    const ledgerId = availableLedger.rows[0]?.id;
    assert.notEqual(ledgerId, undefined);
    await client.query(
      `
        INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
          ($1, $2, -$3::numeric),
          ($1, 'system_entry', $3::numeric)
      `,
      [operationId, ledgerId, amount.toString()],
    );
    await client.query(
      `
        UPDATE economy.coin_operations
        SET status = 'committed', response_snapshot = '{}', committed_at = $2
        WHERE id = $1
      `,
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

async function reserveCoin(userId: string, amount: bigint, now: Date): Promise<void> {
  const client = await pool.connect();
  const operationId = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO economy.coin_operations
          (id, actor_user_id, operation_scope, idempotency_key, request_hash)
        VALUES ($1, $2, 'reserve', $1, decode(repeat('77', 32), 'hex'))
      `,
      [operationId, userId],
    );
    await client.query(
      `
        UPDATE economy.coin_accounts
        SET available_coin = available_coin - $2::numeric,
            reserved_coin = reserved_coin + $2::numeric,
            version = version + 1,
            updated_at = $3
        WHERE user_id = $1 AND available_coin >= $2::numeric
      `,
      [userId, amount.toString(), now],
    );
    const ledgers = await client.query<{ id: string; kind: string }>(
      "SELECT id, kind FROM economy.ledger_accounts WHERE owner_user_id = $1",
      [userId],
    );
    const availableId = ledgers.rows.find((row) => row.kind === "user_available")?.id;
    const reservedId = ledgers.rows.find((row) => row.kind === "user_reserved")?.id;
    assert.notEqual(availableId, undefined);
    assert.notEqual(reservedId, undefined);
    await client.query(
      `
        INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
          ($1, $2, -$4::numeric),
          ($1, $3, $4::numeric)
      `,
      [operationId, availableId, reservedId, amount.toString()],
    );
    await client.query(
      `
        UPDATE economy.coin_operations
        SET status = 'committed', response_snapshot = '{}', committed_at = $2
        WHERE id = $1
      `,
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

describe("identity and account-coin authority", { timeout: 120_000 }, () => {
  before(async () => {
    container = await new PostgreSqlContainer("postgres:17.6-alpine").start();
    const databaseUrl = container.getConnectionUri();
    await runMigrations(databaseUrl, {
      migrationsDirectory: resolve(process.cwd(), "src/database/migrations"),
      rolesFile: resolve(process.cwd(), "src/database/roles/provision.sql"),
    });
    pool = new Pool({ connectionString: databaseUrl, max: 24 });
    const config = new ConfigService({
      INITIAL_GRANT_COIN: "1000",
      RESCUE_BALANCE_COIN: "100",
      RESCUE_WINDOW_MS: 86_400_000,
    });
    economy = new EconomyService(pool, config, new ProvisioningTestIdentityService());
  });

  after(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("creates one user/account and exactly one initial grant under a 20-way race", async () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) => economy.provisionPrincipal(principal(index), now)),
    );
    assert.equal(new Set(results.map((result) => result.user.userId)).size, 1);
    assert.equal(results.every((result) => result.balance.availableCoin === "1000"), true);

    const userCount = await pool.query("SELECT count(*)::int AS count FROM identity.users");
    assert.equal(userCount.rows[0]?.count, 1);
    const initialOperations = await pool.query(
      "SELECT count(*)::int AS count FROM economy.coin_operations WHERE operation_scope = 'initialGrant'",
    );
    assert.equal(initialOperations.rows[0]?.count, 1);
    const ledger = await pool.query(`
      SELECT count(*)::int AS count, sum(amount)::text AS balance
      FROM economy.coin_ledger_entries entry
      JOIN economy.coin_operations operation ON operation.id = entry.operation_id
      WHERE operation.operation_scope = 'initialGrant'
    `);
    assert.deepEqual(ledger.rows, [{ count: 2, balance: "0" }]);
  });

  it("tops up to exactly 100 once per rolling 24 hours under concurrency", async () => {
    const provisioned = await economy.provisionPrincipal(principal(21), new Date("2026-08-11T12:01:00.000Z"));
    const userId = provisioned.user.userId;
    const firstRescueAt = new Date("2026-08-11T13:00:00.000Z");
    await spend(userId, 901n, new Date("2026-08-11T12:30:00.000Z"));

    const raced = await Promise.all(
      Array.from({ length: 20 }, (_, index) => economy.rescue(principal(100 + index), `rescue:${index}`, firstRescueAt)),
    );
    assert.equal(raced.filter((response) => response.granted).length, 1);
    assert.equal(raced.every((response) => response.availableCoin === "100"), true);
    const winning = raced.find((response) => response.granted);
    assert.notEqual(winning, undefined);
    const replay = await economy.rescue(
      principal(200),
      `rescue:${raced.indexOf(winning as NonNullable<typeof winning>)}`,
      new Date(firstRescueAt.getTime() + 1),
    );
    assert.deepEqual(replay, winning);

    await spend(userId, 1n, new Date(firstRescueAt.getTime() + 2));
    const premature = await economy.rescue(
      principal(201),
      "rescue:premature",
      new Date(firstRescueAt.getTime() + 86_400_000 - 1),
    );
    assert.equal(premature.granted, false);
    assert.equal(premature.availableCoin, "99");
    assert.deepEqual(
      await economy.rescue(
        principal(203),
        "rescue:premature",
        new Date(firstRescueAt.getTime() + 86_400_000),
      ),
      premature,
    );
    const boundary = await economy.rescue(
      principal(202),
      "rescue:boundary",
      new Date(firstRescueAt.getTime() + 86_400_000),
    );
    assert.equal(boundary.granted, true);
    assert.equal(boundary.availableCoin, "100");

    await reserveCoin(userId, 99n, new Date(firstRescueAt.getTime() + 86_400_001));
    const reservedBalance = await economy.rescue(
      principal(204),
      "rescue:reserved-balance",
      new Date(firstRescueAt.getTime() + 172_800_000),
    );
    assert.equal(reservedBalance.granted, false);
    assert.equal(reservedBalance.availableCoin, "1");
    assert.equal(reservedBalance.reservedCoin, "99");

    const noOp = await pool.query<{ id: string }>(`
      SELECT id FROM economy.coin_operations
      WHERE operation_scope = 'rescueGrant' AND status = 'no_op'
      ORDER BY created_at, id
      LIMIT 1
    `);
    await assert.rejects(
      pool.query(
        "INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES ($1, 'system_entry', 1)",
        [noOp.rows[0]?.id],
      ),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "55000",
    );

    const rescueCount = await pool.query(
      "SELECT count(*)::int AS count FROM economy.coin_operations WHERE operation_scope = 'rescueGrant' AND status = 'committed'",
    );
    assert.equal(rescueCount.rows[0]?.count, 2);
    const reconciliation = await pool.query(`
      SELECT available_coin::text, reserved_coin::text, ledger_available_coin::text, ledger_reserved_coin::text
      FROM economy.coin_account_reconciliation
      WHERE user_id = $1
    `, [userId]);
    assert.deepEqual(reconciliation.rows, [{
      available_coin: "1",
      reserved_coin: "99",
      ledger_available_coin: "1",
      ledger_reserved_coin: "99",
    }]);

    const firstPage = await economy.listOperations(principal(300), 2);
    assert.equal(firstPage.items.length, 2);
    assert.equal(firstPage.items.every((operation) => ["initialGrant", "rescueGrant", "reserve"].includes(operation.kind)), true);
    assert.notEqual(firstPage.nextCursor, null);
    const secondPage = await economy.listOperations(principal(301), 2, firstPage.nextCursor ?? undefined);
    assert.equal(secondPage.items.length, 2);
    assert.equal(secondPage.nextCursor, null);
    assert.equal(new Set([...firstPage.items, ...secondPage.items].map((operation) => operation.operationId)).size, 4);
    await assert.rejects(economy.listOperations(principal(302), 20, "not-a-cursor"), /cursor is invalid/);
    const nonCanonicalTimestamp = Buffer.from(JSON.stringify({ createdAt: "0", id: "operation_1" })).toString("base64url");
    await assert.rejects(economy.listOperations(principal(303), 20, nonCanonicalTimestamp), /cursor is invalid/);
  });
});
