import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gameId,
  initializeGameplayAggregate,
  isValidActiveGameplayAggregateState,
  matchCash,
  playerId,
  transitionGameplayCard,
  type ActiveGameplayAggregateState,
  type CardDeck,
  type GameplayCardCommand,
  type InProgressGameState,
  type RandomCheckpoint,
  type RandomSource,
} from "../src";

class CardSource implements RandomSource {
  private cursor: number;

  constructor(private readonly values: readonly number[], cursor = 0) {
    this.cursor = cursor;
  }

  nextBytes(length: number): Uint8Array {
    assert.equal(length, 1);
    const value = this.values[this.cursor++];
    return value === undefined ? new Uint8Array() : Uint8Array.of(value);
  }

  checkpoint(): RandomCheckpoint {
    return { algorithm: "card-test", state: String(this.cursor), draws: this.cursor, bytesConsumed: this.cursor };
  }

  canResume(value: RandomCheckpoint): boolean {
    return value.algorithm === "card-test" && value.state === String(this.cursor);
  }

  fork(value: RandomCheckpoint): RandomSource | null {
    const cursor = Number(value.state);
    if (value.algorithm !== "card-test" || !Number.isSafeInteger(cursor) || cursor < 0 || cursor > this.values.length) {
      return null;
    }
    return new CardSource(this.values, cursor);
  }
}

const firstPlayer = playerId("player_0");
const secondPlayer = playerId("player_1");
const thirdPlayer = playerId("player_2");

