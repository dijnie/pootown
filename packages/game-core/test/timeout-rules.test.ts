import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPropertyStates,
  deriveTimeoutForfeitTerminalOutcome,
  emitTimeoutWarning,
  matchCash,
  resolveTurnTimeout,
  type BankruptcyPlayerState,
  type TimeoutGameState,
  type TimeoutTurnState,
} from "../src";

function player(seatIndex: number, missedTurns = 0): BankruptcyPlayerState {
  return {
    seatIndex,
    status: "active",
    cash: matchCash(1_500n),
    position: 0,
    inJail: false,
    jailTurns: 0,
    consecutiveDoubles: 0,
    missedTurns,
    getOutOfJailCards: 0,
  };
}

function turn(currentSeatIndex = 0): TimeoutTurnState {
  return { currentSeatIndex, startedAtMs: 0, deadlineAtMs: 90_000, emittedWarnings: [] };
}

function state(
  players: readonly (BankruptcyPlayerState | null)[] = [player(0), player(1), null, null],
): TimeoutGameState {
  return {
    players,
    properties: createPropertyStates(),
    inventory: { housesRemaining: 32, hotelsRemaining: 12 },
    bankCash: matchCash(1_000_000n),
    turn: turn(),
  };
}

describe("timeout rules", () => {
  it("emits the exact 30/10 warnings once from the absolute deadline", () => {
    assert.deepEqual(emitTimeoutWarning(turn(), 30, 59_999), { ok: false, code: "WARNING_NOT_REACHED" });
    const thirty = emitTimeoutWarning(turn(), 30, 60_000);
    assert.equal(thirty.ok, true);
    if (!thirty.ok) return;
    assert.deepEqual(thirty.turn.emittedWarnings, [30]);
    assert.equal(emitTimeoutWarning(turn(), 30, 79_999).ok, true);
    assert.deepEqual(emitTimeoutWarning(turn(), 30, 80_000), { ok: false, code: "WARNING_NOT_REACHED" });
    assert.deepEqual(emitTimeoutWarning(thirty.turn, 30, 60_001), {
      ok: false,
      code: "WARNING_ALREADY_EMITTED",
    });
    const ten = emitTimeoutWarning(thirty.turn, 10, 80_000);
    assert.equal(ten.ok, true);
    if (ten.ok) assert.deepEqual(ten.turn.emittedWarnings, [30, 10]);
    const recoveredAtTen = emitTimeoutWarning(turn(), 10, 80_000);
    assert.equal(recoveredAtTen.ok, true);
    if (recoveredAtTen.ok) {
      assert.deepEqual(recoveredAtTen.turn.emittedWarnings, [10]);
      assert.deepEqual(emitTimeoutWarning(recoveredAtTen.turn, 30, 80_001), {
        ok: false,
        code: "WARNING_ALREADY_EMITTED",
      });
    }
    assert.deepEqual(emitTimeoutWarning(turn(), 10, 90_000), { ok: false, code: "WARNING_NOT_REACHED" });
  });

  it("increments the missed-turn count and advances to the next active stable seat", () => {
    const result = resolveTurnTimeout(state(), 90_000);
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "turnAdvanced") return;
    assert.equal(result.timedOutSeatIndex, 0);
    assert.equal(result.missedTurns, 1);
    assert.equal(result.players[0]?.missedTurns, 1);
    assert.deepEqual(result.turn, {
      currentSeatIndex: 1,
      startedAtMs: 90_000,
      deadlineAtMs: 180_000,
      emittedWarnings: [],
    });

    const gappedPlayers = [
      player(0),
      { ...player(1), status: "eliminated" as const, cash: matchCash(0n) },
      player(2),
      null,
    ];
    const gapped = resolveTurnTimeout(state(gappedPlayers), 90_000);
    assert.equal(gapped.ok, true);
    if (gapped.ok && gapped.kind === "turnAdvanced") assert.equal(gapped.turn.currentSeatIndex, 2);
  });

  it("forfeits through verified bankruptcy on the third missed turn and derives terminal once", () => {
    const result = resolveTurnTimeout(state([player(0, 2), player(1), null, null]), 90_000);
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "forfeit") return;
    assert.equal(result.missedTurns, 3);
    assert.equal(result.bankruptcy.players[0]?.status, "eliminated");
    assert.equal(result.bankruptcy.players[0]?.missedTurns, 3);
    assert.equal(result.turn, null);
    const terminal = deriveTimeoutForfeitTerminalOutcome(result, 90_000);
    assert.equal(terminal.ok, true);
    if (terminal.ok) {
      assert.equal(terminal.terminal.reason, "timeoutForfeit");
      assert.equal(terminal.terminal.winnerSeatIndex, 1);
    }
    assert.deepEqual(deriveTimeoutForfeitTerminalOutcome({ ...result }, 90_000), {
      ok: false,
      code: "INVALID_TERMINAL_STATE",
    });
  });

  it("continues after a nonterminal third-timeout forfeit", () => {
    const result = resolveTurnTimeout(state([player(0, 2), player(1), player(2), null]), 90_000);
    assert.equal(result.ok, true);
    if (!result.ok || result.kind !== "forfeit") return;
    assert.equal(result.bankruptcy.endConditionMet, false);
    assert.deepEqual(result.turn, {
      currentSeatIndex: 1,
      startedAtMs: 90_000,
      deadlineAtMs: 180_000,
      emittedWarnings: [],
    });
    assert.deepEqual(deriveTimeoutForfeitTerminalOutcome(result, 90_000), {
      ok: false,
      code: "END_CONDITION_NOT_MET",
    });
  });

  it("fails closed before the deadline and on malformed or duplicate timeout state", () => {
    const gameState = state();
    assert.deepEqual(resolveTurnTimeout(gameState, 89_999), { ok: false, code: "TIMEOUT_NOT_REACHED" });
    const advanced = resolveTurnTimeout(gameState, 90_000);
    assert.equal(advanced.ok, true);
    if (advanced.ok && advanced.kind === "turnAdvanced") {
      assert.notStrictEqual(advanced.properties, gameState.properties);
      assert.notStrictEqual(advanced.inventory, gameState.inventory);
      assert.equal(Object.isFrozen(advanced.properties), true);
      assert.equal(Object.isFrozen(advanced.properties[0]), true);
      assert.equal(Object.isFrozen(advanced.inventory), true);
    }
    assert.deepEqual(
      resolveTurnTimeout({ ...gameState, turn: { ...gameState.turn, deadlineAtMs: 89_999 } }, 90_000),
      { ok: false, code: "INVALID_TIMEOUT_STATE" },
    );
    assert.deepEqual(
      resolveTurnTimeout(null as unknown as TimeoutGameState, 90_000),
      { ok: false, code: "INVALID_TIMEOUT_STATE" },
    );
    const nearMaximum = Number.MAX_SAFE_INTEGER;
    assert.deepEqual(
      resolveTurnTimeout(
        {
          ...state([player(0, 2), player(1), player(2), null]),
          turn: {
            currentSeatIndex: 0,
            startedAtMs: nearMaximum - 90_000,
            deadlineAtMs: nearMaximum,
            emittedWarnings: [],
          },
        },
        nearMaximum,
      ),
      { ok: false, code: "INVALID_TIMEOUT_STATE" },
    );
    assert.equal(gameState.players[0]?.missedTurns, 0);
  });
});
