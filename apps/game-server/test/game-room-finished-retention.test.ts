import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Room } from "@colyseus/core";
import { parseGameplaySnapshot } from "@pootown/game-core";

import { createGameRoomClass } from "../src/rooms/game-room.js";
import { finishedGameplaySnapshot } from "./database-test-helper.js";

interface FinishedTestRoom extends Room {
  scheduleSettlement(state: ReturnType<typeof parseGameplaySnapshot>): void;
}

describe("finished room retention", () => {
  it("unloads once exactly ten minutes after the durable terminal time", async () => {
    const state = parseGameplaySnapshot(finishedGameplaySnapshot("game_retention", 3));
    assert.equal(state.lifecycle, "finished");
    if (state.lifecycle !== "finished") throw new Error("fixture is not terminal");
    let disconnects = 0;
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const RoomClass = createGameRoomClass({
      api: {
        async settleSession() {
          return { contractVersion: 1, operationId: "operation_retention" };
        },
      },
      nowMs: () => state.terminal.endedAtMs + 300_000,
    } as never);
    const room = new RoomClass() as FinishedTestRoom;
    Object.assign(room, {
      disconnect: async () => { disconnects += 1; },
      gameId: state.gameId,
      lock: async () => undefined,
      logicalRoomId: "room_retention",
      roomClock: { stop: () => undefined },
      clock: {
        setTimeout(callback: () => void, delay: number) {
          scheduled.push({ callback, delay });
        },
      },
    });

    room.scheduleSettlement(state);
    room.scheduleSettlement(state);
    assert.deepEqual(scheduled.map((timer) => timer.delay), [300_000]);
    scheduled[0]?.callback();
    await Promise.resolve();
    assert.equal(disconnects, 1);
  });

  it("does not restart the retention window when restoring an expired room", async () => {
    const state = parseGameplaySnapshot(finishedGameplaySnapshot("game_retention_expired", 3));
    assert.equal(state.lifecycle, "finished");
    if (state.lifecycle !== "finished") throw new Error("fixture is not terminal");
    let disconnects = 0;
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const RoomClass = createGameRoomClass({
      api: {
        async settleSession() {
          return { contractVersion: 1, operationId: "operation_retention_expired" };
        },
      },
      nowMs: () => state.terminal.endedAtMs + 600_001,
    } as never);
    const room = new RoomClass() as FinishedTestRoom;
    Object.assign(room, {
      disconnect: async () => { disconnects += 1; },
      gameId: state.gameId,
      lock: async () => undefined,
      logicalRoomId: "room_retention_expired",
      roomClock: { stop: () => undefined },
      clock: {
        setTimeout(callback: () => void, delay: number) {
          scheduled.push({ callback, delay });
        },
      },
    });

    room.scheduleSettlement(state);
    assert.deepEqual(scheduled.map((timer) => timer.delay), [0]);
    scheduled[0]?.callback();
    await Promise.resolve();

    assert.equal(disconnects, 1);
  });
});
