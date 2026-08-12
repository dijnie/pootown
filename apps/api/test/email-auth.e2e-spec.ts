import assert from "node:assert/strict";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import { CONTRACT_VERSION } from "@pootown/game-contracts";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";

import { UserAccessTokenVerifier } from "../src/auth/access-token.verifier";
import { EmailAuthService } from "../src/auth/email-auth.service";
import { runMigrations } from "../src/database/migration-runner";
import { EconomyService } from "../src/economy/economy.service";
import { IdentityService } from "../src/identity/identity.service";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let auth: EmailAuthService;
let accessVerifier: UserAccessTokenVerifier;

const configValues = {
  AUTH_ACCESS_TOKEN_SECRET: "access-secret-that-is-at-least-thirty-two-bytes",
  AUTH_REFRESH_TOKEN_SECRET: "refresh-secret-that-is-at-least-thirty-two-bytes",
  AUTH_TOKEN_ISSUER: "pootown-api",
  AUTH_ACCESS_TOKEN_AUDIENCE: "pootown-web",
  AUTH_REFRESH_TOKEN_AUDIENCE: "pootown-refresh",
  AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
  AUTH_REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
  INITIAL_GRANT_COIN: "1000",
  RESCUE_BALANCE_COIN: "100",
  RESCUE_WINDOW_MS: 86_400_000,
};

function apiCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

describe("email authentication", { timeout: 120_000 }, () => {
  before(async () => {
    container = await new PostgreSqlContainer("postgres:17.6-alpine").start();
    const databaseUrl = container.getConnectionUri();
    await runMigrations(databaseUrl, {
      migrationsDirectory: resolve(process.cwd(), "src/database/migrations"),
      rolesFile: resolve(process.cwd(), "src/database/roles/provision.sql"),
    });
    pool = new Pool({ connectionString: databaseUrl, max: 24 });
    const config = new ConfigService(configValues);
    const identity = new IdentityService();
    const economy = new EconomyService(pool, config, identity);
    auth = new EmailAuthService(pool, config, identity, economy);
    accessVerifier = new UserAccessTokenVerifier(config);
  });

  after(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("creates one identity, one initial grant, and one session in a concurrent registration race", async () => {
    const now = new Date();
    const request = { contractVersion: CONTRACT_VERSION, email: "player@example.test", password: "correct-horse-42" };
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => auth.register(request, now)),
    );
    const successes = attempts.filter((attempt) => attempt.status === "fulfilled");
    const failures = attempts.filter((attempt) => attempt.status === "rejected");
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 19);
    assert.equal(failures.every((failure) => apiCode(failure.reason) === "AUTH_EMAIL_EXISTS"), true);

    const facts = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM identity.users WHERE email = 'player@example.test') AS users,
        (SELECT count(*)::int FROM identity.auth_sessions) AS sessions,
        (SELECT count(*)::int FROM economy.coin_operations WHERE operation_scope = 'initialGrant') AS grants,
        (SELECT available_coin::text FROM economy.coin_accounts LIMIT 1) AS available_coin
    `);
    assert.deepEqual(facts.rows, [{ users: 1, sessions: 1, grants: 1, available_coin: "1000" }]);
    const issued = successes[0]?.status === "fulfilled" ? successes[0].value : undefined;
    assert.notEqual(issued, undefined);
    assert.deepEqual(await accessVerifier.verify(issued?.response.accessToken ?? ""), {
      userId: issued?.response.user.userId,
      sessionId: (await accessVerifier.verify(issued?.response.accessToken ?? "")).sessionId,
    });
    const stored = await pool.query<{ refresh_token_hash: Buffer; password_hash: string }>(`
      SELECT session.refresh_token_hash, users.password_hash
      FROM identity.auth_sessions session JOIN identity.users users ON users.id = session.user_id
    `);
    assert.equal(stored.rows[0]?.refresh_token_hash.length, 32);
    assert.equal(stored.rows[0]?.refresh_token_hash.toString("utf8").includes(issued?.refreshToken ?? ""), false);
    assert.match(stored.rows[0]?.password_hash ?? "", /^\$2b\$12\$/);
  });

  it("uses one generic error for unknown email and wrong password", async () => {
    for (const request of [
      { contractVersion: CONTRACT_VERSION, email: "missing@example.test", password: "correct-horse-42" },
      { contractVersion: CONTRACT_VERSION, email: "player@example.test", password: "wrong-password-42" },
    ]) {
      await assert.rejects(auth.login(request), (error: unknown) => apiCode(error) === "AUTH_CREDENTIALS_INVALID");
    }
  });

  it("rotates refresh tokens, revokes on replay, and makes logout idempotent", async () => {
    const login = await auth.login(
      { contractVersion: CONTRACT_VERSION, email: "player@example.test", password: "correct-horse-42" },
      new Date("2026-08-12T04:01:00.000Z"),
    );
    const rotated = await auth.refresh(login.refreshToken, new Date("2026-08-12T04:01:01.000Z"));
    assert.notEqual(rotated.refreshToken, login.refreshToken);
    await assert.rejects(
      auth.refresh(login.refreshToken, new Date("2026-08-12T04:01:02.000Z")),
      (error: unknown) => apiCode(error) === "AUTH_SESSION_INVALID",
    );
    await assert.rejects(
      auth.refresh(rotated.refreshToken, new Date("2026-08-12T04:01:03.000Z")),
      (error: unknown) => apiCode(error) === "AUTH_SESSION_INVALID",
    );

    const secondLogin = await auth.login(
      { contractVersion: CONTRACT_VERSION, email: "player@example.test", password: "correct-horse-42" },
      new Date("2026-08-12T04:02:00.000Z"),
    );
    assert.deepEqual(await auth.logout(secondLogin.refreshToken, new Date("2026-08-12T04:02:01.000Z")), {
      contractVersion: CONTRACT_VERSION,
      loggedOut: true,
    });
    assert.deepEqual(await auth.logout(secondLogin.refreshToken, new Date("2026-08-12T04:02:02.000Z")), {
      contractVersion: CONTRACT_VERSION,
      loggedOut: true,
    });
    await assert.rejects(
      auth.refresh(secondLogin.refreshToken, new Date("2026-08-12T04:02:03.000Z")),
      (error: unknown) => apiCode(error) === "AUTH_SESSION_INVALID",
    );
  });

  it("rejects an older replay after a newer refresh without moving the session clock backward", async () => {
    const registered = await auth.register(
      {
        contractVersion: CONTRACT_VERSION,
        email: "out-of-order-refresh@example.test",
        password: "correct-horse-42",
      },
      new Date("2026-08-12T05:00:00.000Z"),
    );

    await auth.refresh(registered.refreshToken, new Date("2026-08-12T05:00:02.000Z"));
    await assert.rejects(
      auth.refresh(registered.refreshToken, new Date("2026-08-12T05:00:01.000Z")),
      (error: unknown) => apiCode(error) === "AUTH_SESSION_INVALID",
    );

    const stored = await pool.query<{ revoked_at: Date; updated_at: Date }>(
      `SELECT revoked_at, updated_at
       FROM identity.auth_sessions
       WHERE user_id = $1`,
      [registered.response.user.userId],
    );
    assert.equal(stored.rows[0]?.updated_at.toISOString(), "2026-08-12T05:00:02.000Z");
    assert.equal(stored.rows[0]?.revoked_at.toISOString(), "2026-08-12T05:00:02.000Z");
  });
});
