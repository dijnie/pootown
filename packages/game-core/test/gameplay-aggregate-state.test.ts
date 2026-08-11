import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPropertyStates,
  gameId,
  initializeGameplayAggregate,
  matchCash,
  playerId,
  type InProgressGameState,
} from "../src";

function startedState(): InProgressGameState {
  return {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId("game_aggregate"),
    creatorId: playerId("player_0"),
    lifecycle: "inProgress",
    minimumPlayers: 2,
    maximumPlayers: 4,
    seats: [
      {
        seatIndex: 0, playerId: playerId("player_0"), status: "active", cash: matchCash(1_500n),
        position: 0, inJail: false, joinedAtMs: 1_000,
      },
      {
        seatIndex: 1, playerId: playerId("player_1"), status: "active", cash: matchCash(1_500n),
        position: 0, inJail: false, joinedAtMs: 1_100,
      },
      null,
      null,
    ],
    bankCash: matchCash(1_000_000n),
    freeParkingPool: matchCash(0n),
    housesRemaining: 32,
    hotelsRemaining: 12,
    createdAtMs: 1_000,
    startedAtMs: 2_000,
    cancelledAtMs: null,
    timeLimitMs: 600_000,
    gameEndAtMs: 602_000,
    turnTimeoutMs: 90_000,
    turn: { phase: "awaitingRoll", currentSeatIndex: 0, startedAtMs: 2_000, deadlineAtMs: 92_000 },
    rng: { algorithm: "test", state: "seed", draws: 0, bytesConsumed: 0 },
  };
}

describe("gameplay aggregate state", () => {
  it("initializes the complete canonical gameplay state from the started lifecycle", () => {
    const lifecycle = startedState();
    const aggregate = initializeGameplayAggregate(lifecycle);
    assert.notEqual(aggregate, null);
    if (aggregate === null) return;
    assert.equal(aggregate.stateVersion, lifecycle.stateVersion);
    assert.equal(aggregate.players.length, 4);
    assert.deepEqual(aggregate.players[0], {
      ...lifecycle.seats[0],
      jailTurns: 0,
      consecutiveDoubles: 0,
      missedTurns: 0,
      getOutOfJailCards: 0,
    });
    assert.deepEqual(aggregate.properties, createPropertyStates());
    assert.deepEqual(aggregate.turn, {
      phase: "awaitingRoll",
      currentSeatIndex: 0,
      startedAtMs: 2_000,
      deadlineAtMs: 92_000,
      emittedWarnings: [],
    });
    assert.deepEqual(aggregate.activeTrades, []);
    assert.equal(aggregate.lastDice, null);
    assert.equal(aggregate.terminal, null);
    assert.equal(aggregate.bankruptcyRequiredSeatIndex, null);
    assert.notStrictEqual(aggregate.rng, lifecycle.rng);
    assert.equal(Object.isFrozen(aggregate), true);
    assert.equal(Object.isFrozen(aggregate.players), true);
    assert.equal(Object.isFrozen(aggregate.properties), true);
    assert.equal(Object.isFrozen(aggregate.rng), true);
  });

  it("fails closed on malformed lifecycle state", () => {
    const valid = startedState();
    const malformed: readonly InProgressGameState[] = [
      { ...valid, seats: valid.seats.slice(0, 3) },
      { ...valid, seats: [valid.seats[1]!, valid.seats[1]!, null, null] },
      { ...valid, housesRemaining: 31 },
      { ...valid, turn: { ...valid.turn, currentSeatIndex: 3 } },
      { ...valid, turn: { ...valid.turn, deadlineAtMs: valid.turn.deadlineAtMs - 1 } },
      { ...valid, bankCash: -1n as ReturnType<typeof matchCash> },
      { ...valid, rng: { ...valid.rng, draws: -1 } },
      { ...valid, timeLimitMs: 600_001 },
      { ...valid, gameEndAtMs: null },
      { ...valid, createdAtMs: -1 },
      { ...valid, turnTimeoutMs: 89_999 },
      { ...valid, turn: { ...valid.turn, startedAtMs: valid.turn.startedAtMs + 1 } },
      { ...valid, gameId: "bad id" as InProgressGameState["gameId"] },
      { ...valid, seats: [{ ...valid.seats[0]!, cash: matchCash(1_499n) }, valid.seats[1]!, null, null] },
      { ...valid, seats: [{ ...valid.seats[0]!, status: "eliminated" }, valid.seats[1]!, null, null] },
      { ...valid, seats: [{ ...valid.seats[0]!, position: 1 }, valid.seats[1]!, null, null] },
      { ...valid, extra: true } as InProgressGameState,
      { ...valid, turn: { ...valid.turn, extra: true } } as InProgressGameState,
      { ...valid, rng: { ...valid.rng, extra: true } } as InProgressGameState,
      {
        ...valid,
        seats: [{ ...valid.seats[0]!, extra: true }, valid.seats[1], null, null],
      } as InProgressGameState,
    ];
    for (const state of malformed) assert.equal(initializeGameplayAggregate(state), null);
  });
});
