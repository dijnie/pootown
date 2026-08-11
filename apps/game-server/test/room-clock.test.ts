import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initializeGameplayAggregate,
  playerId,
  transition,
  type GameplayAggregateState,
} from "@pootown/game-core";

import { SecureRandomSource } from "../src/random/secure-random-source.js";
import { createWaitingState } from "../src/rooms/bootstrap-state.js";
import { nextScheduledRoomCommand, RoomClock } from "../src/timers/room-clock.js";

const startedAtMs = Date.parse("2026-08-11T22:00:00.000Z");

function activeState(timeLimitMs: number | null = 3_600_000): Extract<GameplayAggregateState, { lifecycle: "inProgress" }> {
  const random = new SecureRandomSource(Buffer.alloc(32, 7));
  const waiting = createWaitingState({
    contractVersion: 1,
    gameId: "game_clock" as never,
    gameDefinitionId: "classic_100" as never,
    gameDefinitionVersion: 1,
    rulesetId: "pootown-rust-source-v1",
    roomId: "room_clock" as never,
    lifecycle: "open",
    stateVersion: 0,
    creatorPlayerId: "player_clock_owner" as never,
    maximumPlayers: 4,
    timeLimitMs,
    createdAtMs: startedAtMs - 1_000,
    startedAtMs: null,
    players: [
      { playerId: "player_clock_owner" as never, seatIndex: 0, joinedAtMs: startedAtMs - 1_000 },
      { playerId: "player_clock_second" as never, seatIndex: 1, joinedAtMs: startedAtMs - 500 },
    ],
  }, random);
  const resumed = random.fork(waiting.rng);
  assert.notEqual(resumed, null);
  const started = transition(waiting, {
    type: "startGame",
    expectedStateVersion: waiting.stateVersion,
    payload: {},
  }, {
    actorId: playerId("player_clock_owner"),
    nowMs: startedAtMs,
    randomSource: resumed!,
  });
  assert.equal(started.ok, true);
  if (!started.ok || started.state === null || started.state.lifecycle !== "inProgress") {
    throw new Error("Clock fixture did not start");
  }
  const gameplay = initializeGameplayAggregate(started.state);
  if (gameplay === null || gameplay.lifecycle !== "inProgress") throw new Error("Clock fixture did not initialize");
  return gameplay;
}

describe("durable room clock", () => {
  it("schedules canonical warning, recovery, timeout, and game-limit commands", () => {
    const state = activeState();
    const deadline = state.turn.deadlineAtMs;
    const beforeWarning = nextScheduledRoomCommand(state, deadline - 30_001);
    const atWarning = nextScheduledRoomCommand(state, deadline - 30_000);
    const recoveredAtTen = nextScheduledRoomCommand(state, deadline - 10_000);
    const atTimeout = nextScheduledRoomCommand(state, deadline);
    assert.equal(beforeWarning?.dueAtMs, deadline - 30_000);
    assert.equal(atWarning?.command.type, "warnTurnThirtySeconds");
    assert.equal(recoveredAtTen?.command.type, "warnTurnTenSeconds");
    assert.equal(atTimeout?.command.type, "handleTurnTimeout");
    assert.equal(
      nextScheduledRoomCommand(state, deadline - 30_000)?.command.requestId,
      atWarning?.command.requestId,
    );

    const limited = activeState(90_000);
    assert.equal(limited.gameEndAtMs, limited.turn.deadlineAtMs);
    assert.equal(
      nextScheduledRoomCommand(limited, limited.turn.deadlineAtMs)?.command.type,
      "enforceGameTimeLimit",
    );
    assert.equal(nextScheduledRoomCommand({ ...state, bankruptcyRequiredSeatIndex: 0 }, deadline), null);
  });

  it("re-arms from committed state and fails closed when dispatch does not advance", async () => {
    const state = activeState();
    const timers: Array<() => void> = [];
    const failures: unknown[] = [];
    let clock: RoomClock;
    clock = new RoomClock({
      nowMs: () => state.turn.deadlineAtMs - 30_000,
      setTimer(handler) {
        timers.push(handler);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer() {},
      async dispatch() {
        return true;
      },
      onFailure(error) {
        failures.push(error);
      },
    });
    clock.synchronize(state);
    assert.equal(timers.length, 1);
    timers[0]!();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(failures.length, 1);
    assert.match(String(failures[0]), /did not advance/);
  });
});
