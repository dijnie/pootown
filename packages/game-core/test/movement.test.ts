import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyDoubles, moveBy, moveToNearest, rollDice, type RandomCheckpoint, type RandomSource } from "../src";

function randomSource(values: readonly number[]): RandomSource {
  let cursor = 0;
  return {
    nextBytes(length) {
      assert.equal(length, 1);
      const value = values[cursor];
      cursor += 1;
      return value === undefined ? new Uint8Array() : Uint8Array.of(value);
    },
    checkpoint(): RandomCheckpoint {
      return { algorithm: "movement-test", state: String(cursor), draws: cursor, bytesConsumed: cursor };
    },
    canResume: () => true,
  };
}

describe("movement rules", () => {
  it("draws two unbiased server-owned dice and rejects out-of-range bytes", () => {
    const result = rollDice(randomSource([252, 0, 251]));
    assert.deepEqual(result, { dice: [1, 6], total: 7, isDoubles: false });
  });

  it("fails closed when the random adapter throws or returns malformed bytes", () => {
    const throwing: RandomSource = {
      nextBytes: () => { throw new Error("adapter unavailable"); },
      checkpoint: () => ({ algorithm: "test", state: "0", draws: 0, bytesConsumed: 0 }),
      canResume: () => true,
    };
    assert.equal(rollDice(throwing), null);
    assert.equal(rollDice(randomSource([])), null);
    assert.equal(rollDice(randomSource(Array.from({ length: 256 }, () => 255))), null);
  });

  it("moves around the exact forty-space board and reports passing GO", () => {
    assert.deepEqual(moveBy(0, 7), { from: 0, to: 7, spaces: 7, passedGo: false });
    assert.deepEqual(moveBy(37, 6), { from: 37, to: 3, spaces: 6, passedGo: true });
    assert.equal(moveBy(40, 1), null);
    assert.deepEqual(moveBy(1, -3), { from: 1, to: 38, spaces: -3, passedGo: false });
    assert.deepEqual(moveBy(0, -3), { from: 0, to: 37, spaces: -3, passedGo: false });
  });

  it("preserves the executed nearest BONK-or-WIF movement and GO boundary", () => {
    assert.deepEqual(moveToNearest(0, [1, 3]), { from: 0, to: 1, spaces: 1, passedGo: false });
    assert.deepEqual(moveToNearest(2, [1, 3]), { from: 2, to: 3, spaces: 1, passedGo: false });
    assert.deepEqual(moveToNearest(3, [1, 3]), { from: 3, to: 1, spaces: 38, passedGo: true });
  });

  it("sends the player to jail on the third consecutive double", () => {
    const doubles = { dice: [4, 4], total: 8, isDoubles: true } as const;
    assert.deepEqual(applyDoubles(0, doubles), { consecutiveDoubles: 1, sentToJail: false });
    assert.deepEqual(applyDoubles(1, doubles), { consecutiveDoubles: 2, sentToJail: false });
    assert.deepEqual(applyDoubles(2, doubles), { consecutiveDoubles: 0, sentToJail: true });
    assert.deepEqual(
      applyDoubles(2, { dice: [1, 2], total: 3, isDoubles: false }),
      { consecutiveDoubles: 0, sentToJail: false },
    );
    assert.equal(applyDoubles(0, { dice: [6, 5], total: 12, isDoubles: false }), null);
    assert.equal(applyDoubles(0, { dice: [6, 6], total: 12, isDoubles: false }), null);
  });
});
