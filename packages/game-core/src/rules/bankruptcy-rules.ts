import type { MatchCash } from "../model/money";
import { checkedAddMatchCash, matchCash, MAX_MATCH_CASH } from "../model/money";
import { BOARD_SPACES } from "./board-definition";
import { isValidBuildingInventory, type BuildingInventory } from "./building-rules";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import { isValidPropertyStates, type PropertyState } from "./property-rules";

const verifiedBankruptcyResolutions = new WeakSet<object>();

export interface BankruptcyPlayerState {
  readonly seatIndex: number;
  readonly status: "active" | "eliminated";
  readonly cash: MatchCash;
  readonly position: number;
  readonly inJail: boolean;
  readonly jailTurns: number;
  readonly consecutiveDoubles: number;
  readonly missedTurns: number;
  readonly getOutOfJailCards: number;
}

export type BankruptcyRuleErrorCode =
  | "INVALID_BANKRUPTCY_STATE"
  | "PLAYER_NOT_ACTIVE"
  | "ARITHMETIC_OVERFLOW";

export type BankruptcyResolutionResult =
  | {
      readonly ok: true;
      readonly players: readonly (BankruptcyPlayerState | null)[];
      readonly properties: readonly PropertyState[];
      readonly inventory: BuildingInventory;
      readonly bankCash: MatchCash;
      readonly bankruptSeatIndex: number;
      readonly liquidationValue: MatchCash;
      readonly cashTransferred: MatchCash;
      readonly housesReturned: number;
      readonly hotelsReturned: number;
      readonly endConditionMet: boolean;
      readonly winnerSeatIndex: number | null;
    }
  | { readonly ok: false; readonly code: BankruptcyRuleErrorCode };

function isPlainObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export type SuccessfulBankruptcyResolution = Extract<BankruptcyResolutionResult, { readonly ok: true }>;

export function isVerifiedBankruptcyResolution(value: unknown): value is SuccessfulBankruptcyResolution {
  return isPlainObject(value) && verifiedBankruptcyResolutions.has(value as object);
}

function validPlayer(player: BankruptcyPlayerState, index: number): boolean {
  return (
    isPlainObject(player) &&
    player.seatIndex === index &&
    (player.status === "active" || player.status === "eliminated") &&
    typeof player.cash === "bigint" &&
    player.cash >= 0n &&
    player.cash <= MAX_MATCH_CASH &&
    Number.isInteger(player.position) &&
    player.position >= 0 &&
    player.position < GAMEPLAY_POLICY.boardSize &&
    typeof player.inJail === "boolean" &&
    Number.isInteger(player.jailTurns) &&
    player.jailTurns >= 0 &&
    player.jailTurns <= GAMEPLAY_POLICY.maximumJailTurns &&
    Number.isInteger(player.consecutiveDoubles) &&
    player.consecutiveDoubles >= 0 &&
    player.consecutiveDoubles <= 2 &&
    Number.isInteger(player.missedTurns) &&
    player.missedTurns >= 0 &&
    player.missedTurns <= GAMEPLAY_POLICY.maximumMissedTurns &&
    Number.isInteger(player.getOutOfJailCards) &&
    player.getOutOfJailCards >= 0 &&
    player.getOutOfJailCards <= 255 &&
    (player.inJail
      ? player.position === GAMEPLAY_POLICY.jailPosition && player.jailTurns <= 2 && player.consecutiveDoubles === 0
      : player.jailTurns === 0) &&
    (player.status === "active" ||
      (player.cash === 0n &&
        player.position === 0 &&
        !player.inJail &&
        player.jailTurns === 0 &&
        player.consecutiveDoubles === 0 &&
        player.getOutOfJailCards === 0))
  );
}

function validState(
  players: readonly (BankruptcyPlayerState | null)[],
  properties: readonly PropertyState[],
  inventory: BuildingInventory,
  bankCash: MatchCash,
): boolean {
  if (
    !Array.isArray(players) ||
    players.length !== GAMEPLAY_POLICY.maximumPlayers ||
    !Array.isArray(properties) ||
    !isPlainObject(inventory) ||
    typeof bankCash !== "bigint" ||
    bankCash < 0n ||
    bankCash > MAX_MATCH_CASH ||
    !isValidPropertyStates(properties) ||
    !isValidBuildingInventory(properties, inventory)
  ) return false;
  const activeSeats = new Set<number>();
  for (const [index, player] of players.entries()) {
    if (player === null) continue;
    if (!validPlayer(player, index)) return false;
    if (player.status === "active") activeSeats.add(index);
  }
  return properties.every(
    (property) => property.ownerSeatIndex === null || activeSeats.has(property.ownerSeatIndex),
  );
}

