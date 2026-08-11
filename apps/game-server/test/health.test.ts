import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, describe, it } from "node:test";
import express from "express";
import type { Pool } from "pg";

import { registerHealthRoutes, RuntimeReadiness } from "../src/health.js";

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
});