function aggregate(
  deck: CardDeck,
  position = deck === "chance" ? 7 : 2,
  cash = 1_500n,
  isDoubles = false,
  includeEliminatedPlayer = false,
): ActiveGameplayAggregateState {
  const lifecycle: InProgressGameState = {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId("card_transition_test"),
    creatorId: firstPlayer,
    lifecycle: "inProgress",
    minimumPlayers: 2,
    maximumPlayers: 4,
    seats: [
      { seatIndex: 0, playerId: firstPlayer, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_000 },
      { seatIndex: 1, playerId: secondPlayer, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_100 },
      includeEliminatedPlayer
        ? { seatIndex: 2, playerId: thirdPlayer, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_200 }
        : null,
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
    rng: { algorithm: "card-test", state: "0", draws: 0, bytesConsumed: 0 },
  };
  const initialized = initializeGameplayAggregate(lifecycle);
  assert.notEqual(initialized, null);
  return {
    ...initialized!,
    players: initialized!.players.map((player, index) => {
      if (index === 0 && player !== null) return { ...player, position, cash: matchCash(cash) };
      if (index === 2 && player !== null) return { ...player, status: "eliminated" as const, cash: matchCash(0n) };
      return player;
    }),
    turn: {
      phase: "awaitingCardDraw",
      deck,
      currentSeatIndex: 0,
      startedAtMs: 2_500,
      deadlineAtMs: 92_500,
      emittedWarnings: [],
    },
    lastDice: { dice: isDoubles ? [2, 2] : [1, 2], total: isDoubles ? 4 : 3, isDoubles },
  } as ActiveGameplayAggregateState;
}

function command(deck: CardDeck, version = 3): GameplayCardCommand {
  return {
    type: deck === "chance" ? "drawChanceCard" : "drawCommunityChestCard",
    expectedStateVersion: version,
    payload: {},
  };
}

function context(source: RandomSource, actor = firstPlayer, nowMs = 3_000) {
  return { actor: { kind: "player" as const, playerId: actor }, nowMs, randomSource: source };
}

describe("gameplay card transition", () => {
  it("resolves every frozen Chance card and derives each follow-up phase", () => {
    const expected = [
      { effect: "moveToNearest", position: 1, cash: 1_700n, phase: "awaitingPropertyDecision" },
      { effect: "money", position: 7, cash: 1_450n, phase: "awaitingEndTurn" },
      { effect: "money", position: 7, cash: 1_600n, phase: "awaitingEndTurn" },
      { effect: "move", position: 4, cash: 1_500n, phase: "awaitingTaxPayment" },
      { effect: "getOutOfJailFree", position: 7, cash: 1_500n, phase: "awaitingEndTurn" },
    ] as const;
    for (const [index, item] of expected.entries()) {
      const result = transitionGameplayCard(aggregate("chance"), command("chance"), context(new CardSource([index])));
      assert.equal(result.ok, true, `chance card ${index + 1}`);
      if (!result.ok) continue;
      assert.equal(result.state.players[0]?.position, item.position);
      assert.equal(result.state.players[0]?.cash, item.cash);
      assert.equal(result.state.turn.phase, item.phase);
      assert.equal(result.events[0]?.type, "cardDrawn");
      if (result.events[0]?.type === "cardDrawn") assert.equal(result.events[0].effect, item.effect);
      assert.equal(isValidActiveGameplayAggregateState(result.state), true);
    }
  });

  it("resolves every frozen Community Chest card including the approved position 20 correction", () => {
    const expected = [
      { effect: "collectFromPlayers", position: 2, cash: 1_550n },
      { effect: "money", position: 2, cash: 1_600n },
      { effect: "move", position: 20, cash: 1_500n },
      { effect: "repairFree", position: 2, cash: 1_500n },
      { effect: "money", position: 2, cash: 1_450n },
    ] as const;
    for (const [index, item] of expected.entries()) {
      const result = transitionGameplayCard(
        aggregate("communityChest"),
        command("communityChest"),
        context(new CardSource([index])),
      );
      assert.equal(result.ok, true, `community card ${index + 1}`);
      if (!result.ok) continue;
      assert.equal(result.state.players[0]?.position, item.position);
      assert.equal(result.state.players[0]?.cash, item.cash);
      assert.equal(result.state.bankCash, 1_000_000n);
      assert.equal(result.events[0]?.type, "cardDrawn");
      assert.equal(isValidActiveGameplayAggregateState(result.state), true);
    }
  });

  it("preserves the source rule that collection counts joined eliminated seats", () => {
    const result = transitionGameplayCard(
      aggregate("communityChest", 2, 1_500n, false, true),
      command("communityChest"),
      context(new CardSource([0])),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.players[0]?.cash, 1_600n);
    assert.equal(result.state.players[2]?.status, "eliminated");
    assert.equal(result.state.players[2]?.cash, 0n);
    assert.equal(result.state.bankCash, 1_000_000n);
    assert.equal(isValidActiveGameplayAggregateState(result.state), true);
  });

  it("runs movement landing follow-up and preserves doubles continuation", () => {
    const backThree = transitionGameplayCard(
      aggregate("chance", 36),
      command("chance"),
      context(new CardSource([3])),
    );
    assert.equal(backThree.ok, true);
    if (backThree.ok) {
      assert.equal(backThree.state.players[0]?.position, 33);
      assert.deepEqual(backThree.state.turn, {
        phase: "awaitingCardDraw",
        deck: "communityChest",
        currentSeatIndex: 0,
        startedAtMs: 3_000,
        deadlineAtMs: 93_000,
        emittedWarnings: [],
      });
    }

    const doubles = transitionGameplayCard(
      aggregate("chance", 7, 1_500n, true),
      command("chance"),
      context(new CardSource([2])),
    );
    assert.equal(doubles.ok, true);
    if (doubles.ok) assert.equal(doubles.state.turn.phase, "awaitingRoll");
  });

  it("records card bankruptcy and supports the internal randomness command", () => {
    const bankrupt = transitionGameplayCard(
      aggregate("communityChest", 2, 49n),
      command("communityChest"),
      context(new CardSource([4])),
    );
    assert.equal(bankrupt.ok, true);
    if (bankrupt.ok) {
      assert.equal(bankrupt.state.players[0]?.cash, 0n);
      assert.equal(bankrupt.state.bankruptcyRequiredSeatIndex, 0);
      assert.equal(bankrupt.state.turn.phase, "awaitingBankruptcy");
      assert.equal(isValidActiveGameplayAggregateState(bankrupt.state), true);
    }

    const state = aggregate("chance");
    const internal = transitionGameplayCard(
      state,
      { type: "resolveRandomCard", expectedStateVersion: 3, payload: { deck: "chance" } },
      { actor: { kind: "internal" }, nowMs: 3_000, randomSource: new CardSource([1]) },
    );
    assert.equal(internal.ok, true);
  });

  it("uses unbiased rejection sampling and commits only the forked checkpoint", () => {
    const state = aggregate("chance");
    const source = new CardSource([255, 0]);
    const result = transitionGameplayCard(state, command("chance"), context(source));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.state.rng, { algorithm: "card-test", state: "2", draws: 2, bytesConsumed: 2 });
    assert.deepEqual(source.checkpoint(), { algorithm: "card-test", state: "0", draws: 0, bytesConsumed: 0 });
    assert.equal(Object.isFrozen(result.state), true);
    assert.equal(Object.isFrozen(result.state.rng), true);
    assert.equal(Object.isFrozen(result.events), true);
    assert.equal(Object.isFrozen(result.events[0]), true);
  });

  it("rejects wrong deck, actor, version, time, payload, and exhausted randomness unchanged", () => {
    const state = aggregate("chance");
    const cases = [
      transitionGameplayCard(state, command("communityChest"), context(new CardSource([0]))),
      transitionGameplayCard(state, command("chance"), context(new CardSource([0]), secondPlayer)),
      transitionGameplayCard(state, command("chance", 2), context(new CardSource([0]))),
      transitionGameplayCard(state, command("chance"), context(new CardSource([0]), firstPlayer, 2_499)),
      transitionGameplayCard(
        state,
        { type: "drawChanceCard", expectedStateVersion: 3, payload: { cardId: 1 } } as unknown as GameplayCardCommand,
        context(new CardSource([0])),
      ),
      transitionGameplayCard(state, command("chance"), context(new CardSource(Array(32).fill(255)))),
    ];
    for (const result of cases) {
      assert.equal(result.ok, false);
      assert.strictEqual(result.state, state);
    }
  });
});
