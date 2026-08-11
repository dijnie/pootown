import {
  BoardSpace,
  PropertySpace,
  RailroadSpace,
  UtilitySpace,
  TaxSpace,
  CornerSpace,
  ChanceSpace,
  CommunityChestSpace,
  boardData,
  ColorGroup,
} from "@/configs/board-data";
import { PropertyAccount, PlayerAccount, PropertyType } from "@/types/schema";

export const isPropertySpace = (space: BoardSpace): space is PropertySpace => {
  return space.type === "property";
};

export const isRailroadSpace = (space: BoardSpace): space is RailroadSpace => {
  return space.type === "railroad";
};

export const isUtilitySpace = (space: BoardSpace): space is UtilitySpace => {
  return space.type === "utility";
};

export const isCornerSpace = (space: BoardSpace): space is CornerSpace => {
  return space.type === "corner";
};

export const isChanceSpace = (space: BoardSpace): space is ChanceSpace => {
  return space.type === "chance";
};

export const isCommunityChestSpace = (
  space: BoardSpace
): space is CommunityChestSpace => {
  return space.type === "community-chest";
};

export const isTaxSpace = (space: BoardSpace): space is TaxSpace => {
  return space.type === "tax";
};

export const getBoardSpaceData = (position: number): BoardSpace | null => {
  return boardData.find((p) => p.position === position) || null;
};

export const getPropertiesByColorGroup = (
  colorGroup: ColorGroup
): PropertySpace[] => {
  return boardData.filter(
    (space): space is PropertySpace =>
      isPropertySpace(space) && space.colorGroup === colorGroup
  );
};

export const getBoardRowData = () => {
  const bottomRow = boardData.filter((p) =>
    [9, 8, 7, 6, 5, 4, 3, 2, 1].includes(p.position)
  );
  const leftRow = boardData.filter((p) =>
    [11, 12, 13, 14, 15, 16, 17, 18, 19].includes(p.position)
  );
  const topRow = boardData.filter((p) =>
    [21, 22, 23, 24, 25, 26, 27, 28, 29].includes(p.position)
  );
  const rightRow = boardData.filter((p) =>
    [31, 32, 33, 34, 35, 36, 37, 38, 39].includes(p.position)
  );

  return {
    bottomRow: bottomRow.reverse(),
    leftRow: leftRow.reverse(),
    topRow: topRow,
    rightRow: rightRow,
  };
};

export const getTypedSpaceData = <T extends BoardSpace["type"]>(
  position: number,
  expectedType: T
): Extract<BoardSpace, { type: T }> | null => {
  const space = getBoardSpaceData(position);
  if (!space || space.type !== expectedType) return null;

  return space as Extract<BoardSpace, { type: T }>;
};

// New utility functions for border management
export type BoardSide = "bottom" | "left" | "top" | "right";

export const getBoardSide = (position: number): BoardSide => {
  if ([1, 2, 3, 4, 5, 6, 7, 8, 9].includes(position)) return "bottom";
  if ([11, 12, 13, 14, 15, 16, 17, 18, 19].includes(position)) return "left";
  if ([21, 22, 23, 24, 25, 26, 27, 28, 29].includes(position)) return "top";
  if ([31, 32, 33, 34, 35, 36, 37, 38, 39].includes(position)) return "right";
  return "bottom"; // fallback
};

export const getPositionInRow = (
  position: number
): "first" | "middle" | "last" => {
  const side = getBoardSide(position);

  switch (side) {
    case "bottom":
      if (position === 9) return "first";
      if (position === 1) return "last";
      return "middle";
    case "left":
      if (position === 11) return "first";
      if (position === 19) return "last";
      return "middle";
    case "top":
      if (position === 21) return "first";
      if (position === 29) return "last";
      return "middle";
    case "right":
      if (position === 31) return "first";
      if (position === 39) return "last";
      return "middle";
    default:
      return "middle";
  }
};

export const getBorderClasses = (position: number): string => {
  const side = getBoardSide(position);
  const positionInRow = getPositionInRow(position);

  const borders: string[] = [];

  switch (side) {
    case "bottom":
      borders.push("border-t-2"); // Always top border for bottom row
      if (positionInRow === "first") {
        borders.push("border-r-1"); // Right border for first (rightmost) space
      } else if (positionInRow === "last") {
        borders.push("border-l-1"); // Left border for last (leftmost) space
      } else {
        borders.push("border-x-1"); // Left and right borders for middle spaces
      }
      break;

    case "left":
      borders.push("border-r-2"); // Always right border for left row
      if (positionInRow === "first") {
        borders.push("border-t-1"); // Bottom border for first (bottom) space
      } else if (positionInRow === "last") {
        borders.push("border-b-1"); // Top border for last (top) space
      } else {
        borders.push("border-y-1"); // Top and bottom borders for middle spaces
      }
      break;

    case "top":
      borders.push("border-b-2"); // Always bottom border for top row
      if (positionInRow === "first") {
        borders.push("border-r-1"); // Left border for first (leftmost) space
      } else if (positionInRow === "last") {
        borders.push("border-l-1"); // Right border for last (rightmost) space
      } else {
        borders.push("border-x-1"); // Left and right borders for middle spaces
      }
      break;

    case "right":
      borders.push("border-l-2"); // Always left border for right row
      if (positionInRow === "first") {
        borders.push("border-b-1"); // Top border for first (top) space
      } else if (positionInRow === "last") {
        borders.push("border-t-1"); // Bottom border for last (bottom) space
      } else {
        borders.push("border-y-1"); // Top and bottom borders for middle spaces
      }
      break;
  }

  return borders.join(" ") + " border-black";
};

