import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHotel,
  buildHouse,
  createPropertyStates,
  isValidBuildingInventory,
  MAX_MATCH_CASH,
  matchCash,
  sellHotel,
  sellHouse,
  type BuildingInventory,
  type PropertyState,
} from "../src";

function brownMonopoly(): readonly PropertyState[] {
  return createPropertyStates().map((property) =>
    property.position === 1 || property.position === 3 ? { ...property, ownerSeatIndex: 0 } : property,
  );
}

function set(
  properties: readonly PropertyState[],
  position: number,
  fields: Partial<PropertyState>,
): readonly PropertyState[] {
  return properties.map((property) => property.position === position ? { ...property, ...fields } : property);
}

function distributeHouses(
  properties: readonly PropertyState[],
  distribution: readonly (readonly [number, number])[],
): readonly PropertyState[] {
  return distribution.reduce(
    (current, [position, houses]) => set(current, position, { ownerSeatIndex: 1, houses }),
    properties,
  );
}

describe("building mutations", () => {
  const fullInventory: BuildingInventory = { housesRemaining: 32, hotelsRemaining: 12 };

  it("builds houses evenly with derived cost and conserved inventory", () => {
    const first = buildHouse(brownMonopoly(), fullInventory, 1, 0, matchCash(1_500n));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.properties[1]?.houses, 1);
    assert.deepEqual(first.inventory, { housesRemaining: 31, hotelsRemaining: 12 });
    assert.equal(first.cash, 1_450n);
    assert.equal(first.amount, 50n);
    assert.equal(isValidBuildingInventory(first.properties, first.inventory), true);
    assert.deepEqual(buildHouse(first.properties, first.inventory, 1, 0, first.cash), {
      ok: false,
      code: "MUST_BUILD_EVENLY",
    });
  });

  it("converts four houses into a hotel and charges one house cost", () => {
    let properties = brownMonopoly();
    properties = set(properties, 1, { houses: 4 });
    properties = set(properties, 3, { houses: 4 });
    const inventory = { housesRemaining: 24, hotelsRemaining: 12 };
    const result = buildHotel(properties, inventory, 1, 0, matchCash(500n));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.properties[1], {
      position: 1,
      ownerSeatIndex: 0,
      houses: 0,
      hasHotel: true,
      mortgaged: false,
    });
    assert.deepEqual(result.inventory, { housesRemaining: 28, hotelsRemaining: 11 });
    assert.equal(result.cash, 450n);
    assert.equal(isValidBuildingInventory(result.properties, result.inventory), true);
  });

  it("preserves the legacy hotel-sale quirk and requires four bank houses", () => {
    let properties = set(brownMonopoly(), 1, { hasHotel: true });
    const inventory = { housesRemaining: 32, hotelsRemaining: 11 };
    const sold = sellHotel(properties, inventory, 1, 0, matchCash(100n));
    assert.equal(sold.ok, true);
    if (!sold.ok) return;
    assert.equal(sold.properties[1]?.hasHotel, false);
    assert.equal(sold.properties[1]?.houses, 4);
    assert.deepEqual(sold.inventory, { housesRemaining: 28, hotelsRemaining: 12 });
    assert.equal(sold.amount, 25n);
    assert.equal(sold.cash, 125n);

    properties = set(brownMonopoly(), 1, { hasHotel: true });
    properties = distributeHouses(properties, [[6, 4], [8, 4], [9, 4], [11, 4], [13, 4], [14, 4], [16, 4], [18, 1]]);
    const unavailable = sellHotel(properties, { housesRemaining: 3, hotelsRemaining: 11 }, 1, 0, matchCash(100n));
    assert.deepEqual(unavailable, { ok: false, code: "NOT_ENOUGH_HOUSES" });
  });

  it("sells houses evenly for half cost and rejects insufficient funds and stock", () => {
    let properties = brownMonopoly();
    properties = set(properties, 1, { houses: 1 });
    properties = set(properties, 3, { houses: 1 });
    const inventory = { housesRemaining: 30, hotelsRemaining: 12 };
    const sold = sellHouse(properties, inventory, 1, 0, matchCash(100n));
    assert.equal(sold.ok, true);
    if (sold.ok) {
      assert.equal(sold.cash, 125n);
      assert.equal(sold.properties[1]?.houses, 0);
      assert.equal(isValidBuildingInventory(sold.properties, sold.inventory), true);
    }
    assert.deepEqual(buildHouse(brownMonopoly(), fullInventory, 1, 0, matchCash(49n)), {
      ok: false,
      code: "INSUFFICIENT_CASH",
    });
    const depleted = distributeHouses(
      brownMonopoly(),
      [[6, 4], [8, 4], [9, 4], [11, 4], [13, 4], [14, 4], [16, 4], [18, 4]],
    );
    assert.deepEqual(buildHouse(depleted, { housesRemaining: 0, hotelsRemaining: 12 }, 1, 0, matchCash(500n)), {
      ok: false,
      code: "NOT_ENOUGH_HOUSES",
    });
  });

  it("fails closed for wrong owner, non-street, mortgage, and malformed inventory", () => {
    assert.deepEqual(buildHouse(brownMonopoly(), fullInventory, 1, 1, matchCash(500n)), {
      ok: false,
      code: "NOT_OWNER",
    });
    assert.deepEqual(buildHouse(createPropertyStates(), fullInventory, 5, 0, matchCash(500n)), {
      ok: false,
      code: "INVALID_PROPERTY_TYPE",
    });
    const mortgaged = set(brownMonopoly(), 1, { mortgaged: true });
    assert.deepEqual(buildHouse(mortgaged, fullInventory, 1, 0, matchCash(500n)), {
      ok: false,
      code: "PROPERTY_MORTGAGED",
    });
    const houseWithoutStockMovement = set(brownMonopoly(), 1, { houses: 1 });
    assert.deepEqual(buildHouse(houseWithoutStockMovement, fullInventory, 3, 0, matchCash(500n)), {
      ok: false,
      code: "INVALID_INVENTORY",
    });
  });

  it("locks hotel depletion, insufficient cash, and the no-peer-evenness source quirk", () => {
    let uneven = set(brownMonopoly(), 1, { houses: 4 });
    const built = buildHotel(uneven, { housesRemaining: 28, hotelsRemaining: 12 }, 1, 0, matchCash(50n));
    assert.equal(built.ok, true);

    const hotelPositions = [6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24];
    uneven = hotelPositions.reduce(
      (properties, position) => set(properties, position, { ownerSeatIndex: 1, hasHotel: true }),
      set(set(brownMonopoly(), 1, { houses: 4 }), 3, { houses: 4 }),
    );
    assert.deepEqual(buildHotel(uneven, { housesRemaining: 24, hotelsRemaining: 0 }, 1, 0, matchCash(500n)), {
      ok: false,
      code: "NOT_ENOUGH_HOTELS",
    });
    const fourEach = set(set(brownMonopoly(), 1, { houses: 4 }), 3, { houses: 4 });
    assert.deepEqual(buildHotel(fourEach, { housesRemaining: 24, hotelsRemaining: 12 }, 1, 0, matchCash(49n)), {
      ok: false,
      code: "INSUFFICIENT_CASH",
    });
  });

  it("rejects uneven sale and sale proceeds overflow", () => {
    const uneven = set(set(brownMonopoly(), 1, { houses: 1 }), 3, { houses: 3 });
    assert.deepEqual(sellHouse(uneven, { housesRemaining: 28, hotelsRemaining: 12 }, 1, 0, matchCash(100n)), {
      ok: false,
      code: "MUST_SELL_EVENLY",
    });
    const even = set(set(brownMonopoly(), 1, { houses: 1 }), 3, { houses: 1 });
    assert.deepEqual(sellHouse(even, { housesRemaining: 30, hotelsRemaining: 12 }, 1, 0, matchCash(MAX_MATCH_CASH)), {
      ok: false,
      code: "ARITHMETIC_OVERFLOW",
    });
  });
});
