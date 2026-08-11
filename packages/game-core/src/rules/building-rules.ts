import type { MatchCash } from "../model/money";
import { checkedAddMatchCash, checkedSubtractMatchCash, matchCash } from "../model/money";
import { BOARD_SPACES } from "./board-definition";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import {
  canBuildHouse,
  canSellHouse,
  hasMonopoly,
  isValidPropertyStates,
  type PropertyState,
} from "./property-rules";

export interface BuildingInventory {
  readonly housesRemaining: number;
  readonly hotelsRemaining: number;
}

export type BuildingRuleErrorCode =
  | "INVALID_PROPERTY_STATE"
  | "INVALID_INVENTORY"
  | "NOT_OWNER"
  | "INVALID_PROPERTY_TYPE"
  | "PROPERTY_MORTGAGED"
  | "PROPERTY_HAS_HOTEL"
  | "INVALID_HOUSE_COUNT"
  | "DOES_NOT_OWN_COLOR_GROUP"
  | "MUST_BUILD_EVENLY"
  | "MUST_SELL_EVENLY"
  | "NOT_ENOUGH_HOUSES"
  | "NOT_ENOUGH_HOTELS"
  | "NO_BUILDING_TO_SELL"
  | "INSUFFICIENT_CASH"
  | "ARITHMETIC_OVERFLOW";

export type BuildingMutationResult =
  | {
      readonly ok: true;
      readonly properties: readonly PropertyState[];
      readonly inventory: BuildingInventory;
      readonly cash: MatchCash;
      readonly amount: MatchCash;
    }
  | { readonly ok: false; readonly code: BuildingRuleErrorCode };

export function isValidBuildingInventory(
  properties: readonly PropertyState[],
  inventory: BuildingInventory,
): boolean {
  if (
    !isValidPropertyStates(properties) ||
    !Number.isInteger(inventory.housesRemaining) ||
    !Number.isInteger(inventory.hotelsRemaining) ||
    inventory.housesRemaining < 0 ||
    inventory.hotelsRemaining < 0 ||
    inventory.housesRemaining > GAMEPLAY_POLICY.totalHouses ||
    inventory.hotelsRemaining > GAMEPLAY_POLICY.totalHotels
  ) {
    return false;
  }
  const housesOnBoard = properties.reduce((total, property) => total + property.houses, 0);
  const hotelsOnBoard = properties.filter((property) => property.hasHotel).length;
  return (
    housesOnBoard + inventory.housesRemaining === GAMEPLAY_POLICY.totalHouses &&
    hotelsOnBoard + inventory.hotelsRemaining === GAMEPLAY_POLICY.totalHotels
  );
}

function replaceProperty(
  properties: readonly PropertyState[],
  position: number,
  update: Partial<PropertyState>,
): readonly PropertyState[] {
  return properties.map((property) => property.position === position ? { ...property, ...update } : property);
}

function validateBase(
  properties: readonly PropertyState[],
  inventory: BuildingInventory,
  position: number,
  ownerSeatIndex: number,
): { readonly property: PropertyState; readonly houseCost: MatchCash } | BuildingRuleErrorCode {
  if (!isValidPropertyStates(properties)) return "INVALID_PROPERTY_STATE";
  if (!isValidBuildingInventory(properties, inventory)) return "INVALID_INVENTORY";
  const property = properties[position];
  const definition = BOARD_SPACES[position];
  if (property === undefined || definition === undefined) return "INVALID_PROPERTY_STATE";
  if (definition.propertyType !== "street") return "INVALID_PROPERTY_TYPE";
  if (property.ownerSeatIndex !== ownerSeatIndex) return "NOT_OWNER";
  return { property, houseCost: matchCash(BigInt(definition.houseCost)) };
}

