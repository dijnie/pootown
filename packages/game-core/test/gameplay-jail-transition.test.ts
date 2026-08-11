import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gameId,
  initializeGameplayAggregate,
  isValidActiveGameplayAggregateState,
  matchCash,
  playerId,
  transitionGameplayJail,
  type ActiveGameplayAggregateState,
  type GameplayJailCommand,
  type InProgressGameState,
  type RandomCheckpoint,
  type RandomSource,
} from "../src";

const firstPlayer = playerId("player_0");
const secondPlayer = playerId("player_1");

const unusedRandomSource: RandomSource = {
  nextBytes: () => new Uint8Array(),
  checkpoint: (): RandomCheckpoint => ({ algorithm: "unused", state: "0", draws: 0, bytesConsumed: 0 }),
  canResume: () => true,
};

function aggregate(cash = 1_500n, cards = 0): ActiveGameplayAggregateState {
  const lifecycle: InProgressGameState = {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId("jail_transition_test"),
    creatorId: firstPlayer,
    lifecycle: "inProgress",
    minimumPlayers: 2,
    maximumPlayers: 4,
    seats: [
      { seatIndex: 0, playerId: firstPlayer, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_000 },
      { seatIndex: 1, playerId: secondPlayer, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_100 },
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
    rng: { algorithm: "unused", state: "0", draws: 0, bytesConsumed: 0 },
  };
  const initialized = initializeGameplayAggregate(lifecycle);
  assert.notEqual(initialized, null);
  return {
    ...initialized!,
    players: initialized!.players.map((player, index) => index === 0 && player !== null
      ? { ...player, cash: matchCash(cash), position: 10, inJail: true, getOutOfJailCards: cards }
      : player),
  } as ActiveGameplayAggregateState;
}

function command(type: GameplayJailCommand["type"], version = 3): GameplayJailCommand {
  return { type, expectedStateVersion: version, payload: {} };
}

function context(player = firstPlayer, nowMs = 3_000) {
  return { actor: { kind: "player" as const, playerId: player }, nowMs, randomSource: unusedRandomSource };
}

describe("gameplay jail transition", () => {
  it("pays the exact fine, releases the player, and force-advances the turn", () => {
    const state = aggregate(50n);
    const result = transitionGameplayJail(state, command("payJailFine"), context());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.players[0]?.cash, 0n);
    assert.equal(result.state.players[0]?.inJail, false);
    assert.equal(result.state.turn.currentSeatIndex, 1);
    assert.equal(result.state.turn.phase, "awaitingRoll");
    assert.equal(result.state.lastDice, null);
    assert.equal(result.state.bankCash, state.bankCash);
    assert.deepEqual(result.events, [{ type: "jailExited", playerId: firstPlayer, method: "fine" }]);
    assert.equal(isValidActiveGameplayAggregateState(result.state), true);
  });

  it("uses one card, releases the player, and force-advances the turn", () => {
    const state = aggregate(1_500n, 1);
    const result = transitionGameplayJail(state, command("useJailCard"), context());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.players[0]?.getOutOfJailCards, 0);
    assert.equal(result.state.players[0]?.inJail, false);
    assert.equal(result.state.turn.currentSeatIndex, 1);
    assert.deepEqual(result.events, [{ type: "jailExited", playerId: firstPlayer, method: "card" }]);
    assert.equal(isValidActiveGameplayAggregateState(result.state), true);
  });

  it("records an explicit bankruptcy phase when the fine is unaffordable", () => {
    const state = aggregate(49n);
    const result = transitionGameplayJail(state, command("payJailFine"), context());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.players[0]?.cash, 49n);
    assert.equal(result.state.players[0]?.inJail, true);
    assert.equal(result.state.bankruptcyRequiredSeatIndex, 0);
    assert.equal(result.state.turn.phase, "awaitingBankruptcy");
    assert.equal(result.state.lastDice, null);
    assert.equal(isValidActiveGameplayAggregateState(result.state), true);
  });

  it("rejects unavailable, stale, unauthorized, malformed, and backward-time actions unchanged", () => {
    const state = aggregate();
    const notJailed = {
      ...state,
      players: state.players.map((player, index) => index === 0 && player !== null
        ? { ...player, position: 0, inJail: false }
        : player),
    } as ActiveGameplayAggregateState;
    const cases = [
      transitionGameplayJail(state, command("useJailCard"), context()),
      transitionGameplayJail(state, command("payJailFine", 2), context()),
      transitionGameplayJail(state, command("payJailFine"), context(secondPlayer)),
      transitionGameplayJail(state, command("payJailFine"), context(firstPlayer, 1_999)),
      transitionGameplayJail(notJailed, command("payJailFine"), context()),
      transitionGameplayJail(
        state,
        { type: "payJailFine", expectedStateVersion: 3, payload: { amount: 1 } } as unknown as GameplayJailCommand,
        context(),
      ),
    ];
    for (const result of cases) {
      assert.equal(result.ok, false);
      assert.strictEqual(result.state, result === cases[4] ? notJailed : state);
    }
  });
});
