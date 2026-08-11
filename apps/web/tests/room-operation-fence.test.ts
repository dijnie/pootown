import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RoomOperationFence } from "../services/room-operation-fence";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("room operation fence", () => {
  it("prevents a slow old completion from overwriting a newer connection", async () => {
    const fence = new RoomOperationFence();
    const slow = deferred();
    const fast = deferred();
    let state = "initial";

    const run = async (operation: number, completion: Promise<void>, next: string) => {
      await completion;
      if (fence.isCurrent(operation)) state = next;
    };

    const oldOperation = fence.start();
    const oldResult = run(oldOperation, slow.promise, "old");
    const newOperation = fence.start();
    const newResult = run(newOperation, fast.promise, "new");
    fast.resolve();
    await newResult;
    slow.resolve();
    await oldResult;

    assert.equal(state, "new");
  });
});
