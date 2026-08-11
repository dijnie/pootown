export const RULESET_VERSION = 1 as const;

export const LEGACY_CONSTANTS_SHA256 =
  "54ae0ff2cf2fed8ae22fabd8e6b2cbe7860f3586636fcf7464315f2eec424d45" as const;

export type ColorGroup =
  | "brown"
  | "lightBlue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkBlue"
  | "railroad"
  | "utility"
  | "special";

export type PropertyType =
  | "street"
  | "railroad"
  | "utility"
  | "corner"
  | "chance"
  | "communityChest"
  | "tax";

export interface BoardSpaceDefinition {
  readonly position: number;
  readonly price: number;
  readonly rent: readonly [number, number, number, number, number, number];
  readonly houseCost: number;
  readonly mortgageValue: number;
  readonly colorGroup: ColorGroup;
  readonly propertyType: PropertyType;
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

const boardSpaces: readonly BoardSpaceDefinition[] = [
  { position: 0, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "corner" },
  { position: 1, price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50, mortgageValue: 30, colorGroup: "brown", propertyType: "street" },
  { position: 2, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "communityChest" },
  { position: 3, price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50, mortgageValue: 30, colorGroup: "brown", propertyType: "street" },
  { position: 4, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "tax" },
  { position: 5, price: 200, rent: [25, 50, 100, 200, 0, 0], houseCost: 0, mortgageValue: 100, colorGroup: "railroad", propertyType: "railroad" },
  { position: 6, price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgageValue: 50, colorGroup: "lightBlue", propertyType: "street" },
  { position: 7, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "chance" },
  { position: 8, price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgageValue: 50, colorGroup: "lightBlue", propertyType: "street" },
  { position: 9, price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50, mortgageValue: 60, colorGroup: "lightBlue", propertyType: "street" },
  { position: 10, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "corner" },
  { position: 11, price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 50, mortgageValue: 70, colorGroup: "pink", propertyType: "street" },
  { position: 12, price: 150, rent: [4, 10, 0, 0, 0, 0], houseCost: 0, mortgageValue: 75, colorGroup: "utility", propertyType: "utility" },
  { position: 13, price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, mortgageValue: 70, colorGroup: "pink", propertyType: "street" },
  { position: 14, price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100, mortgageValue: 80, colorGroup: "pink", propertyType: "street" },
  { position: 15, price: 200, rent: [25, 50, 100, 200, 0, 0], houseCost: 0, mortgageValue: 100, colorGroup: "railroad", propertyType: "railroad" },
  { position: 16, price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgageValue: 90, colorGroup: "orange", propertyType: "street" },
  { position: 17, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "communityChest" },
  { position: 18, price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgageValue: 90, colorGroup: "orange", propertyType: "street" },
  { position: 19, price: 200, rent: [16, 80, 240, 600, 800, 1000], houseCost: 100, mortgageValue: 100, colorGroup: "orange", propertyType: "street" },
  { position: 20, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "corner" },
  { position: 21, price: 220, rent: [18, 90, 270, 650, 850, 1050], houseCost: 150, mortgageValue: 110, colorGroup: "red", propertyType: "street" },
  { position: 22, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "chance" },
  { position: 23, price: 220, rent: [18, 90, 270, 650, 850, 1050], houseCost: 150, mortgageValue: 110, colorGroup: "red", propertyType: "street" },
  { position: 24, price: 240, rent: [20, 100, 300, 750, 950, 1100], houseCost: 150, mortgageValue: 120, colorGroup: "red", propertyType: "street" },
  { position: 25, price: 200, rent: [25, 50, 100, 200, 0, 0], houseCost: 0, mortgageValue: 100, colorGroup: "railroad", propertyType: "railroad" },
  { position: 26, price: 260, rent: [22, 110, 330, 850, 1050, 1200], houseCost: 150, mortgageValue: 120, colorGroup: "yellow", propertyType: "street" },
  { position: 27, price: 260, rent: [22, 110, 330, 850, 1050, 1200], houseCost: 150, mortgageValue: 130, colorGroup: "yellow", propertyType: "street" },
  { position: 28, price: 150, rent: [4, 10, 0, 0, 0, 0], houseCost: 0, mortgageValue: 75, colorGroup: "utility", propertyType: "utility" },
  { position: 29, price: 280, rent: [24, 120, 360, 900, 1100, 1300], houseCost: 150, mortgageValue: 140, colorGroup: "yellow", propertyType: "street" },
  { position: 30, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "corner" },
  { position: 31, price: 300, rent: [26, 130, 390, 900, 1100, 1300], houseCost: 200, mortgageValue: 150, colorGroup: "green", propertyType: "street" },
  { position: 32, price: 300, rent: [26, 130, 390, 900, 1100, 1300], houseCost: 200, mortgageValue: 150, colorGroup: "green", propertyType: "street" },
  { position: 33, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "communityChest" },
  { position: 34, price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, mortgageValue: 160, colorGroup: "green", propertyType: "street" },
  { position: 35, price: 200, rent: [25, 50, 100, 200, 0, 0], houseCost: 0, mortgageValue: 100, colorGroup: "railroad", propertyType: "railroad" },
  { position: 36, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "chance" },
  { position: 37, price: 350, rent: [35, 175, 500, 1100, 1400, 1500], houseCost: 200, mortgageValue: 175, colorGroup: "darkBlue", propertyType: "street" },
  { position: 38, price: 0, rent: [0, 0, 0, 0, 0, 0], houseCost: 0, mortgageValue: 0, colorGroup: "special", propertyType: "tax" },
  { position: 39, price: 400, rent: [50, 200, 600, 1200, 1600, 2000], houseCost: 200, mortgageValue: 200, colorGroup: "darkBlue", propertyType: "street" },
];

export const BOARD_SPACES = deepFreeze(boardSpaces);

export const COLOR_GROUP_POSITIONS = deepFreeze({
  brown: [1, 3],
  lightBlue: [6, 8, 9],
  pink: [11, 13, 14],
  orange: [16, 18, 19],
  red: [21, 23, 24],
  yellow: [26, 27, 29],
  green: [31, 32, 34],
  darkBlue: [37, 39],
  railroad: [5, 15, 25, 35],
  utility: [12, 28],
} satisfies Record<Exclude<ColorGroup, "special">, readonly number[]>);

export const BOARD_RULESET_AUTHORITY = deepFreeze({
  rulesetVersion: RULESET_VERSION,
  evidence: "frozen-rust-source",
  sourcePath: "programs/panda-monopoly/src/constants.rs",
  sourceSha256: LEGACY_CONSTANTS_SHA256,
  boardSize: 40,
});
