import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AuthMutationQueue } from "../services/auth-mutation-queue.js";

describe("auth cookie mutation queue", () => {
  it("lets an old refresh finish before a newly requested login writes its cookie", async () => {
    const queue = new AuthMutationQueue();
    const order: string[] = [];
    let finishRefresh!: () => void;
    let markRefreshStarted!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });

    const refresh = queue.run(async () => {
      order.push("refresh:start");
      markRefreshStarted();
      await refreshGate;
      order.push("refresh:finish");
    });
    const login = queue.run(async () => {
      order.push("login");
    });

    await refreshStarted;
    assert.deepEqual(order, ["refresh:start"]);
    finishRefresh();
    await Promise.all([refresh, login]);
    assert.deepEqual(order, ["refresh:start", "refresh:finish", "login"]);
  });

  it("continues after a failed mutation", async () => {
    const queue = new AuthMutationQueue();
    await assert.rejects(queue.run(async () => Promise.reject(new Error("refresh failed"))));
    assert.equal(await queue.run(async () => "login succeeded"), "login succeeded");
  });
});
