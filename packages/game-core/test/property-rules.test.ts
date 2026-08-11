import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_MATCH_CASH,
  calculateRent,
  canBuildHouse,
  canSellHouse,
  checkedAddMatchCash,
  checkedSubtractMatchCash,
  createPropertyStates,
  matchCash,
  type PropertyState,
} from "../src";

function own(
  properties: readonly PropertyState[],
  positions: readonly number[],
  ownerSeatIndex = 0,
): readonly PropertyState[] {
  return properties.map((property) =>
    positions.includes(property.position) ? { ...property, ownerSeatIndex } : property,
  );
}

function change(
  properties: readonly PropertyState[],
  position: number,
  fields: Partial<PropertyState>,
): readonly PropertyState[] {
  return properties.map((property) => property.position === position ? { ...property, ...fields } : property);
}

describe("property rules", () => {
  it("derives street, monopoly, house, hotel, and mortgage rent from frozen data", () => {
    let properties = own(createPropertyStates(), [1]);
    assert.equal(calculateRent(properties, 1, 7), 2n);
    properties = own(properties, [3]);
    assert.equal(calculateRent(properties, 1, 7), 4n);
    properties = change(properties, 1, { houses: 2 });
    assert.equal(calculateRent(properties, 1, 7), 30n);
    properties = change(properties, 1, { houses: 0, hasHotel: true });
    assert.equal(calculateRent(properties, 1, 7), 250n);
    properties = change(properties, 1, { hasHotel: false, mortgaged: true });
    assert.equal(calculateRent(properties, 1, 7), 0n);
  });

  it("derives railroad and utility rent without client-provided prices", () => {
    let properties = own(createPropertyStates(), [5]);
    assert.equal(calculateRent(properties, 5, 7), 25n);
    properties = own(properties, [15]);
    assert.equal(calculateRent(properties, 5, 7), 50n);
    properties = own(properties, [25]);
    assert.equal(calculateRent(properties, 5, 7), 100n);
    properties = own(properties, [35]);
    assert.equal(calculateRent(properties, 5, 7), 200n);
    properties = own(properties, [12]);
    assert.equal(calculateRent(properties, 12, 7), 28n);
    properties = own(properties, [28]);
    assert.equal(calculateRent(properties, 12, 7), 70n);
    assert.equal(calculateRent(properties, 28, 12), 120n);
    assert.equal(calculateRent(properties, 28, 13), null);
  });

  it("enforces monopoly and even house construction and sale", () => {
    let properties = own(createPropertyStates(), [1, 3]);
    assert.equal(canBuildHouse(properties, 1, 0), true);
    properties = change(properties, 1, { houses: 1 });
    assert.equal(canBuildHouse(properties, 1, 0), false);
    assert.equal(canBuildHouse(properties, 3, 0), true);
    assert.equal(canSellHouse(properties, 1, 0), true);
    properties = change(properties, 3, { houses: 1 });
    assert.equal(canSellHouse(properties, 1, 0), true);
    assert.equal(canSellHouse(properties, 3, 1), false);

    const noMonopoly = change(own(createPropertyStates(), [1]), 1, { houses: 1 });
    assert.equal(canSellHouse(noMonopoly, 1, 0), false);
    assert.equal(canBuildHouse(noMonopoly, 1, 0), false);
    const undevelopedMonopoly = own(createPropertyStates(), [1, 3]);
    assert.equal(canBuildHouse(change(undevelopedMonopoly, 3, { mortgaged: true }), 3, 0), false);
    assert.equal(canBuildHouse(change(undevelopedMonopoly, 3, { hasHotel: true }), 3, 0), false);
    assert.equal(canBuildHouse(change(properties, 3, { houses: 4 }), 3, 0), false);
    assert.equal(canSellHouse(change(properties, 3, { houses: 0 }), 3, 0), false);
  });

  it("fails closed on malformed mutable property state", () => {
    const properties = createPropertyStates();
    assert.equal(calculateRent(properties.slice(0, 39), 1, 7), null);
    assert.equal(
      calculateRent(change(properties, 1, { position: 2, ownerSeatIndex: 0 }), 1, 7),
      null,
    );
    assert.equal(
      calculateRent(change(properties, 2, { ownerSeatIndex: 0 }), 1, 7),
      null,
    );
    assert.equal(
      calculateRent(change(properties, 5, { ownerSeatIndex: 0, houses: 1 }), 5, 7),
      null,
    );
    assert.equal(
      calculateRent(change(properties, 12, { ownerSeatIndex: 0, hasHotel: true }), 12, 7),
      null,
    );
    assert.equal(
      calculateRent(
        change(properties, 1, { ownerSeatIndex: 0, hasHotel: "false" as unknown as boolean }),
        1,
        7,
      ),
      null,
    );
    assert.equal(
      calculateRent(
        change(properties, 1, { ownerSeatIndex: 0, mortgaged: 0 as unknown as boolean }),
        1,
        7,
      ),
      null,
    );
    assert.equal(calculateRent(new Array<PropertyState>(40), 1, 7), null);
  });

  it("checks all in-match cash arithmetic without wrapping or underflow", () => {
    assert.equal(checkedAddMatchCash(matchCash(10n), matchCash(20n)), 30n);
    assert.equal(checkedSubtractMatchCash(matchCash(20n), matchCash(10n)), 10n);
    assert.equal(checkedSubtractMatchCash(matchCash(10n), matchCash(20n)), null);
    assert.equal(checkedAddMatchCash(matchCash(MAX_MATCH_CASH), matchCash(1n)), null);
    assert.throws(() => matchCash(MAX_MATCH_CASH + 1n), RangeError);
  });
});