export function buildHouse(
  properties: readonly PropertyState[],
  inventory: BuildingInventory,
  position: number,
  ownerSeatIndex: number,
  cash: MatchCash,
): BuildingMutationResult {
  const base = validateBase(properties, inventory, position, ownerSeatIndex);
  if (typeof base === "string") return { ok: false, code: base };
  if (base.property.mortgaged) return { ok: false, code: "PROPERTY_MORTGAGED" };
  if (base.property.hasHotel) return { ok: false, code: "PROPERTY_HAS_HOTEL" };
  if (base.property.houses >= 4) return { ok: false, code: "INVALID_HOUSE_COUNT" };
  const definition = BOARD_SPACES[position];
  if (definition === undefined || !hasMonopoly(properties, ownerSeatIndex, definition.colorGroup)) {
    return { ok: false, code: "DOES_NOT_OWN_COLOR_GROUP" };
  }
  if (!canBuildHouse(properties, position, ownerSeatIndex)) return { ok: false, code: "MUST_BUILD_EVENLY" };
  if (inventory.housesRemaining < 1) return { ok: false, code: "NOT_ENOUGH_HOUSES" };
  const nextCash = checkedSubtractMatchCash(cash, base.houseCost);
  if (nextCash === null) return { ok: false, code: "INSUFFICIENT_CASH" };
  return {
    ok: true,
    properties: replaceProperty(properties, position, { houses: base.property.houses + 1 }),
    inventory: { ...inventory, housesRemaining: inventory.housesRemaining - 1 },
    cash: nextCash,
    amount: base.houseCost,
  };
}

export function buildHotel(
  properties: readonly PropertyState[],
  inventory: BuildingInventory,
  position: number,
  ownerSeatIndex: number,
  cash: MatchCash,
): BuildingMutationResult {
  const base = validateBase(properties, inventory, position, ownerSeatIndex);
  if (typeof base === "string") return { ok: false, code: base };
  if (base.property.mortgaged) return { ok: false, code: "PROPERTY_MORTGAGED" };
  if (base.property.hasHotel) return { ok: false, code: "PROPERTY_HAS_HOTEL" };
  if (base.property.houses !== 4) return { ok: false, code: "INVALID_HOUSE_COUNT" };
  const definition = BOARD_SPACES[position];
  if (definition === undefined || !hasMonopoly(properties, ownerSeatIndex, definition.colorGroup)) {
    return { ok: false, code: "DOES_NOT_OWN_COLOR_GROUP" };
  }
  if (inventory.hotelsRemaining < 1) return { ok: false, code: "NOT_ENOUGH_HOTELS" };
  const nextCash = checkedSubtractMatchCash(cash, base.houseCost);
  if (nextCash === null) return { ok: false, code: "INSUFFICIENT_CASH" };
  return {
    ok: true,
    properties: replaceProperty(properties, position, { houses: 0, hasHotel: true }),
    inventory: {
      housesRemaining: inventory.housesRemaining + 4,
      hotelsRemaining: inventory.hotelsRemaining - 1,
    },
    cash: nextCash,
    amount: base.houseCost,
  };
}

export function sellHouse(
  properties: readonly PropertyState[],
  inventory: BuildingInventory,
  position: number,
  ownerSeatIndex: number,
  cash: MatchCash,
): BuildingMutationResult {
  const base = validateBase(properties, inventory, position, ownerSeatIndex);
  if (typeof base === "string") return { ok: false, code: base };
  if (base.property.houses < 1 || base.property.hasHotel) return { ok: false, code: "NO_BUILDING_TO_SELL" };
  if (!canSellHouse(properties, position, ownerSeatIndex)) return { ok: false, code: "MUST_SELL_EVENLY" };
  const salePrice = matchCash(base.houseCost / 2n);
  const nextCash = checkedAddMatchCash(cash, salePrice);
  if (nextCash === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
  return {
    ok: true,
    properties: replaceProperty(properties, position, { houses: base.property.houses - 1 }),
    inventory: { ...inventory, housesRemaining: inventory.housesRemaining + 1 },
    cash: nextCash,
    amount: salePrice,
  };
}

export function sellHotel(
  properties: readonly PropertyState[],
  inventory: BuildingInventory,
  position: number,
  ownerSeatIndex: number,
  cash: MatchCash,
): BuildingMutationResult {
  const base = validateBase(properties, inventory, position, ownerSeatIndex);
  if (typeof base === "string") return { ok: false, code: base };
  if (!base.property.hasHotel) return { ok: false, code: "NO_BUILDING_TO_SELL" };
  if (inventory.housesRemaining < 4) return { ok: false, code: "NOT_ENOUGH_HOUSES" };
  const salePrice = matchCash(base.houseCost / 2n);
  const nextCash = checkedAddMatchCash(cash, salePrice);
  if (nextCash === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
  return {
    ok: true,
    properties: replaceProperty(properties, position, { houses: 4, hasHotel: false }),
    inventory: {
      housesRemaining: inventory.housesRemaining - 4,
      hotelsRemaining: inventory.hotelsRemaining + 1,
    },
    cash: nextCash,
    amount: salePrice,
  };
}
