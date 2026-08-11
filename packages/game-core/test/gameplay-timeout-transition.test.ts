import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gameId,
  initializeGameplayAggregate,
  isValidActiveGameplayAggregateState,
  MAX_MATCH_CASH,
  matchCash,
  playerId,
  transitionGameplayTimeout,
  type ActiveGameplayAggregateState,
  type GameplayTimeoutCommand,
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

function aggregate(playerCount: 2 | 3 = 3, missedTurns = 0): ActiveGameplayAggregateState {
  const lifecycle: InProgressGameState = {
    schemaVersion: 2,
    rulesetId: "pootown-rust-source-v1",
    stateVersion: 3,
    gameId: gameId("timeout_transition_test"),
    creatorId: ids[0]!,
    lifecycle: "inProgress",
    minimumPlayers: 2,
    maximumPlayers: 4,
    seats: [
      { seatIndex: 0, playerId: ids[0]!, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_000 },
      { seatIndex: 1, playerId: ids[1]!, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_100 },
      playerCount === 3 ? { seatIndex: 2, playerId: ids[2]!, status: "active", cash: matchCash(1_500n), position: 0, inJail: false, joinedAtMs: 1_200 } : null,
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
    players: initialized!.players.map((player, index) => index === 0 && player !== null ? { ...player, missedTurns } : player),
  } as ActiveGameplayAggregateState;
}

function command(type: GameplayTimeoutCommand["type"], version = 3): GameplayTimeoutCommand {
  return { type, expectedStateVersion: version, payload: {} };
}

function context(nowMs: number, internal = true) {
  return { actor: internal ? { kind: "internal" as const } : { kind: "player" as const, playerId: ids[0]! }, nowMs, randomSource };
}

describe("gameplay timeout transition", () => {
  it("emits ordered warning checkpoints without changing the pending phase", () => {
    assert.equal(
      transitionGameplayTimeout(aggregate(), command("warnTurnThirtySeconds"), context(81_999)).ok,
      true,
    );
    assert.equal(
      transitionGameplayTimeout(aggregate(), command("warnTurnThirtySeconds"), context(82_000)).ok,
      false,
    );
    assert.equal(
      transitionGameplayTimeout(aggregate(), command("warnTurnTenSeconds"), context(82_000)).ok,
      true,
    );
    const warning30 = transitionGameplayTimeout(aggregate(), command("warnTurnThirtySeconds"), context(62_000));
    assert.equal(warning30.ok, true);
    if (!warning30.ok || warning30.state.lifecycle !== "inProgress") return;
    assert.deepEqual(warning30.state.turn.emittedWarnings, [30]);
    assert.equal(warning30.state.turn.phase, "awaitingRoll");
    assert.deepEqual(warning30.events, [{ type: "timeoutWarning", playerId: ids[0], remainingSeconds: 30 }]);

    const warning10 = transitionGameplayTimeout(warning30.state, command("warnTurnTenSeconds", 4), context(82_000));
    assert.equal(warning10.ok, true);
    if (warning10.ok && warning10.state.lifecycle === "inProgress") assert.deepEqual(warning10.state.turn.emittedWarnings, [30, 10]);
  });

  it("forces the first timeout to the next stable seat and clears pending turn data", () => {
    const result = transitionGameplayTimeout(aggregate(), command("handleTurnTimeout"), context(92_000));
    assert.equal(result.ok, true);
    if (!result.ok || result.state.lifecycle !== "inProgress") return;
    assert.equal(result.state.players[0]?.missedTurns, 1);
    assert.equal(result.state.turn.currentSeatIndex, 1);
    assert.equal(result.state.turn.phase, "awaitingRoll");
    assert.equal(result.state.lastDice, null);
    assert.deepEqual(result.events.map((event) => event.type), ["timeoutPenalty", "forcedTurnEnd"]);
    assert.equal(isValidActiveGameplayAggregateState(result.state), true);
  });

  it("forfeits on the third miss, removes participant trades, and continues with three players", () => {
    const participantTrade = {
      tradeId: "timeout_trade",
      proposerSeatIndex: 0,
      receiverSeatIndex: 1,
      terms: { tradeType: "moneyOnly" as const, offeredCash: matchCash(1n), requestedCash: matchCash(0n) },
      createdAtMs: 2_000,
      expiresAtMs: 3_602_000,
    };
    const state = { ...aggregate(3, 2), activeTrades: [participantTrade] } as ActiveGameplayAggregateState;
    const result = transitionGameplayTimeout(state, command("handleTurnTimeout"), context(92_000));
    assert.equal(result.ok, true);
    if (!result.ok || result.state.lifecycle !== "inProgress") return;
    assert.equal(result.state.players[0]?.status, "eliminated");
    assert.equal(result.state.turn.currentSeatIndex, 1);
    assert.equal(result.state.activeTrades.length, 0);
    assert.deepEqual(result.events.map((event) => event.type), ["timeoutPenalty", "timeoutForfeit", "playerBankrupt", "forcedTurnEnd"]);
    assert.equal(isValidActiveGameplayAggregateState(result.state), true);
  });

  it("finishes a two-player third timeout with derived winner and entitlement", () => {
    const result = transitionGameplayTimeout(aggregate(2, 2), command("handleTurnTimeout"), context(92_000));
    assert.equal(result.ok, true);
    if (!result.ok || result.state.lifecycle !== "finished") return;
    assert.equal(result.state.terminal.reason, "timeoutForfeit");
    assert.equal(result.state.terminal.winnerSeatIndex, 1);
    assert.deepEqual(result.events.map((event) => event.type), ["timeoutPenalty", "timeoutForfeit", "playerBankrupt", "gameEnded", "settlementEntitled"]);
    assert.equal(Object.isFrozen(result.state.terminal), true);
  });

  it("enforces the exact game deadline and breaks net-worth ties by stable seat", () => {
    const premature = transitionGameplayTimeout(aggregate(), command("enforceGameTimeLimit"), context(601_999));
    assert.equal(premature.ok, false);
    const result = transitionGameplayTimeout(aggregate(), command("enforceGameTimeLimit"), context(602_000));
    assert.equal(result.ok, true);
    if (!result.ok || result.state.lifecycle !== "finished") return;
    assert.equal(result.state.terminal.reason, "timeLimit");
    assert.equal(result.state.terminal.winnerSeatIndex, 0);
    assert.deepEqual(result.events.map((event) => event.type), ["gameEnded", "settlementEntitled"]);
  });

  it("gives the game deadline deterministic precedence over a simultaneous turn timeout", () => {
    const state = {
      ...aggregate(2, 2),
      gameEndAtMs: 92_000,
    } as ActiveGameplayAggregateState;
    const turnTimeout = transitionGameplayTimeout(state, command("handleTurnTimeout"), context(92_000));
    assert.equal(turnTimeout.ok, false);
    assert.strictEqual(turnTimeout.state, state);
    const gameTimeout = transitionGameplayTimeout(state, command("enforceGameTimeLimit"), context(92_000));
    assert.equal(gameTimeout.ok, true);
    if (gameTimeout.ok && gameTimeout.state.lifecycle === "finished") {
      assert.equal(gameTimeout.state.terminal.reason, "timeLimit");
      assert.equal(gameTimeout.state.terminal.winnerSeatIndex, 0);
    }
  });

  it("reports checked net-worth overflow without changing the aggregate", () => {
    const base = aggregate();
    const state = {
      ...base,
      players: base.players.map((player, index) => index === 0 && player !== null
        ? { ...player, cash: matchCash(MAX_MATCH_CASH) }
        : player),
      properties: base.properties.map((property) => property.position === 1
        ? { ...property, ownerSeatIndex: 0 }
        : property),
    } as ActiveGameplayAggregateState;
    assert.equal(isValidActiveGameplayAggregateState(state), true);
    const result = transitionGameplayTimeout(state, command("enforceGameTimeLimit"), context(602_000));
    assert.equal(result.ok, false);
    assert.strictEqual(result.state, state);
    if (!result.ok) assert.equal(result.error.code, "ARITHMETIC_OVERFLOW");
  });

  it("rejects stale, premature, player-owned, malformed, and bankruptcy-racing timers unchanged", () => {
    const state = aggregate();
    const bankruptcy = {
      ...state,
      turn: { phase: "awaitingBankruptcy", currentSeatIndex: 0, startedAtMs: 2_000, deadlineAtMs: 92_000, emittedWarnings: [] },
      bankruptcyRequiredSeatIndex: 0,
    } as ActiveGameplayAggregateState;
    const cases: readonly [ActiveGameplayAggregateState, ReturnType<typeof transitionGameplayTimeout>][] = [
      [state, transitionGameplayTimeout(state, command("handleTurnTimeout", 2), context(92_000))],
      [state, transitionGameplayTimeout(state, command("handleTurnTimeout"), context(91_999))],
      [state, transitionGameplayTimeout(state, command("warnTurnThirtySeconds"), context(61_999))],
      [state, transitionGameplayTimeout(state, command("handleTurnTimeout"), context(92_000, false))],
      [state, transitionGameplayTimeout(state, { type: "handleTurnTimeout", expectedStateVersion: 3, payload: { seatIndex: 1 } } as unknown as GameplayTimeoutCommand, context(92_000))],
      [bankruptcy, transitionGameplayTimeout(bankruptcy, command("handleTurnTimeout"), context(92_000))],
      [bankruptcy, transitionGameplayTimeout(bankruptcy, command("enforceGameTimeLimit"), context(602_000))],
    ];
    for (const [input, result] of cases) {
      assert.equal(result.ok, false);
      assert.strictEqual(result.state, input);
    }
  });
});
