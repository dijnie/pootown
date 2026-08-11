import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gameId,
  initializeGameplayAggregate,
  matchCash,
  parseGameplaySnapshot,
  playerId,
  replayGameplay,
  serializeGameplaySnapshot,
  SnapshotError,
  transitionGameplay,
  transitionGameplayTimeout,
  type ActiveGameplayAggregateState,
  type GameplayCommand,
  type GameplayReplayStep,
  type InProgressGameState,
  type RandomCheckpoint,
  type RandomSource,
} from "../src";

const ids = [playerId("snapshot_player_0"), playerId("snapshot_player_1"), playerId("snapshot_player_2")];

class UnusedRandomSource implements RandomSource {
  nextBytes(): Uint8Array {
    return new Uint8Array();
  }

  checkpoint(): RandomCheckpoint {
    return { algorithm: "snapshot-test-v1", state: "checkpoint-0", draws: 0, bytesConsumed: 0 };
  }

  canResume(checkpoint: RandomCheckpoint): boolean {
    return checkpoint.algorithm === "snapshot-test-v1" && checkpoint.state === "checkpoint-0";
  }
}

class ReplayDiceSource implements RandomSource {
  constructor(private readonly values: readonly number[], private cursor = 0) {}

  nextBytes(length: number): Uint8Array {
    assert.equal(length, 1);
    const value = this.values[this.cursor++];
    return value === undefined ? new Uint8Array() : Uint8Array.of(value);
  }

  checkpoint(): RandomCheckpoint {
    return { algorithm: "snapshot-test-v1", state: `checkpoint-${this.cursor}`, draws: this.cursor, bytesConsumed: this.cursor };
  }

  canResume(checkpoint: RandomCheckpoint): boolean {
    return checkpoint.algorithm === "snapshot-test-v1" && checkpoint.state === `checkpoint-${this.cursor}`;
  }

  fork(checkpoint: RandomCheckpoint): RandomSource | null {
    const match = /^checkpoint-([0-9]+)$/.exec(checkpoint.state);
    if (checkpoint.algorithm !== "snapshot-test-v1" || match === null) return null;
    const cursor = Number(match[1]);
    return Number.isSafeInteger(cursor) && cursor >= 0 && cursor <= this.values.length
      ? new ReplayDiceSource(this.values, cursor)
      : null;
  }
}

function aggregate(): ActiveGameplayAggregateState {
  const lifecycle: InProgressGameState = {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId("gameplay_snapshot_test"),
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
    rng: { algorithm: "snapshot-test-v1", state: "checkpoint-0", draws: 0, bytesConsumed: 0 },
  };
  const initialized = initializeGameplayAggregate(lifecycle);
  assert.notEqual(initialized, null);
  return initialized!;
}

function richActive(): ActiveGameplayAggregateState {
  const base = aggregate();
  return {
    ...base,
    turn: { ...base.turn, emittedWarnings: [30, 10] },
    players: base.players.map((player, index) => index === 0 && player !== null
      ? { ...player, getOutOfJailCards: 1 }
      : player),
    properties: base.properties.map((property) => property.position === 1
      ? { ...property, ownerSeatIndex: 0 }
      : property),
    activeTrades: [{
      tradeId: "snapshot_trade",
      proposerSeatIndex: 0,
      receiverSeatIndex: 1,
      terms: { tradeType: "moneyOnly", offeredCash: matchCash(25n), requestedCash: matchCash(10n) },
      createdAtMs: 2_000,
      expiresAtMs: 3_602_000,
    }],
    lastDice: { dice: [2, 2], total: 4, isDoubles: true },
  } as ActiveGameplayAggregateState;
}

function context(nowMs: number) {
  return { actor: { kind: "internal" as const }, nowMs, randomSource: new UnusedRandomSource() };
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalStringify(entry)}`)
    .join(",")}}`;
}

function checksum(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of canonicalStringify(value)) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function resign(snapshot: Record<string, unknown>): string {
  const signed = { schemaVersion: snapshot.schemaVersion, stateVersion: snapshot.stateVersion, state: snapshot.state };
  return JSON.stringify({ ...signed, checksum: checksum(signed) });
}

