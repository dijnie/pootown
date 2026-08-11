import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchCash, MAX_MATCH_CASH, resolveCard, type CardPlayerState, type MatchCash } from "../src";

function player(fields: Partial<CardPlayerState> = {}): CardPlayerState {
  return { cash: matchCash(1_500n), position: 7, getOutOfJailCards: 0, ...fields };
}

describe("card rules", () => {
  it("executes all five Chance cards and no excluded effect", () => {
    const nearest = resolveCard("chance", 1, player({ position: 22 }), 4);
    assert.equal(nearest.ok, true);
    if (nearest.ok) {
      assert.equal(nearest.state.position, 1);
      assert.equal(nearest.state.cash, 1_700n);
      assert.equal(nearest.movement?.passedGo, true);
    }
    assert.equal(resolveCard("chance", 2, player(), 4).ok, true);
    assert.equal(resolveCard("chance", 3, player(), 4).ok, true);
    const backward = resolveCard("chance", 4, player({ position: 1 }), 4);
    assert.equal(backward.ok, true);
    if (backward.ok) {
      assert.equal(backward.state.position, 38);
      assert.equal(backward.state.cash, 1_500n);
      assert.equal(backward.movement?.passedGo, false);
    }
    const jailCard = resolveCard("chance", 5, player(), 4);
    assert.equal(jailCard.ok, true);
    if (jailCard.ok) assert.equal(jailCard.state.getOutOfJailCards, 1);
  });

  it("executes the five Community cards including approved position 20 and credit-only collection", () => {
    const collection = resolveCard("communityChest", 1, player(), 4);
    assert.equal(collection.ok, true);
    if (collection.ok) {
      assert.equal(collection.cashDelta, 150n);
      assert.equal(collection.state.cash, 1_650n);
    }
    const reward = resolveCard("communityChest", 2, player(), 4);
    assert.equal(reward.ok, true);
    if (reward.ok) assert.equal(reward.state.cash, 1_600n);
    const parking = resolveCard("communityChest", 3, player({ position: 33 }), 4);
    assert.equal(parking.ok, true);
    if (parking.ok) {
      assert.equal(parking.state.position, 20);
      assert.equal(parking.state.cash, 1_700n);
      assert.equal(parking.movement?.spaces, 27);
      assert.equal(parking.movement?.passedGo, true);
    }
    const repairs = resolveCard("communityChest", 4, player(), 4);
    assert.equal(repairs.ok, true);
    if (repairs.ok) assert.deepEqual(repairs.state, player());
    const fee = resolveCard("communityChest", 5, player(), 4);
    assert.equal(fee.ok, true);
    if (fee.ok) assert.equal(fee.state.cash, 1_450n);
  });

  it("marks an unaffordable debit for bankruptcy and zeroes remaining cash like the source", () => {
    const result = resolveCard("chance", 2, player({ cash: matchCash(49n) }), 2);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.cash, 0n);
    assert.equal(result.cashDelta, -49n);
    assert.equal(result.bankruptcyRequired, true);
  });

  it("fails closed on invalid cards, state, counts, and overflow", () => {
    assert.deepEqual(resolveCard("chance", 6, player(), 4), { ok: false, code: "INVALID_CARD" });
    assert.deepEqual(
      resolveCard("invented" as "chance", 1, player(), 4),
      { ok: false, code: "INVALID_CARD" },
    );
    assert.deepEqual(resolveCard("chance", 1, player(), 5), { ok: false, code: "INVALID_PLAYER_COUNT" });
    assert.deepEqual(
      resolveCard("chance", 1, player({ cash: -1n as MatchCash }), 4),
      { ok: false, code: "INVALID_CARD_STATE" },
    );
    assert.deepEqual(
      resolveCard("chance", 1, null as unknown as CardPlayerState, 4),
      { ok: false, code: "INVALID_CARD_STATE" },
    );
    assert.deepEqual(
      resolveCard("chance", 3, player({ cash: matchCash(MAX_MATCH_CASH) }), 4),
      { ok: false, code: "ARITHMETIC_OVERFLOW" },
    );
    assert.deepEqual(
      resolveCard("chance", 5, player({ getOutOfJailCards: 255 }), 4),
      { ok: false, code: "ARITHMETIC_OVERFLOW" },
    );
  });
});
