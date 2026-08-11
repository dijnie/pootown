import type { MatchCash } from "../model/money";
import { matchCash } from "../model/money";
import {
  BOARD_SPACES,
  COLOR_GROUP_POSITIONS,
  type BoardSpaceDefinition,
  type ColorGroup,
} from "./board-definition";

export interface PropertyState {
  readonly position: number;
  readonly ownerSeatIndex: number | null;
  readonly houses: number;
  readonly hasHotel: boolean;
  readonly mortgaged: boolean;
}

export function createPropertyStates(): readonly PropertyState[] {
  return BOARD_SPACES.map((space) => ({
    position: space.position,
    ownerSeatIndex: null,
    houses: 0,
    hasHotel: false,
    mortgaged: false,
  }));
}

export function isValidPropertyStates(properties: readonly PropertyState[]): boolean {
  return Array.isArray(properties) && properties.length === BOARD_SPACES.length && Array.from(properties).every((property, index) => {
    const definition = BOARD_SPACES[index];
    if (
      typeof property !== "object" ||
      property === null ||
      Array.isArray(property) ||
      definition === undefined ||
      property.position !== index ||
      (property.ownerSeatIndex !== null &&
        (!Number.isInteger(property.ownerSeatIndex) || property.ownerSeatIndex < 0 || property.ownerSeatIndex > 3)) ||
      !Number.isInteger(property.houses) ||
      property.houses < 0 ||
      property.houses > 4 ||
      typeof property.hasHotel !== "boolean" ||
      typeof property.mortgaged !== "boolean" ||
      (property.hasHotel && property.houses !== 0) ||
      (property.mortgaged && (property.houses !== 0 || property.hasHotel)) ||
      (definition.propertyType !== "street" && (property.houses !== 0 || property.hasHotel))
    ) {
      return false;
    }
    return isOwnableSpace(definition)
      ? property.ownerSeatIndex !== null || (!property.mortgaged && property.houses === 0 && !property.hasHotel)
      : property.ownerSeatIndex === null && !property.mortgaged && property.houses === 0 && !property.hasHotel;
  });
}

export function isOwnableSpace(space: Pick<BoardSpaceDefinition, "propertyType">): boolean {
  return space.propertyType === "street" || space.propertyType === "railroad" || space.propertyType === "utility";
}

export function ownedPropertyPositions(
  properties: readonly PropertyState[],
  ownerSeatIndex: number,
): readonly number[] {
  return properties.flatMap((property) => property.ownerSeatIndex === ownerSeatIndex ? [property.position] : []);
}

export function hasMonopoly(
  properties: readonly PropertyState[],
  ownerSeatIndex: number,
  colorGroup: ColorGroup,
): boolean {
  if (
    !isValidPropertyStates(properties) ||
    colorGroup === "special" ||
    colorGroup === "railroad" ||
    colorGroup === "utility"
  ) return false;
  return COLOR_GROUP_POSITIONS[colorGroup].every(
    (position) => properties[position]?.ownerSeatIndex === ownerSeatIndex,
  );
}

export function calculateRent(
  properties: readonly PropertyState[],
  position: number,
  diceTotal: number,
): MatchCash | null {
  if (!isValidPropertyStates(properties)) return null;
  const property = properties[position];
  const definition = BOARD_SPACES[position];
  if (property === undefined || definition === undefined || property.position !== position || !isOwnableSpace(definition)) {
    return null;
  }
  if (property.ownerSeatIndex === null || property.mortgaged) return matchCash(0n);

  if (definition.propertyType === "street") {
    const baseRent = definition.rent[0];
    if (baseRent === undefined) return null;
    const rent = property.hasHotel
      ? definition.rent[5]
      : property.houses > 0
        ? definition.rent[property.houses]
        : baseRent * (hasMonopoly(properties, property.ownerSeatIndex, definition.colorGroup) ? 2 : 1);
    return rent === undefined ? null : matchCash(BigInt(rent));
  }

  const owned = ownedPropertyPositions(properties, property.ownerSeatIndex);
  if (definition.propertyType === "railroad") {
    const count = owned.filter((ownedPosition) => BOARD_SPACES[ownedPosition]?.propertyType === "railroad").length;
    const rent = [0, 25, 50, 100, 200][count];
    return rent === undefined ? null : matchCash(BigInt(rent));
  }

  if (!Number.isInteger(diceTotal) || diceTotal < 2 || diceTotal > 12) return null;
  const utilityCount = owned.filter((ownedPosition) => BOARD_SPACES[ownedPosition]?.propertyType === "utility").length;
  return matchCash(BigInt(diceTotal * (utilityCount === 2 ? 10 : 4)));
}

export function canBuildHouse(
  properties: readonly PropertyState[],
  position: number,
  ownerSeatIndex: number,
): boolean {
  if (!isValidPropertyStates(properties)) return false;
  const property = properties[position];
  const definition = BOARD_SPACES[position];
  if (
    property === undefined ||
    definition?.propertyType !== "street" ||
    property.ownerSeatIndex !== ownerSeatIndex ||
    property.mortgaged ||
    property.hasHotel ||
    property.houses >= 4 ||
    !hasMonopoly(properties, ownerSeatIndex, definition.colorGroup)
  ) {
    return false;
  }
  return COLOR_GROUP_POSITIONS[definition.colorGroup as Exclude<ColorGroup, "special" | "railroad" | "utility">].every(
    (groupPosition) => property.houses + 1 <= (properties[groupPosition]?.houses ?? -1) + 1,
  );
}

export function canSellHouse(
  properties: readonly PropertyState[],
  position: number,
  ownerSeatIndex: number,
): boolean {
  if (!isValidPropertyStates(properties)) return false;
  const property = properties[position];
  const definition = BOARD_SPACES[position];
  if (
    property === undefined ||
    definition?.propertyType !== "street" ||
    property.ownerSeatIndex !== ownerSeatIndex ||
    property.hasHotel ||
    property.houses < 1 ||
    !hasMonopoly(properties, ownerSeatIndex, definition.colorGroup)
  ) {
    return false;
  }
  const newCount = property.houses - 1;
  return COLOR_GROUP_POSITIONS[definition.colorGroup as Exclude<ColorGroup, "special" | "railroad" | "utility">].every(
    (groupPosition) => newCount >= Math.max(0, (properties[groupPosition]?.houses ?? 0) - 1),
  );
}
