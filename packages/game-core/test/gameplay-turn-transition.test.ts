import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gameId,
  initializeGameplayAggregate,
  isValidActiveGameplayAggregateState,
  matchCash,
  playerId,
  transitionGameplayTurn,
  type ActiveGameplayAggregateState,
  type GameplayTurnCommand,
  type InProgressGameState,
  type RandomCheckpoint,
  type RandomSource,
} from "../src";

class DiceSource implements RandomSource {
  private cursor: number;

  constructor(
    private readonly values: readonly number[],
    private readonly resumable = true,
    cursor = 0,
  ) {
    this.cursor = cursor;
  }

  nextBytes(length: number): Uint8Array {
    assert.equal(length, 1);
    const value = this.values[this.cursor++];
    return value === undefined ? new Uint8Array() : Uint8Array.of(value);
  }

  checkpoint(): RandomCheckpoint {
    return { algorithm: "dice-test", state: String(this.cursor), draws: this.cursor, bytesConsumed: this.cursor };
  }

  canResume(value: RandomCheckpoint): boolean {
    return this.resumable && value.algorithm === "dice-test" && value.state === String(this.cursor);
  }

  fork(value: RandomCheckpoint): RandomSource | null {
    const cursor = Number(value.state);
    if (
      !this.resumable ||
      value.algorithm !== "dice-test" ||
      !Number.isSafeInteger(cursor) ||
      cursor < 0 ||
      cursor > this.values.length
    ) return null;
    return new DiceSource(this.values, this.resumable, cursor);
  }
}

const firstPlayer = playerId("player_0");
const secondPlayer = playerId("player_1");

function aggregate(): ActiveGameplayAggregateState {
  const lifecycle: InProgressGameState = {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId("turn_test"),
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
    rng: { algorithm: "dice-test", state: "0", draws: 0, bytesConsumed: 0 },
  };
  const state = initializeGameplayAggregate(lifecycle);
  assert.notEqual(state, null);
  return state!;
}

function command(type: GameplayTurnCommand["type"], version = 3): GameplayTurnCommand {
  return { type, expectedStateVersion: version, payload: {} } as GameplayTurnCommand;
}

