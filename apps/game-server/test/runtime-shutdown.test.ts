import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shutdownRuntime } from "../src/main.js";

describe("game server shutdown", () => {
  it("always closes PostgreSQL when Colyseus shutdown fails", async () => {
    const calls: string[] = [];
    const failure = new Error("colyseus shutdown failed");
    await assert.rejects(shutdownRuntime({
      async gracefullyShutdown(exit) {
        calls.push(`colyseus:${String(exit)}`);
        throw failure;
      },
    }, {
      async end() {
        calls.push("postgres");
      },
    }), (error: unknown) => error === failure);
    assert.deepEqual(calls, ["colyseus:false", "postgres"]);
  });

  it("reports database cleanup failure after Colyseus stops", async () => {
    const failure = new Error("postgres shutdown failed");
    await assert.rejects(shutdownRuntime({
      async gracefullyShutdown() {},
    }, {
      async end() { throw failure; },
    }), (error: unknown) => error === failure);
  });
});
