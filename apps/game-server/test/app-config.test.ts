import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGameServerEnvironment } from "../src/app-config.js";

function validEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    API_BASE_URL: "https://api.pootown.example/",
    DATABASE_URL: "postgresql://runtime:secret@database/pootown",
    GAME_SERVER_INSTANCE_ID: "game-server-1",
    GAME_SERVER_ORIGINS: "https://pootown.example,http://localhost:3000",
    INTERNAL_SERVICE_AUDIENCE: "pootown-api",
    INTERNAL_SERVICE_ISSUER: "pootown-internal",
    INTERNAL_SERVICE_PRIVATE_KEY: "test-key-material",
    ...overrides,
  };
}

describe("game server configuration", () => {
  it("parses one-replica server authority without accepting Redis", () => {
    const config = parseGameServerEnvironment(validEnvironment({ PATH: "/usr/bin" }));
    assert.equal(config.apiBaseUrl, "https://api.pootown.example");
    assert.equal(config.port, 2567);
    assert.equal(config.leaseDurationMs, 30_000);
    assert.equal(config.leaseRenewMs, 10_000);
    assert.deepEqual(config.origins, ["https://pootown.example", "http://localhost:3000"]);
    assert.equal(parseGameServerEnvironment(validEnvironment({ GAME_SERVER_INSTANCE_ID: "a".repeat(80) })).instanceId.length, 80);
    assert.throws(() => parseGameServerEnvironment(validEnvironment({ GAME_SERVER_INSTANCE_ID: "a".repeat(81) })));
    assert.throws(() => parseGameServerEnvironment(validEnvironment({ REDIS_URL: "redis://cache:6379" })));
    assert.throws(() => parseGameServerEnvironment(validEnvironment({ REDIS_HOST: "cache" })));
    assert.throws(() => parseGameServerEnvironment(validEnvironment({ GAME_SERVER_DISTRIBUTED_PRESENCE: "true" })));
  });

  it("rejects unsafe endpoints, origins, and lease timing", () => {
    assert.throws(() => parseGameServerEnvironment(validEnvironment({ DATABASE_URL: "https://database.example" })));
    assert.throws(() => parseGameServerEnvironment(validEnvironment({ API_BASE_URL: "file:///tmp/api" })));
    for (const apiBaseUrl of [
      "https://user:pass@api.example",
      "https://api.example/path",
      "https://api.example/?query=secret",
      "https://api.example/#fragment",
    ]) {
      assert.throws(() => parseGameServerEnvironment(validEnvironment({ API_BASE_URL: apiBaseUrl })));
    }
    for (const origin of ["*", "javascript:alert(1)", "https://user:pass@example.com", "https://example.com/path"]){
      assert.throws(() => parseGameServerEnvironment(validEnvironment({ GAME_SERVER_ORIGINS: origin })));
    }
    assert.throws(() => parseGameServerEnvironment(validEnvironment({ ROOM_LEASE_RENEW_MS: "15000" })));
    assert.throws(() => parseGameServerEnvironment(validEnvironment({
      GAME_SERVER_ORIGINS: "https://pootown.example,https://pootown.example:443",
    })));
  });
});
