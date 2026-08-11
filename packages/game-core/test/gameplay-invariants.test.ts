import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOARD_SPACES,
  COLOR_GROUP_POSITIONS,
  GAMEPLAY_POLICY,
  gameId,
  gameplayPlayerById,
  initializeGameplayAggregate,
  isValidActiveGameplayAggregateState,
  isValidFinishedGameplayAggregateState,
  matchCash,
  playerId,
  resolveCard,
  transitionGameplay,
  type ActiveGameplayAggregateState,
  type GameplayAggregateState,
  type GameplayCommand,
  type GameplayDomainEvent,
  type InProgressGameState,
  type RandomCheckpoint,
  type RandomSource,
} from "../src";

const ids = [playerId("invariant_player_0"), playerId("invariant_player_1"), playerId("invariant_player_2"), playerId("invariant_player_3")];

class SequenceRandomSource implements RandomSource {
  constructor(private readonly bytes: readonly number[], private cursor = 0) {}

  nextBytes(length: number): Uint8Array {
    const result = Uint8Array.from({ length }, (_, offset) => this.bytes[(this.cursor + offset) % this.bytes.length]!);
    this.cursor += length;
    return result;
  }

  checkpoint(): RandomCheckpoint {
    return { algorithm: "invariant-sequence-v1", state: String(this.cursor), draws: this.cursor, bytesConsumed: this.cursor };
  }

  canResume(checkpoint: RandomCheckpoint): boolean {
    return checkpoint.algorithm === "invariant-sequence-v1" && checkpoint.state === String(this.cursor);
  }

  fork(checkpoint: RandomCheckpoint): RandomSource | null {
    const cursor = Number(checkpoint.state);
    return checkpoint.algorithm === "invariant-sequence-v1" && Number.isSafeInteger(cursor) && cursor >= 0
      ? new SequenceRandomSource(this.bytes, cursor)
      : null;
  }
}

function generatedBytes(seed: number): readonly number[] {
  let value = seed >>> 0;
  return Array.from({ length: 1_024 }, () => {
    value = ((value * 1_664_525) + 1_013_904_223) >>> 0;
    return value % 216;
  });
}

function aggregate(): ActiveGameplayAggregateState {
  const lifecycle: InProgressGameState = {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId("gameplay_invariant_test"),
    creatorId: ids[0]!,
    lifecycle: "inProgress",
    minimumPlayers: 2,
    maximumPlayers: 4,
    seats: ids.map((id, seatIndex) => ({
      seatIndex,
      playerId: id,
      status: "active" as const,
      cash: matchCash(1_500n),
      position: 0,
      inJail: false,
      joinedAtMs: 1_000 + seatIndex,
    })),
    bankCash: matchCash(1_000_000n),
    freeParkingPool: matchCash(0n),
    housesRemaining: 32,
    hotelsRemaining: 12,
    createdAtMs: 1_000,
    startedAtMs: 2_000,
    cancelledAtMs: null,
    timeLimitMs: 86_400_000,
    gameEndAtMs: 86_402_000,
    turnTimeoutMs: 90_000,
    turn: { phase: "awaitingRoll", currentSeatIndex: 0, startedAtMs: 2_000, deadlineAtMs: 92_000 },
    rng: { algorithm: "invariant-sequence-v1", state: "0", draws: 0, bytesConsumed: 0 },
  };
  const state = initializeGameplayAggregate(lifecycle);
  assert.notEqual(state, null);
  return state!;
}

function totalCash(state: GameplayAggregateState): bigint {
  return state.players.reduce((total, player) => total + (player?.cash ?? 0n), state.bankCash + state.freeParkingPool);
}

function expectedCashDelta(before: ActiveGameplayAggregateState, events: readonly GameplayDomainEvent[]): bigint {
  const card = events.find((event): event is Extract<GameplayDomainEvent, { type: "cardDrawn" }> => event.type === "cardDrawn");
  let delta = 0n;
  if (card !== undefined) {
    const player = gameplayPlayerById(before, card.playerId);
    assert.notEqual(player, null);
    const resolution = resolveCard(card.deck, card.cardId, player!, before.players.filter((candidate) => candidate !== null).length);
    assert.equal(resolution.ok, true);
    if (resolution.ok) delta += resolution.cashDelta;
  } else {
    delta += events.reduce((salary, event) => event.type === "playerMoved" ? salary + event.salaryCollected : salary, 0n);
  }
  for (const event of events) {
    if (event.type === "propertyPurchased" || event.type === "buildingBuilt" || event.type === "taxPaid") delta -= event.type === "buildingBuilt" ? event.cost : event.type === "taxPaid" ? event.amount : event.price;
    if (event.type === "buildingSold") delta += event.salePrice;
    if (event.type === "jailExited" && event.method === "fine") delta -= GAMEPLAY_POLICY.jailFine;
    if (event.type === "playerBankrupt") delta += event.liquidationValue;
  }
  return delta;
}