describe("gameplay turn transition", () => {
  it("derives dice, movement, and the landing phase from server-owned randomness", () => {
    const state = aggregate();
    const result = transitionGameplayTurn(state, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer },
      nowMs: 3_000,
      randomSource: new DiceSource([0, 1]),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.stateVersion, 4);
    assert.equal(result.state.players[0]?.position, 3);
    assert.deepEqual(result.state.lastDice, { dice: [1, 2], total: 3, isDoubles: false });
    assert.deepEqual(result.state.turn, {
      phase: "awaitingPropertyDecision",
      propertyPosition: 3,
      currentSeatIndex: 0,
      startedAtMs: 3_000,
      deadlineAtMs: 93_000,
      emittedWarnings: [],
    });
    assert.deepEqual(result.events.map((event) => event.type), ["diceRolled", "playerMoved"]);
    assert.equal(Object.isFrozen(result.state), true);
    assert.equal(Object.isFrozen(result.state.lastDice?.dice), true);
    assert.equal(Object.isFrozen(result.events), true);
    assert.equal(Object.isFrozen(result.events[0]), true);
  });

  it("preserves cumulative timeout penalties when the player later acts", () => {
    const initial = aggregate();
    const state = {
      ...initial,
      players: initial.players.map((player, index) => index === 0 && player !== null
        ? { ...player, missedTurns: 2 }
        : player),
    } as ActiveGameplayAggregateState;
    const result = transitionGameplayTurn(state, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer },
      nowMs: 3_500,
      randomSource: new DiceSource([0, 1]),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.state.players[0]?.missedTurns, 2);
  });

  it("preserves the frozen credit-only GO salary and a pending property decision", () => {
    const initial = aggregate();
    const state = {
      ...initial,
      players: initial.players.map((player, index) => index === 0 && player !== null
        ? { ...player, position: 37 }
        : player),
    } as ActiveGameplayAggregateState;
    const result = transitionGameplayTurn(state, command("resolveRandomDice"), {
      actor: { kind: "internal" },
      nowMs: 4_000,
      randomSource: new DiceSource([2, 2]),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.players[0]?.position, 3);
    assert.equal(result.state.players[0]?.cash, 1_700n);
    assert.equal(result.state.bankCash, 1_000_000n);
    assert.equal(result.events[1]?.type, "playerMoved");
    if (result.events[1]?.type === "playerMoved") assert.equal(result.events[1].salaryCollected, 200n);
  });

  it("sends the third consecutive double to jail and advances atomically", () => {
    const initial = aggregate();
    const state = {
      ...initial,
      players: initial.players.map((player, index) => index === 0 && player !== null
        ? { ...player, consecutiveDoubles: 2 }
        : player),
    } as ActiveGameplayAggregateState;
    const result = transitionGameplayTurn(state, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer },
      nowMs: 5_000,
      randomSource: new DiceSource([3, 3]),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.players[0]?.position, 10);
    assert.equal(result.state.players[0]?.inJail, true);
    assert.equal(result.state.turn.currentSeatIndex, 1);
    assert.equal(result.state.turn.phase, "awaitingRoll");
    assert.deepEqual(result.events.map((event) => event.type), ["diceRolled", "jailEntered"]);
  });

  it("resolves the go-to-jail corner immediately instead of exposing a fake action", () => {
    const initial = aggregate();
    const state = {
      ...initial,
      players: initial.players.map((player, index) => index === 0 && player !== null
        ? { ...player, position: 24 }
        : player),
    } as ActiveGameplayAggregateState;
    const result = transitionGameplayTurn(state, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer },
      nowMs: 5_500,
      randomSource: new DiceSource([2, 2]),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.players[0]?.position, 10);
    assert.equal(result.state.players[0]?.inJail, true);
    assert.equal(result.state.turn.currentSeatIndex, 1);
    assert.deepEqual(result.events.map((event) => event.type), ["diceRolled", "playerMoved", "jailEntered"]);
  });

  it("advances after a failed jail roll and resolves doubles release through landing", () => {
    const initial = aggregate();
    const jailed = {
      ...initial,
      players: initial.players.map((player, index) => index === 0 && player !== null
        ? { ...player, position: 10, inJail: true }
        : player),
    } as ActiveGameplayAggregateState;
    const remains = transitionGameplayTurn(jailed, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer }, nowMs: 6_000, randomSource: new DiceSource([0, 1]),
    });
    assert.equal(remains.ok, true);
    if (!remains.ok) return;
    assert.equal(remains.state.players[0]?.inJail, true);
    assert.equal(remains.state.players[0]?.jailTurns, 1);
    assert.equal(remains.state.turn.currentSeatIndex, 1);
    assert.deepEqual(remains.events.map((event) => event.type), ["diceRolled"]);

    const released = transitionGameplayTurn(jailed, command("resolveRandomDice"), {
      actor: { kind: "internal" }, nowMs: 6_000, randomSource: new DiceSource([2, 2]),
    });
    assert.equal(released.ok, true);
    if (!released.ok) return;
    assert.equal(released.state.players[0]?.inJail, false);
    assert.equal(released.state.players[0]?.position, 16);
    assert.equal(released.state.turn.phase, "awaitingPropertyDecision");
    assert.deepEqual(released.events.map((event) => event.type), ["diceRolled", "jailExited", "playerMoved"]);
    assert.equal(isValidActiveGameplayAggregateState(released.state), true);
  });

  it("records mandatory bankruptcy after an unaffordable third jail roll", () => {
    const initial = aggregate();
    const jailed = {
      ...initial,
      players: initial.players.map((player, index) => index === 0 && player !== null
        ? { ...player, cash: matchCash(49n), position: 10, inJail: true, jailTurns: 2 }
        : player),
    } as ActiveGameplayAggregateState;
    const result = transitionGameplayTurn(jailed, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer }, nowMs: 6_500, randomSource: new DiceSource([0, 1]),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.players[0]?.cash, 0n);
    assert.equal(result.state.players[0]?.inJail, false);
    assert.equal(result.state.bankruptcyRequiredSeatIndex, 0);
    assert.equal(result.state.turn.phase, "awaitingBankruptcy");
    assert.equal(isValidActiveGameplayAggregateState(result.state), true);
  });

  it("ends only a completed non-double turn and moves to the next stable active seat", () => {
    const initial = aggregate();
    const rolled = transitionGameplayTurn(initial, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer },
      nowMs: 6_000,
      randomSource: new DiceSource([3, 5]),
    });
    assert.equal(rolled.ok, true);
    if (!rolled.ok) return;
    assert.equal(rolled.state.turn.phase, "awaitingEndTurn");
    const ended = transitionGameplayTurn(rolled.state, command("endTurn", 4), {
      actor: { kind: "player", playerId: firstPlayer },
      nowMs: 7_000,
      randomSource: new DiceSource([]),
    });
    assert.equal(ended.ok, true);
    if (!ended.ok) return;
    assert.equal(ended.state.stateVersion, 5);
    assert.equal(ended.state.turn.currentSeatIndex, 1);
    assert.equal(ended.state.lastDice, null);
    assert.deepEqual(ended.events, []);
  });

  it("rejects stale, wrong-actor, wrong-phase, malformed-state, and RNG mismatch without mutation", () => {
    const state = aggregate();
    const malformed = { ...state, housesRemaining: 31 } as ActiveGameplayAggregateState;
    const cases: readonly [ActiveGameplayAggregateState, ReturnType<typeof transitionGameplayTurn>][] = [
      [state, transitionGameplayTurn(state, command("rollDice", 2), {
        actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: new DiceSource([0, 1]),
      })],
      [state, transitionGameplayTurn(state, command("rollDice"), {
        actor: { kind: "player", playerId: secondPlayer }, nowMs: 3_000, randomSource: new DiceSource([0, 1]),
      })],
      [state, transitionGameplayTurn(state, command("endTurn"), {
        actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: new DiceSource([]),
      })],
      [malformed, transitionGameplayTurn(malformed, command("rollDice"), {
        actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: new DiceSource([0, 1]),
      })],
      [state, transitionGameplayTurn(state, command("rollDice"), {
        actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: new DiceSource([0, 1], false),
      })],
      [state, transitionGameplayTurn(state, command("rollDice"), {
        actor: { kind: "player", playerId: firstPlayer }, nowMs: 1_999, randomSource: new DiceSource([0, 1]),
      })],
    ];
    for (const [input, result] of cases) {
      assert.equal(result.ok, false);
      assert.strictEqual(result.state, input);
    }
  });

  it("cannot end a turn before rolling or while bankruptcy is required", () => {
    const initial = aggregate();
    const beforeRoll = {
      ...initial,
      turn: { phase: "awaitingEndTurn", currentSeatIndex: 0, startedAtMs: 2_000, deadlineAtMs: 92_000, emittedWarnings: [] },
    } as ActiveGameplayAggregateState;
    assert.equal(isValidActiveGameplayAggregateState(beforeRoll), false);
    const invalid = transitionGameplayTurn(beforeRoll, command("endTurn"), {
      actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: new DiceSource([]),
    });
    assert.equal(invalid.ok, false);
    assert.strictEqual(invalid.state, beforeRoll);

    const required = {
      ...initial,
      turn: { phase: "awaitingBankruptcy", currentSeatIndex: 0, startedAtMs: 2_500, deadlineAtMs: 92_500, emittedWarnings: [] },
      lastDice: { dice: [1, 2] as const, total: 3, isDoubles: false },
      bankruptcyRequiredSeatIndex: 0,
    } as ActiveGameplayAggregateState;
    assert.equal(isValidActiveGameplayAggregateState(required), true);
    const blocked = transitionGameplayTurn(required, command("endTurn"), {
      actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: new DiceSource([]),
    });
    assert.equal(blocked.ok, false);
    assert.strictEqual(blocked.state, required);
    if (!blocked.ok) assert.equal(blocked.error.code, "INVALID_PHASE");
  });

  it("rejects unknown command shapes and isolates failed random attempts from the supplied source", () => {
    const state = aggregate();
    const source = new DiceSource([0]);
    const unknown = transitionGameplayTurn(
      state,
      { type: "unknown", expectedStateVersion: 3, payload: {} } as unknown as GameplayTurnCommand,
      { actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: source },
    );
    assert.equal(unknown.ok, false);
    assert.strictEqual(unknown.state, state);
    assert.deepEqual(source.checkpoint(), { algorithm: "dice-test", state: "0", draws: 0, bytesConsumed: 0 });

    const failedRoll = transitionGameplayTurn(state, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: source,
    });
    assert.equal(failedRoll.ok, false);
    assert.strictEqual(failedRoll.state, state);
    assert.deepEqual(source.checkpoint(), { algorithm: "dice-test", state: "0", draws: 0, bytesConsumed: 0 });

    const prototypePayload = transitionGameplayTurn(
      state,
      { type: "rollDice", expectedStateVersion: 3, payload: new Date() } as unknown as GameplayTurnCommand,
      { actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: source },
    );
    assert.equal(prototypePayload.ok, false);
    assert.strictEqual(prototypePayload.state, state);
  });

  it("rejects a fork that does not persist monotonic RNG progress", () => {
    const state = aggregate();
    const unchangedCheckpointSource: RandomSource = {
      nextBytes: () => new Uint8Array(),
      checkpoint: () => state.rng,
      canResume: () => true,
      fork: () => {
        let draw = 0;
        return {
          nextBytes: () => Uint8Array.of(draw++),
          checkpoint: () => state.rng,
          canResume: () => true,
        };
      },
    };
    const unchanged = transitionGameplayTurn(state, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: unchangedCheckpointSource,
    });
    assert.equal(unchanged.ok, false);
    assert.strictEqual(unchanged.state, state);

    const changedAlgorithmSource: RandomSource = {
      ...unchangedCheckpointSource,
      fork: () => {
        let draw = 0;
        const next = { algorithm: "different", state: "2", draws: 2, bytesConsumed: 2 };
        return {
          nextBytes: () => Uint8Array.of(draw++),
          checkpoint: () => next,
          canResume: () => true,
        };
      },
    };
    const changedAlgorithm = transitionGameplayTurn(state, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: changedAlgorithmSource,
    });
    assert.equal(changedAlgorithm.ok, false);
    assert.strictEqual(changedAlgorithm.state, state);
  });

  it("does not retain mutable trade aliases after a successful transition", () => {
    const initial = aggregate();
    const trade = {
      tradeId: "trade_1",
      proposerSeatIndex: 0,
      receiverSeatIndex: 1,
      terms: { tradeType: "moneyOnly" as const, offeredCash: matchCash(1n), requestedCash: matchCash(0n) },
      createdAtMs: 2_000,
      expiresAtMs: 3_602_000,
    };
    const state = { ...initial, activeTrades: [trade] } as ActiveGameplayAggregateState;
    const result = transitionGameplayTurn(state, command("rollDice"), {
      actor: { kind: "player", playerId: firstPlayer }, nowMs: 3_000, randomSource: new DiceSource([0, 1]),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.notStrictEqual(result.state.activeTrades[0], trade);
    assert.notStrictEqual(result.state.activeTrades[0]?.terms, trade.terms);
    assert.equal(Object.isFrozen(result.state.activeTrades[0]), true);
    assert.equal(Object.isFrozen(result.state.activeTrades[0]?.terms), true);
  });
});
