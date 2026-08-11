import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_MATCH_CASH,
  calculatePlayerNetWorth,
  createPropertyStates,
  deriveBankruptcyTerminalOutcome,
  deriveTimeLimitTerminalOutcome,
  matchCash,
  resolveBankruptcy,
  type BankruptcyPlayerState,
  type PropertyState,
  type TerminalPlayerState,
} from "../src";

function players(): readonly (TerminalPlayerState | null)[] {
  return [
    { seatIndex: 0, status: "active", cash: matchCash(100n) },
    { seatIndex: 1, status: "active", cash: matchCash(200n) },
    null,
    null,
  ];
}

function timeLimitState(
  playerStates: readonly (TerminalPlayerState | null)[],
  properties: readonly PropertyState[],
  gameEndAtMs = 10_000,
) {
  return { players: playerStates, properties, gameEndAtMs };
}

describe("terminal rules", () => {
  it("derives the frozen net-worth formula and ranks without a trusted winner", () => {
    const properties = createPropertyStates().map((property) => {
      if (property.position === 1) return { ...property, ownerSeatIndex: 0, houses: 2 };
      if (property.position === 3) return { ...property, ownerSeatIndex: 1, mortgaged: true };
      return property;
    });
    assert.equal(calculatePlayerNetWorth(players()[0]!, properties), 230n);
    assert.equal(calculatePlayerNetWorth(players()[1]!, properties), 227n);
    const result = deriveTimeLimitTerminalOutcome(timeLimitState(players(), properties, 9_000), 10_000);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.terminal.winnerSeatIndex, 0);
    assert.deepEqual(result.terminal.ranking, [
      { rank: 1, seatIndex: 0, netWorth: 230n },
      { rank: 2, seatIndex: 1, netWorth: 227n },
    ]);
    assert.deepEqual(result.terminal.settlementEntitlement, { winnerSeatIndex: 0, status: "pending" });
    assert.equal("amount" in result.terminal.settlementEntitlement, false);
  });

  it("breaks exact net-worth ties by the earliest active stable seat", () => {
    const tied = players().map((player) => player === null ? null : { ...player, cash: matchCash(500n) });
    const result = deriveTimeLimitTerminalOutcome(timeLimitState(tied, createPropertyStates()), 10_000);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.terminal.winnerSeatIndex, 0);

    const gapped = [
      { seatIndex: 0, status: "eliminated" as const, cash: matchCash(0n) },
      null,
      { seatIndex: 2, status: "active" as const, cash: matchCash(500n) },
      { seatIndex: 3, status: "active" as const, cash: matchCash(500n) },
    ];
    const gappedResult = deriveTimeLimitTerminalOutcome(timeLimitState(gapped, createPropertyStates()), 10_000);
    assert.equal(gappedResult.ok, true);
    if (gappedResult.ok) assert.equal(gappedResult.terminal.winnerSeatIndex, 2);
  });

  it("derives a last-player ending only from a successful bankruptcy resolution", () => {
    assert.deepEqual(
      deriveBankruptcyTerminalOutcome({ ok: false, code: "PLAYER_NOT_ACTIVE" }, 10_000),
      { ok: false, code: "INVALID_TERMINAL_STATE" },
    );
    const bankruptcyPlayers: readonly (BankruptcyPlayerState | null)[] = [
      {
        seatIndex: 0, status: "active", cash: matchCash(100n), position: 0, inJail: false,
        jailTurns: 0, consecutiveDoubles: 0, missedTurns: 0, getOutOfJailCards: 0,
      },
      {
        seatIndex: 1, status: "active", cash: matchCash(200n), position: 0, inJail: false,
        jailTurns: 0, consecutiveDoubles: 0, missedTurns: 0, getOutOfJailCards: 0,
      },
      null,
      null,
    ];
    const resolution = resolveBankruptcy(
      bankruptcyPlayers,
      createPropertyStates(),
      { housesRemaining: 32, hotelsRemaining: 12 },
      matchCash(1_000_000n),
      0,
    );
    assert.equal(resolution.ok, true);
    if (!resolution.ok) return;
    assert.deepEqual(
      deriveBankruptcyTerminalOutcome({ ...resolution }, 10_000),
      { ok: false, code: "INVALID_TERMINAL_STATE" },
    );
    const result = deriveBankruptcyTerminalOutcome(resolution, 10_000);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.terminal.winnerSeatIndex, 1);
      assert.equal(result.terminal.reason, "lastPlayerStanding");
      assert.equal(result.terminal.ranking.length, 1);
    }
  });

  it("fails closed on malformed state, no active player, and net-worth overflow", () => {
    const malformedPlayers: readonly unknown[] = [
      { cash: 1n },
      { seatIndex: "0", status: "active", cash: 1n },
      { seatIndex: -1, status: "active", cash: 1n },
      { seatIndex: 0, status: "ghost", cash: 1n },
      { seatIndex: 0, status: "eliminated", cash: 5n },
    ];
    for (const player of malformedPlayers) {
      assert.equal(calculatePlayerNetWorth(player as TerminalPlayerState, createPropertyStates()), null);
    }
    assert.deepEqual(
      deriveTimeLimitTerminalOutcome(timeLimitState(players(), new Array<PropertyState>(40)), 10_000),
      { ok: false, code: "INVALID_TERMINAL_STATE" },
    );
    const noActive = players().map((player) => player === null
      ? null
      : { ...player, status: "eliminated" as const, cash: matchCash(0n) });
    assert.deepEqual(
      deriveTimeLimitTerminalOutcome(timeLimitState(noActive, createPropertyStates()), 10_000),
      { ok: false, code: "NO_ACTIVE_PLAYERS" },
    );
    const overflowPlayers = players().map((player, index) => index === 0 && player !== null
      ? { ...player, cash: matchCash(MAX_MATCH_CASH) }
      : player);
    const owned = createPropertyStates().map((property) => property.position === 1
      ? { ...property, ownerSeatIndex: 0 }
      : property);
    assert.deepEqual(
      deriveTimeLimitTerminalOutcome(timeLimitState(overflowPlayers, owned), 10_000),
      { ok: false, code: "ARITHMETIC_OVERFLOW" },
    );
    assert.deepEqual(
      deriveTimeLimitTerminalOutcome(timeLimitState(players(), createPropertyStates(), 10_001), 10_000),
      { ok: false, code: "END_CONDITION_NOT_MET" },
    );
    assert.deepEqual(
      deriveTimeLimitTerminalOutcome(
        { players: players(), properties: createPropertyStates(), gameEndAtMs: null },
        10_000,
      ),
      { ok: false, code: "INVALID_TERMINAL_STATE" },
    );
    assert.deepEqual(
      deriveTimeLimitTerminalOutcome(
        { ...timeLimitState(players(), createPropertyStates()), authorized: true } as unknown as Parameters<
          typeof deriveTimeLimitTerminalOutcome
        >[0],
        10_000,
      ),
      { ok: false, code: "INVALID_TERMINAL_STATE" },
    );
    assert.deepEqual(
      deriveTimeLimitTerminalOutcome(timeLimitState(players(), createPropertyStates()), -1),
      { ok: false, code: "INVALID_TERMINAL_STATE" },
    );
    assert.deepEqual(
      deriveBankruptcyTerminalOutcome(null as unknown as Parameters<typeof deriveBankruptcyTerminalOutcome>[0], 10_000),
      { ok: false, code: "INVALID_TERMINAL_STATE" },
    );
  });
});
