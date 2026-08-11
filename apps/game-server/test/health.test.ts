import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, describe, it } from "node:test";
import express from "express";
import type { Pool } from "pg";

import { registerHealthRoutes, RuntimeReadiness } from "../src/health.js";
import {
  operationalErrorType,
  registerMetricsRoute,
  RuntimeMetrics,
} from "../src/observability/runtime-metrics.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
  })));
});

async function serve(query: () => Promise<unknown>, accepting: boolean): Promise<string> {
  const app = express();
  registerHealthRoutes(app, { query } as unknown as Pool, { isAcceptingConnections: () => accepting });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("HTTP server address is unavailable");
  return `http://127.0.0.1:${address.port}`;
}

describe("game server health", () => {
  it("maps mutable error names onto a fixed operational log value", () => {
    const malicious = new Error("private detail");
    malicious.name = "ticket_secret/player_secret/".repeat(100);
    assert.equal(operationalErrorType(malicious), "error");
    assert.equal(operationalErrorType({ name: malicious.name }), "unknown");
  });

  it("fails readiness permanently after lease ownership is lost", () => {
    const readiness = new RuntimeReadiness();
    assert.equal(readiness.isAcceptingConnections(), false);
    readiness.markListening();
    assert.equal(readiness.isAcceptingConnections(), true);
    readiness.markLeaseLost();
    assert.equal(readiness.isAcceptingConnections(), false);
    readiness.markListening();
    assert.equal(readiness.isAcceptingConnections(), false);
    readiness.markStopping();
    assert.equal(readiness.isAcceptingConnections(), false);
  });

  it("keeps liveness independent and readiness bound to startup and PostgreSQL", async () => {
    let queries = 0;
    const starting = await serve(async () => { queries += 1; }, false);
    assert.equal((await fetch(`${starting}/health/live`)).status, 200);
    assert.equal((await fetch(`${starting}/health/ready`)).status, 503);
    assert.equal(queries, 0);

    const ready = await serve(async () => { queries += 1; }, true);
    assert.equal((await fetch(`${ready}/health/ready`)).status, 200);
    assert.equal(queries, 1);

    const unavailable = await serve(async () => { throw new Error("database unavailable"); }, true);
    const response = await fetch(`${unavailable}/health/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "database_unavailable" });
  });

  it("exposes bounded aggregate counters without room, player, ticket, or checkpoint data", async () => {
    const metrics = new RuntimeMetrics();
    metrics.increment("rooms_created_total");
    metrics.increment("player_commands_committed_total");
    metrics.increment("player_commands_committed_total");
    metrics.increment("room_finalization_failures_total");
    const app = express();
    registerMetricsRoute(app, metrics);
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("HTTP server address is unavailable");
    const response = await fetch(`http://127.0.0.1:${address.port}/metrics`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/plain/);
    assert.match(body, /pootown_realtime_rooms_created_total 1/);
    assert.match(body, /pootown_realtime_player_commands_committed_total 2/);
    assert.match(body, /pootown_realtime_room_finalization_failures_total 1/);
    assert.doesNotMatch(body, /game_secret|room_secret|player_secret|ticket_secret|reservation_secret|user_secret/i);
  });
});
