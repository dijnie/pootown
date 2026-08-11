import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  enterJail,
  matchCash,
  payJailFine,
  resolveJailRoll,
  useJailCard,
  type DiceRoll,
  type JailPlayerState,
  type MatchCash,
} from "../src";

function player(fields: Partial<JailPlayerState> = {}): JailPlayerState {
  return {
    cash: matchCash(1_500n),
    position: 0,
    inJail: false,
    jailTurns: 0,
    consecutiveDoubles: 0,
    getOutOfJailCards: 0,
    ...fields,
  };
}

describe("jail rules", () => {
  it("enters jail, resets doubles, and ends the turn", () => {
    const result = enterJail(player({ position: 30, consecutiveDoubles: 2 }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.position, 10);
    assert.equal(result.state.inJail, true);
    assert.equal(result.state.consecutiveDoubles, 0);
    assert.equal(result.turnEnded, true);
  });

  it("pays the exact fine or requests bankruptcy without a partial debit", () => {
    const released = payJailFine(player({ position: 10, inJail: true, cash: matchCash(50n) }));
    assert.equal(released.ok, true);
    if (released.ok) {
      assert.equal(released.state.cash, 0n);
      assert.equal(released.releaseMethod, "fine");
      assert.equal(released.turnEnded, true);
    }
    const insufficient = payJailFine(player({ position: 10, inJail: true, cash: matchCash(49n) }));
    assert.equal(insufficient.ok, true);
    if (insufficient.ok) {
      assert.equal(insufficient.outcome, "bankruptcyRequired");
      assert.equal(insufficient.state.cash, 49n);
      assert.equal(insufficient.turnEnded, false);
    }
  });

  it("uses one jail card and preserves the legacy end-turn behavior", () => {
    const result = useJailCard(player({ position: 10, inJail: true, getOutOfJailCards: 2 }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.getOutOfJailCards, 1);
    assert.equal(result.state.inJail, false);
    assert.equal(result.turnEnded, true);
    assert.deepEqual(useJailCard(player({ position: 10, inJail: true })), {
      ok: false,
      code: "NO_GET_OUT_OF_JAIL_CARD",
    });
  });

  it("keeps the player jailed for two failed rolls and releases on doubles", () => {
    const failed = resolveJailRoll(
      player({ position: 10, inJail: true, jailTurns: 1 }),
      { dice: [2, 3], total: 5, isDoubles: false },
    );
    assert.equal(failed.ok, true);
    if (failed.ok) {
      assert.equal(failed.outcome, "remains");
      assert.equal(failed.state.jailTurns, 2);
      assert.equal(failed.turnEnded, true);
    }
    const doubles = resolveJailRoll(
      player({ position: 10, inJail: true, jailTurns: 1 }),
      { dice: [4, 4], total: 8, isDoubles: true },
    );
    assert.equal(doubles.ok, true);
    if (doubles.ok) {
      assert.equal(doubles.state.position, 18);
      assert.equal(doubles.state.consecutiveDoubles, 0);
      assert.equal(doubles.releaseMethod, "doubles");
      assert.equal(doubles.turnEnded, false);
    }
  });

  it("forces the fine on the third roll and marks unaffordable release for bankruptcy", () => {
    const forcedFine = resolveJailRoll(
      player({ position: 10, inJail: true, jailTurns: 2, cash: matchCash(100n) }),
      { dice: [1, 2], total: 3, isDoubles: false },
    );
    assert.equal(forcedFine.ok, true);
    if (forcedFine.ok) {
      assert.equal(forcedFine.state.cash, 50n);
      assert.equal(forcedFine.state.position, 13);
      assert.equal(forcedFine.releaseMethod, "fine");
    }
    const bankrupt = resolveJailRoll(
      player({ position: 10, inJail: true, jailTurns: 2, cash: matchCash(49n) }),
      { dice: [1, 2], total: 3, isDoubles: false },
    );
    assert.equal(bankrupt.ok, true);
    if (bankrupt.ok) {
      assert.equal(bankrupt.outcome, "bankruptcyRequired");
      assert.equal(bankrupt.state.cash, 0n);
      assert.equal(bankrupt.turnEnded, true);
    }
  });

  it("rejects malformed jail state and forged dice", () => {
    assert.deepEqual(enterJail(player({ position: 40 })), { ok: false, code: "INVALID_JAIL_STATE" });
    assert.deepEqual(
      payJailFine(player({ position: 10, inJail: true, cash: -1n as MatchCash })),
      { ok: false, code: "INVALID_JAIL_STATE" },
    );
    assert.deepEqual(
      payJailFine(player({ position: 10, inJail: "true" as unknown as boolean })),
      { ok: false, code: "INVALID_JAIL_STATE" },
    );
    assert.deepEqual(
      enterJail(player({ position: 10, inJail: true, jailTurns: 3 })),
      { ok: false, code: "INVALID_JAIL_STATE" },
    );
    assert.deepEqual(
      enterJail(player({ position: 10, inJail: true, consecutiveDoubles: 1 })),
      { ok: false, code: "INVALID_JAIL_STATE" },
    );
    assert.deepEqual(payJailFine(player()), { ok: false, code: "PLAYER_NOT_IN_JAIL" });
    assert.deepEqual(
      resolveJailRoll(player({ position: 10, inJail: true }), { dice: [6, 6], total: 11, isDoubles: true }),
      { ok: false, code: "INVALID_DICE" },
    );
    assert.deepEqual(
      resolveJailRoll(
        player({ position: 10, inJail: true }),
        { dice: [2, 2, 6], total: 4, isDoubles: true } as unknown as DiceRoll,
      ),
      { ok: false, code: "INVALID_DICE" },
    );
  });
});