function add(value: MatchCash, amount: bigint): MatchCash | null {
  if (amount < 0n || amount > MAX_MATCH_CASH) return null;
  return checkedAddMatchCash(value, matchCash(amount));
}

export function resolveBankruptcy(
  players: readonly (BankruptcyPlayerState | null)[],
  properties: readonly PropertyState[],
  inventory: BuildingInventory,
  bankCash: MatchCash,
  bankruptSeatIndex: number,
): BankruptcyResolutionResult {
  if (
    !validState(players, properties, inventory, bankCash) ||
    !Number.isInteger(bankruptSeatIndex) ||
    bankruptSeatIndex < 0 ||
    bankruptSeatIndex >= GAMEPLAY_POLICY.maximumPlayers
  ) {
    return { ok: false, code: "INVALID_BANKRUPTCY_STATE" };
  }
  const bankruptPlayer = players[bankruptSeatIndex];
  if (bankruptPlayer === null || bankruptPlayer === undefined || bankruptPlayer.status !== "active") {
    return { ok: false, code: "PLAYER_NOT_ACTIVE" };
  }

  let liquidationValue = matchCash(0n);
  let housesReturned = 0;
  let hotelsReturned = 0;
  const nextProperties: PropertyState[] = [];
  for (const property of properties) {
    if (property.ownerSeatIndex !== bankruptSeatIndex) {
      nextProperties.push({ ...property });
      continue;
    }
    const definition = BOARD_SPACES[property.position];
    if (definition === undefined) return { ok: false, code: "INVALID_BANKRUPTCY_STATE" };
    const buildingValue = property.hasHotel
      ? (BigInt(definition.houseCost) * 5n) / 2n
      : (BigInt(definition.houseCost) / 2n) * BigInt(property.houses);
    const mortgageValue = property.mortgaged ? 0n : BigInt(definition.mortgageValue);
    const nextLiquidation = add(liquidationValue, buildingValue + mortgageValue);
    if (nextLiquidation === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
    liquidationValue = nextLiquidation;
    housesReturned += property.houses;
    hotelsReturned += property.hasHotel ? 1 : 0;
    nextProperties.push({
      ...property,
      ownerSeatIndex: null,
      houses: 0,
      hasHotel: false,
      mortgaged: false,
    });
  }

  const afterLiquidation = checkedAddMatchCash(bankCash, liquidationValue);
  const nextBankCash = afterLiquidation === null
    ? null
    : checkedAddMatchCash(afterLiquidation, bankruptPlayer.cash);
  if (nextBankCash === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
  const nextInventory: BuildingInventory = {
    housesRemaining: inventory.housesRemaining + housesReturned,
    hotelsRemaining: inventory.hotelsRemaining + hotelsReturned,
  };
  if (!isValidBuildingInventory(nextProperties, nextInventory)) {
    return { ok: false, code: "INVALID_BANKRUPTCY_STATE" };
  }
  const nextPlayers = players.map((player, index) => index !== bankruptSeatIndex || player === null
    ? (player === null ? null : { ...player })
    : {
        ...player,
        status: "eliminated" as const,
        cash: matchCash(0n),
        position: 0,
        inJail: false,
        jailTurns: 0,
        consecutiveDoubles: 0,
        getOutOfJailCards: 0,
      });
  const remainingActiveSeatIndexes = nextPlayers.flatMap((player) =>
    player?.status === "active" ? [player.seatIndex] : [],
  );
  const frozenPlayers = Object.freeze(nextPlayers.map((player) =>
    player === null ? null : Object.freeze(player),
  ));
  const frozenProperties = Object.freeze(nextProperties.map((property) => Object.freeze(property)));
  const frozenInventory = Object.freeze(nextInventory);
  const result: SuccessfulBankruptcyResolution = Object.freeze({
    ok: true,
    players: frozenPlayers,
    properties: frozenProperties,
    inventory: frozenInventory,
    bankCash: nextBankCash,
    bankruptSeatIndex,
    liquidationValue,
    cashTransferred: bankruptPlayer.cash,
    housesReturned,
    hotelsReturned,
    endConditionMet: remainingActiveSeatIndexes.length <= 1,
    winnerSeatIndex: remainingActiveSeatIndexes.length === 1 ? remainingActiveSeatIndexes[0]! : null,
  });
  verifiedBankruptcyResolutions.add(result);
  return result;
}