export const getColorBarClasses = (side: BoardSide): string => {
  switch (side) {
    case "bottom":
      return "absolute top-0 left-0 w-full hh-4 border-b-2 border-black";
    case "left":
      return "absolute top-0 right-0 h-full ww-4 border-l-2 border-black";
    case "top":
      return "absolute bottom-0 left-0 w-full hh-4 border-t-2 border-black";
    case "right":
      return "absolute top-0 left-0 h-full ww-4 border-r-2 border-black";
    default:
      return "absolute top-0 left-0 w-full hh-4 border-b-2 border-black";
  }
};

export const getOwnerIndicatorClasses = (side: BoardSide): string => {
  switch (side) {
    case "bottom":
      return "absolute -translate-y-[110%] inset-x-0 w-full";
    case "left":
      return "absolute top-0 -right-3 h-full w-3";
    case "top":
      return "absolute -bottom-3 left-0 w-full h-3";
    case "right":
      return "absolute top-0 -left-3 h-full w-3";
    default:
      return "absolute top-0 left-0 w-full h-3";
  }
};

export const getTextContainerClasses = (side: BoardSide): string => {
  switch (side) {
    case "bottom":
      return `flex flex-col justify-between h-full p-1 pt-5`; // Extra padding top for color bar
    case "left":
      // For left column: vertical writing mode, left to right
      return `flex flex-col justify-between size-full p-1 pr-5 [writing-mode:vertical-rl]`;
    case "top":
      // return `flex flex-col justify-between size-full p-1 pb-5 [transform:rotate(180deg)] pt-5`;
      return `flex flex-col justify-between size-full p-1 pb-5`;
    case "right":
      // For right column: vertical writing mode, right to left with 180deg rotation
      return `flex flex-col justify-between size-full p-1 pr-5 [writing-mode:vertical-rl] [transform:rotate(180deg)]`;
    default:
      return `flex flex-col justify-between h-full p-1 pt-5`;
  }
};

// Add this function at the end of the file
export const calculateRentForProperty = (
  property: PropertyAccount,
  ownerState: PlayerAccount,
  diceResult: [number, number],
  allProperties: PropertyAccount[]
): number => {
  // FIXME
  const propertyTypeMap = {
    [PropertyType.Street]: "Street",
    [PropertyType.Railroad]: "Railroad",
    [PropertyType.Utility]: "Utility",
    // @ts-expect-error
    [PropertyType.Property]: "Street", // Fallback to Street for Property type
  };

  const propertyTypeString = propertyTypeMap[property.propertyType] || "Street";

  switch (propertyTypeString) {
    case "Street": {
      if (property.hasHotel) {
        return property.rentWithHotel;
      } else if (property.houses > 0) {
        const houseIndex = property.houses - 1;
        if (houseIndex < property.rentWithHouses.length) {
          return property.rentWithHouses[houseIndex];
        } else {
          return property.rentBase;
        }
      } else {
        if (
          hasColorGroupMonopoly(ownerState, property.colorGroup, allProperties)
        ) {
          return property.rentWithColorGroup;
        } else {
          return property.rentBase;
        }
      }
    }
    case "Railroad": {
      const railroadsOwned = countRailroadsOwned(ownerState, allProperties);
      const baseRent = property.rentBase;

      switch (railroadsOwned) {
        case 1:
          return baseRent;
        case 2:
          return baseRent * 2;
        case 3:
          return baseRent * 4;
        case 4:
          return baseRent * 8;
        default:
          return baseRent;
      }
    }
    case "Utility": {
      const utilitiesOwned = countUtilitiesOwned(ownerState, allProperties);
      const diceSum = diceResult[0] + diceResult[1];

      const multiplier = utilitiesOwned === 1 ? 4 : 10;
      return diceSum * multiplier;
    }
    default:
      return 0;
  }
};

export const hasColorGroupMonopoly = (
  ownerState: PlayerAccount,
  colorGroup: ColorGroup,
  allProperties: PropertyAccount[]
): boolean => {
  const propertiesInGroup = allProperties.filter(
    (prop) =>
      prop.colorGroup === colorGroup &&
      prop.propertyType === PropertyType.Street
  );

  const ownedPropertiesInGroup = propertiesInGroup.filter(
    (prop) => prop.owner === ownerState.wallet
  );

  return (
    propertiesInGroup.length > 0 &&
    ownedPropertiesInGroup.length === propertiesInGroup.length
  );
};

const countRailroadsOwned = (
  ownerState: PlayerAccount,
  allProperties: PropertyAccount[]
): number => {
  return allProperties.filter(
    (prop) =>
      prop.owner === ownerState.wallet &&
      prop.propertyType === PropertyType.Railroad
  ).length;
};

const countUtilitiesOwned = (
  ownerState: PlayerAccount,
  allProperties: PropertyAccount[]
): number => {
  return allProperties.filter(
    (prop) =>
      prop.owner === ownerState.wallet &&
      prop.propertyType === PropertyType.Utility
  ).length;
};
