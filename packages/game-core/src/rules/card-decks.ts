import { LEGACY_CONSTANTS_SHA256, RULESET_VERSION } from "./board-definition";

export type CardEffect =
  | "money"
  | "move"
  | "getOutOfJailFree"
  | "collectFromPlayers"
  | "moveToNearest"
  | "repairFree";

export interface CardDefinition {
  readonly id: number;
  readonly title: string;
  readonly copy: string;
  readonly effect: CardEffect;
  readonly amount: number;
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

const chanceCards: readonly CardDefinition[] = [
  { id: 1, title: "Memecoin Pump!", copy: "Move to the nearest memecoin property.", effect: "moveToNearest", amount: 1 },
  { id: 2, title: "Rug Pull Alert!", copy: "Pay $50.", effect: "money", amount: -50 },
  { id: 3, title: "Flash Loan Win", copy: "Collect $100.", effect: "money", amount: 100 },
  { id: 4, title: "Congestion Jam", copy: "Move back 3 spaces.", effect: "move", amount: -3 },
  { id: 5, title: "Dev Unlock", copy: "Keep this Get Out of Jail Free card.", effect: "getOutOfJailFree", amount: 0 },
];

const communityChestCards: readonly CardDefinition[] = [
  { id: 1, title: "Retroactive Airdrop!", copy: "Collect $50 for each other player.", effect: "collectFromPlayers", amount: 50 },
  { id: 2, title: "Staking Rewards", copy: "Collect $100.", effect: "money", amount: 100 },
  { id: 3, title: "NFT Floor Sweep", copy: "Move to Free Airdrop Parking at position 20.", effect: "move", amount: 20 },
  { id: 4, title: "DAO Vote Win", copy: "Receive free property repairs.", effect: "repairFree", amount: 0 },
  { id: 5, title: "Wallet Drain Fee", copy: "Pay $50.", effect: "money", amount: -50 },
];

export const CHANCE_CARDS = deepFreeze(chanceCards);
export const COMMUNITY_CHEST_CARDS = deepFreeze(communityChestCards);

export const COMMUNITY_FREE_PARKING_DIVERGENCE = deepFreeze({
  name: "community-chest-free-parking",
  cardId: 3,
  legacyDestination: 21,
  targetDestination: 20,
  reason: "Approved correction to the board's Free Parking position.",
});

export const EXCLUDED_RULES = deepFreeze([
  {
    name: "auction",
    category: "command",
    targetDisposition: "excluded",
    reason: "The legacy instruction is commented out and no current UI action executes it.",
  },
  {
    name: "unreachable-chance-effects",
    category: "card-effects",
    deck: "chance",
    effects: ["goToJail", "payPerProperty", "collectFromPlayers", "repairFree"],
    targetDisposition: "excluded",
    reason: "No frozen Chance card selects these effect variants.",
  },
  {
    name: "unreachable-community-effects",
    category: "card-effects",
    deck: "communityChest",
    effects: ["moveToNearest", "goToJail", "getOutOfJailFree", "payPerProperty"],
    targetDisposition: "excluded",
    reason: "No frozen Community Chest card selects these effect variants; they are not target no-ops.",
  },
]);

export const CARD_RULESET_AUTHORITY = deepFreeze({
  rulesetVersion: RULESET_VERSION,
  evidence: "frozen-rust-source-with-approved-divergence",
  sourcePath: "programs/panda-monopoly/src/constants.rs",
  sourceSha256: LEGACY_CONSTANTS_SHA256,
  chanceCardCount: 5,
  communityChestCardCount: 5,
});
