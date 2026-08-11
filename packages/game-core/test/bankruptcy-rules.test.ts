import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_MATCH_CASH,
  createPropertyStates,
  matchCash,
  resolveBankruptcy,
  type BankruptcyPlayerState,
  type PropertyState,
} from "../src";

function players(): readonly (BankruptcyPlayerState | null)[] {
  return [
    {
      seatIndex: 0,
      status: "active",
      cash: matchCash(100n),
      position: 7,
      inJail: false,
      jailTurns: 0,
      consecutiveDoubles: 1,
      missedTurns: 0,
      getOutOfJailCards: 2,
    },
    {
      seatIndex: 1,
      status: "active",
      cash: matchCash(1_500n),
      position: 0,
      inJail: false,
      jailTurns: 0,
      consecutiveDoubles: 0,
      missedTurns: 0,
      getOutOfJailCards: 0,
    },
    null,
    null,
  ];
}

function developedProperties(): readonly PropertyState[] {
  return createPropertyStates().map((property) => {
    if (property.position === 1) return { ...property, ownerSeatIndex: 0, houses: 2 };
    if (property.position === 3) return { ...property, ownerSeatIndex: 0, mortgaged: true };
    if (property.position === 5) return { ...property, ownerSeatIndex: 0 };
    return property;
  });
}

describe("bankruptcy rules", () => {
  it("liquidates assets to the bank and eliminates the stable seat atomically", () => {
    const playerStates = players();
    const properties = developedProperties();
    const result = resolveBankruptcy(
      playerStates,
      properties,
      { housesRemaining: 30, hotelsRemaining: 12 },
      matchCash(1_000_000n),
      0,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.liquidationValue, 180n);
    assert.equal(result.cashTransferred, 100n);
    assert.equal(result.bankCash, 1_000_280n);
    assert.deepEqual(result.inventory, { housesRemaining: 32, hotelsRemaining: 12 });
    assert.deepEqual(result.players[0], {
      ...playerStates[0],
      status: "eliminated",
      cash: 0n,
      position: 0,
      inJail: false,
      jailTurns: 0,
      consecutiveDoubles: 0,
      getOutOfJailCards: 0,
    });
    assert.equal(result.properties[1]?.ownerSeatIndex, null);
    assert.equal(result.properties[1]?.houses, 0);
    assert.equal(result.properties[3]?.mortgaged, false);
    assert.equal(result.properties[5]?.ownerSeatIndex, null);
    assert.equal(result.endConditionMet, true);
    assert.equal(result.winnerSeatIndex, 1);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.players), true);
    assert.equal(Object.isFrozen(result.players[1]), true);
    assert.equal(Object.isFrozen(result.properties), true);
    assert.equal(Object.isFrozen(result.properties[0]), true);
    assert.equal(Object.isFrozen(result.inventory), true);
    assert.equal(Object.isFrozen(playerStates[1]), false);
    assert.equal(Object.isFrozen(properties[0]), false);
    assert.strictEqual(playerStates[0]?.status, "active");
    assert.strictEqual(properties[1]?.houses, 2);
  });

  it("returns a hotel and uses the frozen five-house half-cost liquidation value", () => {
    const properties = createPropertyStates().map((property) =>
      property.position === 39
        ? { ...property, ownerSeatIndex: 0, hasHotel: true }
        : property,
    );
    const result = resolveBankruptcy(
      players(),
      properties,
      { housesRemaining: 32, hotelsRemaining: 11 },
      matchCash(0n),
      0,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.liquidationValue, 700n);
    assert.equal(result.hotelsReturned, 1);
    assert.deepEqual(result.inventory, { housesRemaining: 32, hotelsRemaining: 12 });
  });

  it("keeps playing with multiple survivors and selects a gapped stable-seat winner", () => {
    const base = players();
    const seatTwo: BankruptcyPlayerState = {
      ...base[1]!,
      seatIndex: 2,
    };
    const threePlayers = [base[0]!, base[1]!, seatTwo, null] as const;
    const continues = resolveBankruptcy(
      threePlayers,
      createPropertyStates(),
      { housesRemaining: 32, hotelsRemaining: 12 },
      matchCash(0n),
      0,
    );
    assert.equal(continues.ok, true);
    if (continues.ok) {
      assert.equal(continues.endConditionMet, false);
      assert.equal(continues.winnerSeatIndex, null);
    }

    const eliminatedSeatOne: BankruptcyPlayerState = {
      ...base[1]!,
      status: "eliminated",
      cash: matchCash(0n),
      position: 0,
      consecutiveDoubles: 0,
      getOutOfJailCards: 0,
    };
    const gapped = resolveBankruptcy(
      [base[0]!, eliminatedSeatOne, seatTwo, null],
      createPropertyStates(),
      { housesRemaining: 32, hotelsRemaining: 12 },
      matchCash(0n),
      0,
    );
    assert.equal(gapped.ok, true);
    if (gapped.ok) assert.equal(gapped.winnerSeatIndex, 2);
  });

  it("rejects eliminated/missing seats, malformed state, and bank overflow without mutation", () => {
    const playerStates = players();
    const eliminated = playerStates.map((player, index) => index === 0 && player !== null
      ? { ...player, status: "eliminated" as const, cash: matchCash(0n), position: 0, consecutiveDoubles: 0, getOutOfJailCards: 0 }
      : player);
    assert.deepEqual(
      resolveBankruptcy(eliminated, createPropertyStates(), { housesRemaining: 32, hotelsRemaining: 12 }, matchCash(0n), 0),
      { ok: false, code: "PLAYER_NOT_ACTIVE" },
    );
    assert.deepEqual(
      resolveBankruptcy(playerStates, createPropertyStates(), { housesRemaining: 32, hotelsRemaining: 12 }, matchCash(0n), 3),
      { ok: false, code: "PLAYER_NOT_ACTIVE" },
    );
    assert.deepEqual(
      resolveBankruptcy(playerStates, createPropertyStates(), { housesRemaining: 32, hotelsRemaining: 12 }, matchCash(0n), 4),
      { ok: false, code: "INVALID_BANKRUPTCY_STATE" },
    );
    assert.deepEqual(
      resolveBankruptcy(playerStates, new Array<PropertyState>(40), { housesRemaining: 32, hotelsRemaining: 12 }, matchCash(0n), 0),
      { ok: false, code: "INVALID_BANKRUPTCY_STATE" },
    );
    assert.deepEqual(
      resolveBankruptcy(
        ["player" as unknown as BankruptcyPlayerState, playerStates[1]!, null, null],
        createPropertyStates(),
        { housesRemaining: 32, hotelsRemaining: 12 },
        matchCash(0n),
        0,
      ),
      { ok: false, code: "INVALID_BANKRUPTCY_STATE" },
    );
    assert.deepEqual(
      resolveBankruptcy(
        playerStates,
        createPropertyStates(),
        null as unknown as { housesRemaining: number; hotelsRemaining: number },
        matchCash(0n),
        0,
      ),
      { ok: false, code: "INVALID_BANKRUPTCY_STATE" },
    );
    assert.deepEqual(
      resolveBankruptcy(playerStates, createPropertyStates(), { housesRemaining: 32, hotelsRemaining: 12 }, matchCash(MAX_MATCH_CASH), 0),
      { ok: false, code: "ARITHMETIC_OVERFLOW" },
    );
    assert.equal(playerStates[0]?.cash, 100n);
  });
});
