import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gameId,
  initializeGameplayAggregate,
  isValidActiveGameplayAggregateState,
  matchCash,
  playerId,
  transitionGameplayBankruptcy,
  type ActiveGameplayAggregateState,
  type DeclareBankruptcyGameplayCommand,
  type InProgressGameState,
  type RandomCheckpoint,
  type RandomSource,
} from "../src";

const players = [playerId("player_0"), playerId("player_1"), playerId("player_2")];
const unusedRandomSource: RandomSource = {
  nextBytes: () => new Uint8Array(),
  checkpoint: (): RandomCheckpoint => ({ algorithm: "unused", state: "0", draws: 0, bytesConsumed: 0 }),
  canResume: () => true,
};

function aggregate(playerCount: 2 | 3, aggregateGameId = "bankruptcy_transition_test"): ActiveGameplayAggregateState {
  const lifecycle: InProgressGameState = {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId(aggregateGameId),
    creatorId: players[0]!,
    lifecycle: "inProgress",
    minimumPlayers: 2,
    maximumPlayers: 4,
    seats: [
      { seatIndex: 0, playerId: players[0]!, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_000 },
      { seatIndex: 1, playerId: players[1]!, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_100 },
      playerCount === 3
        ? { seatIndex: 2, playerId: players[2]!, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_200 }
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
    rng: { algorithm: "unused", state: "0", draws: 0, bytesConsumed: 0 },
  };
  const initialized = initializeGameplayAggregate(lifecycle);
  assert.notEqual(initialized, null);
  return {
    ...initialized!,
    players: initialized!.players.map((player, index) => index === 0 && player !== null
      ? { ...player, cash: matchCash(49n) }
      : player),
    properties: initialized!.properties.map((property) => property.position === 5
      ? { ...property, ownerSeatIndex: 0 }
      : property),
    turn: {
      phase: "awaitingBankruptcy",
      currentSeatIndex: 0,
      startedAtMs: 2_500,
      deadlineAtMs: 92_500,
      emittedWarnings: [],
    },
    bankruptcyRequiredSeatIndex: 0,
    lastDice: { dice: [1, 2], total: 3, isDoubles: false },
  } as ActiveGameplayAggregateState;
}

function command(version = 3): DeclareBankruptcyGameplayCommand {
  return { type: "declareBankruptcy", expectedStateVersion: version, payload: {} };
}

function context(actor = players[0]!, nowMs = 3_000) {
  return { actor: { kind: "player" as const, playerId: actor }, nowMs, randomSource: unusedRandomSource };
}

describe("gameplay bankruptcy transition", () => {
  it("liquidates once, preserves joined identity, and advances to the next stable active seat", () => {
    const participantTrade = {
      tradeId: "trade_participant",
      proposerSeatIndex: 0,
      receiverSeatIndex: 1,
      terms: { tradeType: "moneyOnly" as const, offeredCash: matchCash(1n), requestedCash: matchCash(0n) },
      createdAtMs: 2_500,
      expiresAtMs: 3_602_500,
    };
    const unrelatedTrade = {
      tradeId: "trade_unrelated",
      proposerSeatIndex: 1,
      receiverSeatIndex: 2,
      terms: { tradeType: "moneyOnly" as const, offeredCash: matchCash(2n), requestedCash: matchCash(0n) },
      createdAtMs: 2_500,
      expiresAtMs: 3_602_500,
    };
    const state = { ...aggregate(3), activeTrades: [participantTrade, unrelatedTrade] } as ActiveGameplayAggregateState;
    const result = transitionGameplayBankruptcy(state, command(), context());
    assert.equal(result.ok, true);
    if (!result.ok || result.state.lifecycle !== "inProgress") return;
    assert.equal(result.state.stateVersion, 4);
    assert.equal(result.state.players[0]?.playerId, players[0]);
    assert.equal(result.state.players[0]?.status, "eliminated");
    assert.equal(result.state.players[0]?.cash, 0n);
    assert.equal(result.state.properties[5]?.ownerSeatIndex, null);
    assert.equal(result.state.bankCash, 1_000_149n);
    assert.equal(result.state.turn.currentSeatIndex, 1);
    assert.equal(result.state.turn.phase, "awaitingRoll");
    assert.equal(result.state.bankruptcyRequiredSeatIndex, null);
    assert.equal(result.state.lastDice, null);
    assert.deepEqual(result.state.activeTrades.map((trade) => trade.tradeId), ["trade_unrelated"]);
    assert.notStrictEqual(result.state.activeTrades[0], unrelatedTrade);
    assert.notStrictEqual(result.state.activeTrades[0]?.terms, unrelatedTrade.terms);
    assert.equal(Object.isFrozen(result.state.activeTrades[0]), true);
    assert.equal(Object.isFrozen(result.state.activeTrades[0]?.terms), true);
    assert.deepEqual(result.events, [{
      type: "playerBankrupt",
      playerId: players[0],
      creditorId: null,
      liquidationValue: 100n,
      cashTransferred: 49n,
    }]);
    assert.equal(isValidActiveGameplayAggregateState(result.state), true);
    assert.equal(Object.isFrozen(result.state), true);
    assert.equal(Object.isFrozen(result.state.players[0]), true);
    assert.equal(Object.isFrozen(result.events), true);
  });

  it("finishes once, derives the winner, and emits an amount-free settlement entitlement", () => {
    const state = aggregate(2);
    const result = transitionGameplayBankruptcy(state, command(), context());
    assert.equal(result.ok, true);
    if (!result.ok || result.state.lifecycle !== "finished") return;
    assert.equal(result.state.turn.phase, "finished");
    assert.equal(result.state.terminal.reason, "lastPlayerStanding");
    assert.equal(result.state.terminal.winnerSeatIndex, 1);
    assert.deepEqual(result.events.map((event) => event.type), [
      "playerBankrupt",
      "gameEnded",
      "settlementEntitled",
    ]);
    const entitlement = result.events[2];
    assert.equal(entitlement?.type, "settlementEntitled");
    if (entitlement?.type === "settlementEntitled") {
      assert.equal(entitlement.winnerId, players[1]);
      assert.equal(entitlement.entitlementKey, "bankruptcy_transition_test");
      assert.equal("amount" in entitlement, false);
    }
    assert.equal(Object.isFrozen(result.state), true);
    assert.equal(Object.isFrozen(result.state.terminal), true);
    assert.equal(Object.isFrozen(result.state.terminal.ranking), true);
    assert.equal(Object.isFrozen(result.events[1]), true);
  });

  it("keeps the settlement entitlement key within the public contract at maximum game ID length", () => {
    const maximumGameId = "g".repeat(128);
    const result = transitionGameplayBankruptcy(aggregate(2, maximumGameId), command(), context());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const entitlement = result.events.find((event) => event.type === "settlementEntitled");
    assert.equal(entitlement?.type, "settlementEntitled");
    if (entitlement?.type !== "settlementEntitled") return;
    assert.equal(entitlement.entitlementKey, maximumGameId);
    assert.equal(entitlement.entitlementKey.length, 128);
  });

  it("rejects wrong actor, phase, version, time, and forged payload without mutation", () => {
    const state = aggregate(3);
    const wrongPhase = {
      ...state,
      turn: { phase: "awaitingEndTurn", currentSeatIndex: 0, startedAtMs: 2_500, deadlineAtMs: 92_500, emittedWarnings: [] },
      bankruptcyRequiredSeatIndex: null,
    } as ActiveGameplayAggregateState;
    const cases: readonly [ActiveGameplayAggregateState, ReturnType<typeof transitionGameplayBankruptcy>][] = [
      [state, transitionGameplayBankruptcy(state, command(2), context())],
      [state, transitionGameplayBankruptcy(state, command(), context(players[1]))],
      [state, transitionGameplayBankruptcy(state, command(), context(players[0], 2_499))],
      [wrongPhase, transitionGameplayBankruptcy(wrongPhase, command(), context())],
      [state, transitionGameplayBankruptcy(
        state,
        { type: "declareBankruptcy", expectedStateVersion: 3, payload: { creditorId: players[1] } } as unknown as DeclareBankruptcyGameplayCommand,
        context(),
      )],
    ];
    for (const [input, result] of cases) {
      assert.equal(result.ok, false);
      assert.strictEqual(result.state, input);
    }
  });
});