describe("gameplay snapshot and replay", () => {
  it("round-trips the full active and terminal aggregate without aliases", () => {
    const active = richActive();
    const restored = parseGameplaySnapshot(serializeGameplaySnapshot(active));
    assert.deepEqual(restored, active);
    assert.notStrictEqual(restored, active);
    assert.equal(Object.isFrozen(restored), true);
    assert.equal(Object.isFrozen(restored.players), true);
    assert.equal(Object.isFrozen(restored.players[0]), true);
    assert.equal(Object.isFrozen(restored.properties[0]), true);
    assert.equal(Object.isFrozen(restored.activeTrades[0]?.terms), true);
    assert.equal(Object.isFrozen(restored.rng), true);

    const terminal = transitionGameplayTimeout(
      aggregate(),
      { type: "enforceGameTimeLimit", expectedStateVersion: 3, payload: {} },
      context(602_000),
    );
    assert.equal(terminal.ok, true);
    if (!terminal.ok) return;
    const restoredTerminal = parseGameplaySnapshot(serializeGameplaySnapshot(terminal.state));
    assert.deepEqual(restoredTerminal, terminal.state);
    assert.equal(Object.isFrozen(restoredTerminal.terminal), true);
    assert.equal(Object.isFrozen(restoredTerminal.terminal?.ranking), true);
  });

  it("round-trips every active turn payload and the bankruptcy checkpoint", () => {
    const base = aggregate();
    const lastDice = { dice: [1, 2] as const, total: 3, isDoubles: false };
    const variants: ActiveGameplayAggregateState[] = [
      { ...base, players: base.players.map((player, index) => index === 0 && player !== null ? { ...player, position: 1 } : player), turn: { ...base.turn, phase: "awaitingPropertyDecision", propertyPosition: 1 }, lastDice },
      { ...base, players: base.players.map((player, index) => index === 0 && player !== null ? { ...player, position: 3 } : player), properties: base.properties.map((property) => property.position === 3 ? { ...property, ownerSeatIndex: 1 } : property), turn: { ...base.turn, phase: "awaitingRentPayment", propertyPosition: 3 }, lastDice },
      { ...base, players: base.players.map((player, index) => index === 0 && player !== null ? { ...player, position: 7 } : player), turn: { ...base.turn, phase: "awaitingCardDraw", deck: "chance" }, lastDice },
      { ...base, players: base.players.map((player, index) => index === 0 && player !== null ? { ...player, position: 4 } : player), turn: { ...base.turn, phase: "awaitingTaxPayment", taxKind: "mev" }, lastDice },
      { ...base, turn: { ...base.turn, phase: "awaitingEndTurn" }, lastDice },
      { ...base, turn: { ...base.turn, phase: "awaitingBankruptcy" }, bankruptcyRequiredSeatIndex: 0 },
    ];
    for (const state of variants) {
      assert.deepEqual(parseGameplaySnapshot(serializeGameplaySnapshot(state)), state);
    }
  });

  it("replays identical checkpoint commands and timer inputs deterministically", () => {
    const steps = (): GameplayReplayStep[] => [
      { command: { type: "warnTurnThirtySeconds", expectedStateVersion: 3, payload: {} }, context: context(62_000) },
      { command: { type: "warnTurnTenSeconds", expectedStateVersion: 4, payload: {} }, context: context(82_000) },
      { command: { type: "handleTurnTimeout", expectedStateVersion: 5, payload: {} }, context: context(92_000) },
    ];
    const initial = parseGameplaySnapshot(serializeGameplaySnapshot(aggregate()));
    const first = replayGameplay(initial, steps());
    const second = replayGameplay(parseGameplaySnapshot(serializeGameplaySnapshot(aggregate())), steps());
    assert.deepEqual(first, second);
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.state.stateVersion, 6);
      assert.deepEqual(first.events.map((event) => event.type), ["timeoutWarning", "timeoutWarning", "timeoutPenalty", "forcedTurnEnd"]);
    }
  });

  it("replays identical server-owned random bytes to the same advanced checkpoint", () => {
    const initial = parseGameplaySnapshot(serializeGameplaySnapshot(aggregate()));
    const run = () => replayGameplay(initial, [{
      command: { type: "rollDice", expectedStateVersion: 3, payload: {} },
      context: {
        actor: { kind: "player", playerId: ids[0]! },
        nowMs: 3_000,
        randomSource: new ReplayDiceSource([0, 1]),
      },
    }]);
    const first = run();
    const second = run();
    assert.deepEqual(first, second);
    assert.equal(first.ok, true);
    if (first.ok && first.state.lifecycle === "inProgress") {
      assert.deepEqual(first.state.lastDice, { dice: [1, 2], total: 3, isDoubles: false });
      assert.deepEqual(first.state.rng, { algorithm: "snapshot-test-v1", state: "checkpoint-2", draws: 2, bytesConsumed: 2 });
    }
  });

  it("returns the exact replay rejection boundary and rejects unsupported commands", () => {
    const state = aggregate();
    const failed = replayGameplay(state, [
      { command: { type: "warnTurnThirtySeconds", expectedStateVersion: 2, payload: {} }, context: context(62_000) },
    ]);
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.failedStep, 0);
      assert.equal(failed.error.code, "STALE_STATE_VERSION");
      assert.strictEqual(failed.state, state);
    }
    const unsupported = transitionGameplay(
      state,
      { type: "startAuction", expectedStateVersion: 3, payload: {} } as unknown as GameplayCommand,
      context(2_000),
    );
    assert.equal(unsupported.ok, false);
    if (!unsupported.ok) assert.equal(unsupported.error.code, "COMMAND_UNSUPPORTED");
    assert.strictEqual(unsupported.state, state);

    const malformedContexts = [
      { actor: { kind: "internal", extra: true }, nowMs: 62_000, randomSource: new UnusedRandomSource() },
      { actor: { kind: "internal" }, nowMs: 62_000, randomSource: {} },
      { actor: { kind: "player", playerId: "invalid player" }, nowMs: 62_000, randomSource: new UnusedRandomSource() },
    ];
    for (const malformedContext of malformedContexts) {
      const result = transitionGameplay(
        state,
        { type: "warnTurnThirtySeconds", expectedStateVersion: 3, payload: {} },
        malformedContext as never,
      );
      assert.equal(result.ok, false);
      assert.strictEqual(result.state, state);
      if (!result.ok) assert.equal(result.error.code, "INVALID_COMMAND");
    }

    const malformedInitial = { ...state, stateVersion: 0 } as ActiveGameplayAggregateState;
    const invalidReplay = replayGameplay(malformedInitial, []);
    assert.equal(invalidReplay.ok, false);
    if (!invalidReplay.ok) {
      assert.equal(invalidReplay.failedStep, 0);
      assert.equal(invalidReplay.error.code, "INVALID_STATE");
      assert.strictEqual(invalidReplay.state, malformedInitial);
    }
    const emptyReplay = replayGameplay(state, []);
    assert.equal(emptyReplay.ok, true);
    if (emptyReplay.ok) {
      assert.equal(Object.isFrozen(emptyReplay), true);
      assert.equal(Object.isFrozen(emptyReplay.events), true);
    }
  });

  it("fails closed on corruption, versions, unknown fields, money, and terminal drift", () => {
    const active = serializeGameplaySnapshot(richActive());
    assert.throws(() => parseGameplaySnapshot(active.replace("1000000", "1000001")), /checksum mismatch/);

    const future = JSON.parse(active) as Record<string, unknown>;
    future.schemaVersion = 2;
    assert.throws(() => parseGameplaySnapshot(JSON.stringify(future)), /unsupported gameplay snapshot schema version/);

    const mismatched = JSON.parse(active) as Record<string, unknown>;
    mismatched.stateVersion = 99;
    assert.throws(() => parseGameplaySnapshot(resign(mismatched)), /revision mismatch/);

    const invalidMoney = JSON.parse(active) as Record<string, unknown>;
    const invalidMoneyState = invalidMoney.state as Record<string, unknown>;
    ((invalidMoneyState.players as Record<string, unknown>[])[0]!).cash = "01";
    assert.throws(() => parseGameplaySnapshot(resign(invalidMoney)), /canonical unsigned decimal/);

    for (const path of ["state", "player", "property", "trade", "terms", "rng"] as const) {
      const extra = JSON.parse(active) as Record<string, unknown>;
      const state = extra.state as Record<string, unknown>;
      const target = path === "state" ? state
        : path === "player" ? (state.players as Record<string, unknown>[])[0]!
          : path === "property" ? (state.properties as Record<string, unknown>[])[0]!
            : path === "trade" ? (state.activeTrades as Record<string, unknown>[])[0]!
              : path === "terms" ? ((state.activeTrades as Record<string, unknown>[])[0]!.terms as Record<string, unknown>)
                : state.rng as Record<string, unknown>;
      target.wallet = "forbidden";
      assert.throws(() => parseGameplaySnapshot(resign(extra)), /unknown or missing fields/);
    }

    const terminalResult = transitionGameplayTimeout(
      aggregate(),
      { type: "enforceGameTimeLimit", expectedStateVersion: 3, payload: {} },
      context(602_000),
    );
    assert.equal(terminalResult.ok, true);
    if (!terminalResult.ok) return;
    const invalidTerminal = JSON.parse(serializeGameplaySnapshot(terminalResult.state)) as Record<string, unknown>;
    const terminal = (invalidTerminal.state as Record<string, unknown>).terminal as Record<string, unknown>;
    ((terminal.ranking as Record<string, unknown>[])[0]!).seatIndex = 2;
    assert.throws(() => parseGameplaySnapshot(resign(invalidTerminal)), /finished gameplay aggregate invariants/);

    assert.throws(
      () => serializeGameplaySnapshot({ ...aggregate(), stateVersion: 0 } as ActiveGameplayAggregateState),
      SnapshotError,
    );
  });
});
