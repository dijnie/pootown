import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gameId,
  initializeGameplayAggregate,
  isValidActiveGameplayAggregateState,
  matchCash,
  playerId,
  transitionGameplayProperty,
  type ActiveGameplayAggregateState,
  type GameplayPropertyCommand,
  type InProgressGameState,
  type PlayerId,
  type RandomCheckpoint,
  type RandomSource,
} from "../src";

const currentId = playerId("property_player_0");
const ownerId = playerId("property_player_1");

const unusedRandom: RandomSource = {
  nextBytes: () => new Uint8Array(),
  checkpoint: (): RandomCheckpoint => ({ algorithm: "property-test", state: "0", draws: 0, bytesConsumed: 0 }),
  canResume: () => true,
};

function initialAggregate(): ActiveGameplayAggregateState {
  const lifecycle: InProgressGameState = {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId("property_transition"),
    creatorId: currentId,
    lifecycle: "inProgress",
    minimumPlayers: 2,
    maximumPlayers: 4,
    seats: [
      { seatIndex: 0, playerId: currentId, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_000 },
      { seatIndex: 1, playerId: ownerId, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_100 },
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
    timeLimitMs: null,
    gameEndAtMs: null,
    turnTimeoutMs: 90_000,
    turn: { phase: "awaitingRoll", currentSeatIndex: 0, startedAtMs: 2_000, deadlineAtMs: 92_000 },
    rng: { algorithm: "property-test", state: "0", draws: 0, bytesConsumed: 0 },
  };
  const aggregate = initializeGameplayAggregate(lifecycle);
  assert.notEqual(aggregate, null);
  return aggregate!;
}

function context(actorId: PlayerId = currentId, nowMs = 3_000) {
  return { actor: { kind: "player" as const, playerId: actorId }, nowMs, randomSource: unusedRandom };
}

function positionCommand(
  type: "buyProperty" | "declineProperty" | "payRent" | "buildHouse" | "buildHotel",
  position: number,
  version = 3,
): GameplayPropertyCommand {
  return { type, expectedStateVersion: version, payload: { position } };
}

function landedState(
  phase: "awaitingPropertyDecision" | "awaitingRentPayment" | "awaitingTaxPayment",
  position: number,
  update: Partial<ActiveGameplayAggregateState> = {},
): ActiveGameplayAggregateState {
  const initial = initialAggregate();
  const payload = phase === "awaitingTaxPayment"
    ? { taxKind: position === 4 ? "mev" as const : "priorityFee" as const }
    : { propertyPosition: position };
  return {
    ...initial,
    ...update,
    players: update.players ?? initial.players.map((player, index) => index === 0 && player !== null
      ? { ...player, position }
      : player),
    lastDice: update.lastDice ?? { dice: [1, 2], total: 3, isDoubles: false },
    turn: {
      phase,
      ...payload,
      currentSeatIndex: 0,
      startedAtMs: 2_500,
      deadlineAtMs: 92_500,
      emittedWarnings: [],
    } as ActiveGameplayAggregateState["turn"],
  };
}

describe("gameplay property transition", () => {
  it("buys and declines only the exact pending property using the frozen price", () => {
    const state = landedState("awaitingPropertyDecision", 1);
    const bought = transitionGameplayProperty(state, positionCommand("buyProperty", 1), context());
    assert.equal(bought.ok, true);
    if (!bought.ok) return;
    assert.equal(bought.state.players[0]?.cash, 1_440n);
    assert.equal(bought.state.properties[1]?.ownerSeatIndex, 0);
    assert.equal(bought.state.stateVersion, 4);
    assert.equal(bought.state.turn.phase, "awaitingEndTurn");
    assert.deepEqual(bought.events, [{ type: "propertyPurchased", playerId: currentId, position: 1, price: 60n }]);
    assert.equal(isValidActiveGameplayAggregateState(bought.state), true);

    const declined = transitionGameplayProperty(state, positionCommand("declineProperty", 1), context());
    assert.equal(declined.ok, true);
    if (!declined.ok) return;
    assert.equal(declined.state.properties[1]?.ownerSeatIndex, null);
    assert.deepEqual(declined.events, [{ type: "propertyDeclined", playerId: currentId, position: 1, price: 60n }]);
  });

  it("derives and transfers rent, or records a durable bankruptcy requirement", () => {
    const base = landedState("awaitingRentPayment", 1);
    const properties = base.properties.map((property) => property.position === 1
      ? { ...property, ownerSeatIndex: 1 }
      : property);
    const state = { ...base, properties } as ActiveGameplayAggregateState;
    const paid = transitionGameplayProperty(state, positionCommand("payRent", 1), context());
    assert.equal(paid.ok, true);
    if (!paid.ok) return;
    assert.equal(paid.state.players[0]?.cash, 1_498n);
    assert.equal(paid.state.players[1]?.cash, 1_502n);
    assert.deepEqual(paid.events, [{ type: "rentPaid", payerId: currentId, ownerId, position: 1, amount: 2n }]);

    const poorPlayers = state.players.map((player, index) => index === 0 && player !== null
      ? { ...player, cash: matchCash(1n) }
      : player);
    const poor = { ...state, players: poorPlayers } as ActiveGameplayAggregateState;
    const bankruptcy = transitionGameplayProperty(poor, positionCommand("payRent", 1), context());
    assert.equal(bankruptcy.ok, true);
    if (!bankruptcy.ok) return;
    assert.equal(bankruptcy.state.players[0]?.cash, 1n);
    assert.equal(bankruptcy.state.players[1]?.cash, 1_500n);
    assert.equal(bankruptcy.state.bankruptcyRequiredSeatIndex, 0);
    assert.equal(bankruptcy.state.turn.phase, "awaitingBankruptcy");
    assert.deepEqual(bankruptcy.events, []);
    assert.equal(isValidActiveGameplayAggregateState(bankruptcy.state), true);
  });

  it("preserves the frozen asymmetric insufficient-tax behavior", () => {
    const mev = landedState("awaitingTaxPayment", 4);
    const paid = transitionGameplayProperty(mev, { type: "payMevTax", expectedStateVersion: 3, payload: {} }, context());
    assert.equal(paid.ok, true);
    if (!paid.ok) return;
    assert.equal(paid.state.players[0]?.cash, 1_300n);
    assert.deepEqual(paid.events, [{ type: "taxPaid", playerId: currentId, position: 4, taxKind: "mev", amount: 200n }]);

    const mevPoor = {
      ...mev,
      players: mev.players.map((player, index) => index === 0 && player !== null
        ? { ...player, cash: matchCash(199n) }
        : player),
    } as ActiveGameplayAggregateState;
    const mevBankruptcy = transitionGameplayProperty(
      mevPoor,
      { type: "payMevTax", expectedStateVersion: 3, payload: {} },
      context(),
    );
    assert.equal(mevBankruptcy.ok, true);
    if (mevBankruptcy.ok) assert.equal(mevBankruptcy.state.bankruptcyRequiredSeatIndex, 0);

    const priority = landedState("awaitingTaxPayment", 38);
    const poor = {
      ...priority,
      players: priority.players.map((player, index) => index === 0 && player !== null
        ? { ...player, cash: matchCash(74n) }
        : player),
    } as ActiveGameplayAggregateState;
    const rejected = transitionGameplayProperty(
      poor,
      { type: "payPriorityFeeTax", expectedStateVersion: 3, payload: {} },
      context(),
    );
    assert.equal(rejected.ok, false);
    assert.strictEqual(rejected.state, poor);
    if (!rejected.ok) assert.equal(rejected.error.code, "INSUFFICIENT_CASH");
  });

  it("integrates building inventory and cash mutations without client prices", () => {
    const initial = initialAggregate();
    const properties = initial.properties.map((property) => property.position === 1 || property.position === 3
      ? { ...property, ownerSeatIndex: 0 }
      : property);
    const state = {
      ...initial,
      properties,
      turn: { phase: "awaitingEndTurn", currentSeatIndex: 0, startedAtMs: 2_500, deadlineAtMs: 92_500, emittedWarnings: [] },
      lastDice: { dice: [1, 2] as const, total: 3, isDoubles: false },
    } as ActiveGameplayAggregateState;
    const built = transitionGameplayProperty(state, positionCommand("buildHouse", 1), context());
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.state.properties[1]?.houses, 1);
    assert.equal(built.state.housesRemaining, 31);
    assert.equal(built.state.players[0]?.cash, 1_450n);
    assert.deepEqual(built.events, [{
      type: "buildingBuilt", playerId: currentId, position: 1, buildingType: "house", houseCount: 1, cost: 50n,
    }]);
    assert.equal(isValidActiveGameplayAggregateState(built.state), true);

    const sold = transitionGameplayProperty(
      built.state,
      { type: "sellBuilding", expectedStateVersion: 4, payload: { position: 1, buildingType: "house" } },
      context(currentId, 4_000),
    );
    assert.equal(sold.ok, true);
    if (!sold.ok) return;
    assert.equal(sold.state.properties[1]?.houses, 0);
    assert.equal(sold.state.housesRemaining, 32);
    assert.equal(sold.state.players[0]?.cash, 1_475n);
    assert.deepEqual(sold.events, [{
      type: "buildingSold", playerId: currentId, position: 1, buildingType: "house", salePrice: 25n,
    }]);
  });

  it("rejects stale, wrong actor, wrong phase, forged payload, and insufficient purchase unchanged", () => {
    const state = landedState("awaitingPropertyDecision", 1);
    const poor = {
      ...state,
      players: state.players.map((player, index) => index === 0 && player !== null
        ? { ...player, cash: matchCash(59n) }
        : player),
    } as ActiveGameplayAggregateState;
    const cases: readonly [ActiveGameplayAggregateState, ReturnType<typeof transitionGameplayProperty>][] = [
      [state, transitionGameplayProperty(state, positionCommand("buyProperty", 1, 2), context())],
      [state, transitionGameplayProperty(state, positionCommand("buyProperty", 1), context(ownerId))],
      [state, transitionGameplayProperty(state, positionCommand("payRent", 1), context())],
      [state, transitionGameplayProperty(
        state,
        { type: "buyProperty", expectedStateVersion: 3, payload: { position: 1, price: 1n } } as unknown as GameplayPropertyCommand,
        context(),
      )],
      [poor, transitionGameplayProperty(poor, positionCommand("buyProperty", 1), context())],
    ];
    for (const [input, result] of cases) {
      assert.equal(result.ok, false);
      assert.strictEqual(result.state, input);
    }
  });
});
