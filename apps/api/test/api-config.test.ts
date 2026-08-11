import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { corsOrigins, parseApiEnvironment } from "../src/config/api-config";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://api:password@localhost:5432/pootown",
  CORS_ORIGINS: "https://play.example.com,https://admin.example.com/",
  PRIVY_APP_ID: "privy-app",
  PRIVY_VERIFICATION_KEY: "-----BEGIN PUBLIC KEY-----\\nplaceholder-key-material\\n-----END PUBLIC KEY-----",
  INTERNAL_JWT_ISSUER: "pootown-internal",
  INTERNAL_JWT_AUDIENCE: "pootown-api",
  INTERNAL_JWT_PUBLIC_KEY: "-----BEGIN PUBLIC KEY-----\\nplaceholder-key-material\\n-----END PUBLIC KEY-----",
};

describe("API configuration", () => {
  it("parses exact server-only settings and normalizes origins", () => {
    const config = parseApiEnvironment(validEnvironment);
    assert.equal(config.API_PORT, 3001);
    assert.equal(config.INITIAL_GRANT_COIN, "1000");
    assert.equal(config.WAITING_SESSION_TTL_MS, 900_000);
    assert.equal(config.TICKET_RELEASE_GRACE_MS, 30_000);
    assert.equal(config.ACTIVE_RECOVERY_GRACE_MS, 120_000);
    assert.deepEqual([...corsOrigins(config)], ["https://play.example.com", "https://admin.example.com"]);
    assert.equal(config.PRIVY_VERIFICATION_KEY.includes("\\n"), false);
  });

  it("bounds reconciliation timing policy", () => {
    assert.throws(() => parseApiEnvironment({ ...validEnvironment, WAITING_SESSION_TTL_MS: 59_999 }));
    assert.throws(() => parseApiEnvironment({ ...validEnvironment, TICKET_RELEASE_GRACE_MS: 999 }));
    assert.throws(() => parseApiEnvironment({ ...validEnvironment, ACTIVE_RECOVERY_GRACE_MS: 29_999 }));
  });

  it("rejects wildcard origins and public private-key names", () => {
    assert.throws(() => parseApiEnvironment({ ...validEnvironment, CORS_ORIGINS: "*" }));
    for (const origin of [
      "javascript:alert(1)",
      "file:///tmp/pootown",
      "https://user:password@example.com",
      "https://example.com/path",
      "https://example.com?query=1",
      "http://example.com",
    ]) {
      assert.throws(() => parseApiEnvironment({ ...validEnvironment, CORS_ORIGINS: origin }));
    }
    assert.throws(() =>
      parseApiEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_AUTH_PRIVATE_KEY_PRIVY: "must-never-be-accepted",
      }),
    );
  });

  it("accepts only PostgreSQL database URLs", () => {
    for (const databaseUrl of ["postgres://api:password@localhost/pootown", "postgresql://localhost/pootown"]) {
      assert.equal(parseApiEnvironment({ ...validEnvironment, DATABASE_URL: databaseUrl }).DATABASE_URL, databaseUrl);
    }
    for (const databaseUrl of ["https://example.com/db", "file:///tmp/db", "mysql://localhost/pootown"]) {
      assert.throws(() => parseApiEnvironment({ ...validEnvironment, DATABASE_URL: databaseUrl }));
    }
  });

  it("requires positive canonical server-owned grant values", () => {
    for (const value of ["0", "01", "-1", "1.0"]) {
      assert.throws(() => parseApiEnvironment({ ...validEnvironment, INITIAL_GRANT_COIN: value }));
      assert.throws(() => parseApiEnvironment({ ...validEnvironment, RESCUE_BALANCE_COIN: value }));
    }
    assert.equal(parseApiEnvironment({
      ...validEnvironment,
      INITIAL_GRANT_COIN: "1",
      RESCUE_BALANCE_COIN: "1",
    }).INITIAL_GRANT_COIN, "1");
    assert.throws(() => parseApiEnvironment({
      ...validEnvironment,
      INITIAL_GRANT_COIN: "99",
      RESCUE_BALANCE_COIN: "100",
    }));
  });

  it("ignores unrelated process environment variables", () => {
    assert.doesNotThrow(() =>
      parseApiEnvironment({
        ...validEnvironment,
        PATH: "/usr/bin",
        HOME: "/non-sensitive-home",
        SHELL: "/bin/sh",
      }),
    );
  });
});
