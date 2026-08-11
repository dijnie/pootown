import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gameId,
  initializeGameplayAggregate,
  isValidActiveGameplayAggregateState,
  matchCash,
  playerId,
  transitionGameplayTrade,
  type ActiveGameplayAggregateState,
  type GameplayTradeCommand,
  type InProgressGameState,
  type RandomCheckpoint,
  type RandomSource,
} from "../src";

const ids = [playerId("player_0"), playerId("player_1"), playerId("player_2")];
const randomSource: RandomSource = {
  nextBytes: () => new Uint8Array(),
  checkpoint: (): RandomCheckpoint => ({ algorithm: "unused", state: "0", draws: 0, bytesConsumed: 0 }),
  canResume: () => true,
};

function aggregate(): ActiveGameplayAggregateState {
  const lifecycle: InProgressGameState = {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId("trade_transition_test"),
    creatorId: ids[0]!,
    lifecycle: "inProgress",
    minimumPlayers: 2,
    maximumPlayers: 4,
    seats: [
      { seatIndex: 0, playerId: ids[0]!, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_000 },
      { seatIndex: 1, playerId: ids[1]!, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_100 },
      { seatIndex: 2, playerId: ids[2]!, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_200 },
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
    properties: initialized!.properties.map((property) => property.position === 1
      ? { ...property, ownerSeatIndex: 0 }
      : property.position === 3
        ? { ...property, ownerSeatIndex: 1 }
        : property),
  } as ActiveGameplayAggregateState;
}

function createCommand(version = 3): Extract<GameplayTradeCommand, { readonly type: "createTrade" }> {
  return {
    type: "createTrade",
    expectedStateVersion: version,
    payload: {
      receiverId: ids[1]!,
      terms: { tradeType: "moneyForProperty", offeredCash: matchCash(100n), requestedPropertyPosition: 3 },
    },
  };
}

function context(actor = ids[0]!, tradeId: string | undefined = "trade_1", nowMs = 3_000) {
  return { actor: { kind: "player" as const, playerId: actor }, nowMs, randomSource, tradeId };
}

describe("gameplay trade transition", () => {
  it("creates with a server-owned ID and accepts against current cash and ownership", () => {
    const state = aggregate();
    const created = transitionGameplayTrade(state, createCommand(), context());
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.state.activeTrades[0]?.tradeId, "trade_1");
    assert.equal(created.state.stateVersion, 4);
    assert.equal(created.state.turn.phase, "awaitingRoll");
    assert.equal(created.events[0]?.type, "tradeCreated");

    const accepted = transitionGameplayTrade(
      created.state,
      { type: "acceptTrade", expectedStateVersion: 4, payload: { tradeId: "trade_1" } },
      context(ids[1], undefined, 3_100),
    );
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.state.players[0]?.cash, 1_400n);
    assert.equal(accepted.state.players[1]?.cash, 1_600n);
    assert.equal(accepted.state.properties[3]?.ownerSeatIndex, 0);
    assert.equal(accepted.state.activeTrades.length, 0);
    assert.deepEqual(accepted.events, [{ type: "tradeAccepted", tradeId: "trade_1", proposerId: ids[0], receiverId: ids[1] }]);
    assert.equal(isValidActiveGameplayAggregateState(accepted.state), true);
    assert.equal(Object.isFrozen(accepted.state), true);
    assert.equal(Object.isFrozen(accepted.events), true);
  });

  it("rejects and cancels only by the frozen participant roles", () => {
    const created = transitionGameplayTrade(aggregate(), createCommand(), context());
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const rejected = transitionGameplayTrade(
      created.state,
      { type: "rejectTrade", expectedStateVersion: 4, payload: { tradeId: "trade_1" } },
      context(ids[1], undefined, 3_100),
    );
    assert.equal(rejected.ok, true);
    if (rejected.ok) assert.deepEqual(rejected.events, [{ type: "tradeRejected", tradeId: "trade_1", rejecterId: ids[1] }]);

    const cancelled = transitionGameplayTrade(
      created.state,
      { type: "cancelTrade", expectedStateVersion: 4, payload: { tradeId: "trade_1" } },
      context(ids[0], undefined, 3_100),
    );
    assert.equal(cancelled.ok, true);
    if (cancelled.ok) assert.deepEqual(cancelled.events, [{ type: "tradeCancelled", tradeId: "trade_1", cancellerId: ids[0] }]);
  });

  it("cleans expired trades before create and emits their derived expiry", () => {
    const oldTrade = {
      tradeId: "old_trade",
      proposerSeatIndex: 1,
      receiverSeatIndex: 2,
      terms: { tradeType: "moneyOnly" as const, offeredCash: matchCash(1n), requestedCash: matchCash(0n) },
      createdAtMs: 2_000,
      expiresAtMs: 3_602_000,
    };
    const state = { ...aggregate(), activeTrades: [oldTrade] } as ActiveGameplayAggregateState;
    const result = transitionGameplayTrade(state, createCommand(), context(ids[0], "trade_2", 3_602_000));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.state.activeTrades.map((trade) => trade.tradeId), ["trade_2"]);
    assert.deepEqual(result.events.map((event) => event.type), ["tradeExpired", "tradeCreated"]);
    assert.equal(Object.isFrozen(result.state.activeTrades[0]), true);
    assert.notStrictEqual(result.state.activeTrades[0], oldTrade);
  });

  it("cleans expired sibling trades atomically before accepting an active target", () => {
    const expired = {
      tradeId: "expired_trade",
      proposerSeatIndex: 1,
      receiverSeatIndex: 2,
      terms: { tradeType: "moneyOnly" as const, offeredCash: matchCash(1n), requestedCash: matchCash(0n) },
      createdAtMs: 0,
      expiresAtMs: 3_600_000,
    };
    const active = {
      tradeId: "active_trade",
      proposerSeatIndex: 0,
      receiverSeatIndex: 1,
      terms: { tradeType: "moneyOnly" as const, offeredCash: matchCash(10n), requestedCash: matchCash(0n) },
      createdAtMs: 3_000,
      expiresAtMs: 3_603_000,
    };
    const state = { ...aggregate(), activeTrades: [expired, active] } as ActiveGameplayAggregateState;
    const result = transitionGameplayTrade(
      state,
      { type: "acceptTrade", expectedStateVersion: 3, payload: { tradeId: "active_trade" } },
      context(ids[1], undefined, 3_600_000),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.state.activeTrades, []);
    assert.deepEqual(result.events, [
      { type: "tradeExpired", tradeId: "expired_trade" },
      { type: "tradeAccepted", tradeId: "active_trade", proposerId: ids[0], receiverId: ids[1] },
    ]);
  });

  it("executes the internal expiry cleanup contract without a player command", () => {
    const expired = {
      tradeId: "expired_trade",
      proposerSeatIndex: 0,
      receiverSeatIndex: 1,
      terms: { tradeType: "moneyOnly" as const, offeredCash: matchCash(1n), requestedCash: matchCash(0n) },
      createdAtMs: 0,
      expiresAtMs: 3_600_000,
    };
    const state = { ...aggregate(), activeTrades: [expired] } as ActiveGameplayAggregateState;
    const result = transitionGameplayTrade(
      state,
      { type: "cleanupExpiredTrades", expectedStateVersion: 3, payload: {} },
      { actor: { kind: "internal" }, nowMs: 3_600_000, randomSource },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.stateVersion, 4);
    assert.deepEqual(result.state.activeTrades, []);
    assert.deepEqual(result.events, [{ type: "tradeExpired", tradeId: "expired_trade" }]);
  });

  it("rejects forged IDs, roles, versions, payloads, and bankruptcy races unchanged", () => {
    const state = aggregate();
    const bankruptcy = {
      ...state,
      turn: { phase: "awaitingBankruptcy", currentSeatIndex: 0, startedAtMs: 2_000, deadlineAtMs: 92_000, emittedWarnings: [] },
      bankruptcyRequiredSeatIndex: 0,
    } as ActiveGameplayAggregateState;
    const cases: readonly [ActiveGameplayAggregateState, ReturnType<typeof transitionGameplayTrade>][] = [
      [state, transitionGameplayTrade(state, createCommand(2), context())],
      [state, transitionGameplayTrade(state, createCommand(), context(ids[0], "trade_1", 1_999))],
      [state, transitionGameplayTrade(state, createCommand(), { actor: { kind: "player", playerId: ids[0]! }, nowMs: 3_000, randomSource })],
      [state, transitionGameplayTrade(state, createCommand(), { actor: { kind: "internal" }, nowMs: 3_000, randomSource, tradeId: "trade_1" })],
      [state, transitionGameplayTrade(state, { type: "cleanupExpiredTrades", expectedStateVersion: 3, payload: {} }, context())],
      [state, transitionGameplayTrade(
        state,
        { type: "cleanupExpiredTrades", expectedStateVersion: 3, payload: {} },
        { actor: { kind: "internal" }, nowMs: 3_000, randomSource },
      )],
      [state, transitionGameplayTrade(state, { ...createCommand(), payload: { ...createCommand().payload, receiverId: ids[0]! } }, context())],
      [state, transitionGameplayTrade(state, { type: "acceptTrade", expectedStateVersion: 3, payload: { tradeId: "missing" } }, context(ids[2], undefined))],
      [state, transitionGameplayTrade(state, { ...createCommand(), payload: { ...createCommand().payload, terms: { ...createCommand().payload.terms, price: 1n } } } as unknown as GameplayTradeCommand, context())],
      [bankruptcy, transitionGameplayTrade(bankruptcy, createCommand(), context())],
      [bankruptcy, transitionGameplayTrade(
        bankruptcy,
        { type: "cleanupExpiredTrades", expectedStateVersion: 3, payload: {} },
        { actor: { kind: "internal" }, nowMs: 3_000, randomSource },
      )],
    ];
    for (const [input, result] of cases) {
      assert.equal(result.ok, false);
      assert.strictEqual(result.state, input);
    }
  });
});