function assertInvariants(state: GameplayAggregateState): void {
  assert.equal(
    state.lifecycle === "inProgress"
      ? isValidActiveGameplayAggregateState(state)
      : isValidFinishedGameplayAggregateState(state),
    true,
  );
  const housesOnBoard = state.properties.reduce((total, property) => total + property.houses, 0);
  const hotelsOnBoard = state.properties.filter((property) => property.hasHotel).length;
  assert.equal(state.housesRemaining + housesOnBoard, GAMEPLAY_POLICY.totalHouses);
  assert.equal(state.hotelsRemaining + hotelsOnBoard, GAMEPLAY_POLICY.totalHotels);
  for (const property of state.properties) {
    if (property.ownerSeatIndex === null) continue;
    const owner = state.players[property.ownerSeatIndex];
    assert.notEqual(owner, null);
    assert.equal(owner?.status, "active");
  }
  for (const player of state.players) {
    if (player === null) continue;
    assert.equal(player.cash >= 0n, true);
  }
}

function apply(
  state: ActiveGameplayAggregateState,
  command: GameplayCommand,
  nowMs: number,
  randomSource: RandomSource,
): GameplayAggregateState {
  const current = state.players[state.turn.currentSeatIndex];
  assert.notEqual(current, null);
  const internal = command.type === "resolveRandomCard";
  const result = transitionGameplay(state, command, {
    actor: internal ? { kind: "internal" } : { kind: "player", playerId: current!.playerId },
    nowMs,
    randomSource,
  });
  assert.equal(result.ok, true, result.ok ? undefined : `${command.type}: ${result.error.code}`);
  if (!result.ok) return state;
  assert.equal(totalCash(result.state) - totalCash(state), expectedCashDelta(state, result.events));
  assertInvariants(result.state);
  return result.state;
}

describe("generated gameplay invariants", () => {
  it("preserves cash, ownership, inventory, and validity across generated command sequences", () => {
    for (let seed = 1; seed <= 24; seed += 1) {
      let state: GameplayAggregateState = aggregate();
      const randomSource = new SequenceRandomSource(generatedBytes(seed));
      let nowMs = 3_000;
      let executed = 0;
      for (let step = 0; step < 160 && state.lifecycle === "inProgress"; step += 1) {
        const current = state.players[state.turn.currentSeatIndex];
        assert.notEqual(current, null);
        let command: GameplayCommand;
        if (state.turn.phase === "awaitingRoll") command = { type: "rollDice", expectedStateVersion: state.stateVersion, payload: {} };
        else if (state.turn.phase === "awaitingPropertyDecision") command = { type: "declineProperty", expectedStateVersion: state.stateVersion, payload: { position: state.turn.propertyPosition } };
        else if (state.turn.phase === "awaitingRentPayment") command = { type: "payRent", expectedStateVersion: state.stateVersion, payload: { position: state.turn.propertyPosition } };
        else if (state.turn.phase === "awaitingCardDraw") command = { type: "resolveRandomCard", expectedStateVersion: state.stateVersion, payload: { deck: state.turn.deck } };
        else if (state.turn.phase === "awaitingTaxPayment") command = { type: state.turn.taxKind === "mev" ? "payMevTax" : "payPriorityFeeTax", expectedStateVersion: state.stateVersion, payload: {} };
        else if (state.turn.phase === "awaitingBankruptcy") command = { type: "declareBankruptcy", expectedStateVersion: state.stateVersion, payload: {} };
        else command = { type: "endTurn", expectedStateVersion: state.stateVersion, payload: {} };
        state = apply(state, command, nowMs, randomSource);
        nowMs += 1;
        executed += 1;
      }
      assert.equal(executed, 160);
    }
  });

  it("conserves building stock and event-accounted cash through every street group", () => {
    const streetGroups = Object.entries(COLOR_GROUP_POSITIONS).filter(([group]) => group !== "railroad" && group !== "utility");
    assert.equal(streetGroups.length, 8);
    for (const [, positions] of streetGroups) {
      const base = aggregate();
      let state: GameplayAggregateState = {
        ...base,
        players: base.players.map((player, index) => index === 0 && player !== null ? { ...player, cash: matchCash(1_000_000n) } : player),
        properties: base.properties.map((property) => positions.includes(property.position) ? { ...property, ownerSeatIndex: 0 } : property),
      } as ActiveGameplayAggregateState;
      const source = new SequenceRandomSource([0]);
      let nowMs = 3_000;
      const execute = (command: GameplayCommand) => {
        assert.equal(state.lifecycle, "inProgress");
        if (state.lifecycle === "inProgress") state = apply(state, command, nowMs++, source);
      };
      for (let level = 0; level < 4; level += 1) {
        for (const position of positions) execute({ type: "buildHouse", expectedStateVersion: state.stateVersion, payload: { position } });
      }
      for (const position of positions) execute({ type: "buildHotel", expectedStateVersion: state.stateVersion, payload: { position } });
      for (const position of positions) execute({ type: "sellBuilding", expectedStateVersion: state.stateVersion, payload: { position, buildingType: "hotel" } });
      for (let level = 0; level < 4; level += 1) {
        for (const position of [...positions].reverse()) execute({ type: "sellBuilding", expectedStateVersion: state.stateVersion, payload: { position, buildingType: "house" } });
      }
      assert.equal(state.housesRemaining, 32);
      assert.equal(state.hotelsRemaining, 12);
      assert.equal(positions.every((position) => state.properties[position]?.houses === 0), true);
      assert.equal(positions.every((position) => BOARD_SPACES[position]?.propertyType === "street"), true);
    }
  });
});
