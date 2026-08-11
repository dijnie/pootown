import type { MatchCash } from "../model/money";
import { checkedAddMatchCash, matchCash, MAX_MATCH_CASH } from "../model/money";
import {
  isVerifiedBankruptcyResolution,
  type BankruptcyResolutionResult,
} from "./bankruptcy-rules";
import { BOARD_SPACES } from "./board-definition";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import { isValidPropertyStates, type PropertyState } from "./property-rules";

export type TerminalEndReason = "lastPlayerStanding" | "timeLimit" | "manual" | "timeoutForfeit";

export interface TerminalPlayerState {
  readonly seatIndex: number;
  readonly status: "active" | "eliminated";
  readonly cash: MatchCash;
}

export interface TerminalRankingEntry {
  readonly rank: number;
  readonly seatIndex: number;
  readonly netWorth: MatchCash;
}

export interface TerminalOutcome {
  readonly reason: TerminalEndReason;
  readonly winnerSeatIndex: number;
  readonly endedAtMs: number;
  readonly ranking: readonly TerminalRankingEntry[];
  readonly settlementEntitlement: {
    readonly winnerSeatIndex: number;
    readonly status: "pending";
  };
}

export type TerminalRuleErrorCode =
  | "INVALID_TERMINAL_STATE"
  | "NO_ACTIVE_PLAYERS"
  | "END_CONDITION_NOT_MET"
  | "ARITHMETIC_OVERFLOW";

export type TerminalOutcomeResult =
  | { readonly ok: true; readonly terminal: TerminalOutcome }
  | { readonly ok: false; readonly code: TerminalRuleErrorCode };

function isPlainObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactOwnKeys(value: object, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key));
}

function validPlayer(player: TerminalPlayerState): boolean {
  return (
    isPlainObject(player) &&
    Number.isInteger(player.seatIndex) &&
    player.seatIndex >= 0 &&
    player.seatIndex < GAMEPLAY_POLICY.maximumPlayers &&
    (player.status === "active" || player.status === "eliminated") &&
    typeof player.cash === "bigint" &&
    player.cash >= 0n &&
    player.cash <= MAX_MATCH_CASH &&
    (player.status === "active" || player.cash === 0n)
  );
}

function validState(
  players: readonly (TerminalPlayerState | null)[],
  properties: readonly PropertyState[],
): boolean {
  if (
    !Array.isArray(players) ||
    players.length !== GAMEPLAY_POLICY.maximumPlayers ||
    !Array.isArray(properties) ||
    !isValidPropertyStates(properties)
  ) return false;
  const activeSeats = new Set<number>();
  for (const [index, player] of players.entries()) {
    if (player === null) continue;
    if (
      !validPlayer(player) ||
      player.seatIndex !== index ||
      (player.status === "eliminated" && player.cash !== 0n)
    ) return false;
    if (player.status === "active") activeSeats.add(index);
  }
  return properties.every(
    (property) => property.ownerSeatIndex === null || activeSeats.has(property.ownerSeatIndex),
  );
}

export function calculatePlayerNetWorth(
  player: TerminalPlayerState,
  properties: readonly PropertyState[],
): MatchCash | null {
  if (!validPlayer(player)) return null;
  if (!isValidPropertyStates(properties)) return null;
  if (
    player.status === "eliminated" &&
    properties.some((property) => property.ownerSeatIndex === player.seatIndex)
  ) return null;
  let netWorth = player.cash;
  for (const property of properties) {
    if (property.ownerSeatIndex !== player.seatIndex) continue;
    const definition = BOARD_SPACES[property.position];
    if (definition === undefined) return null;
    const propertyValue = property.mortgaged
      ? (BigInt(definition.mortgageValue) * 9n) / 10n
      : BigInt(definition.mortgageValue);
    const buildingValue = property.hasHotel
      ? BigInt(definition.houseCost) * 5n
      : BigInt(definition.houseCost) * BigInt(property.houses);
    const afterProperty = checkedAddMatchCash(netWorth, matchCash(propertyValue));
    if (afterProperty === null) return null;
    const afterBuildings = checkedAddMatchCash(afterProperty, matchCash(buildingValue));
    if (afterBuildings === null) return null;
    netWorth = afterBuildings;
  }
  return netWorth;
}

function deriveRankedTerminalOutcome(
  players: readonly (TerminalPlayerState | null)[],
  properties: readonly PropertyState[],
  reason: "lastPlayerStanding" | "timeLimit",
  endedAtMs: number,
): TerminalOutcomeResult {
  if (
    !validState(players, properties) ||
    !Number.isSafeInteger(endedAtMs) ||
    endedAtMs < 0
  ) return { ok: false, code: "INVALID_TERMINAL_STATE" };
  const activePlayers = players.filter(
    (player): player is TerminalPlayerState => player !== null && player.status === "active",
  );
  if (activePlayers.length === 0) return { ok: false, code: "NO_ACTIVE_PLAYERS" };
  if (reason === "lastPlayerStanding" && activePlayers.length !== 1) {
    return { ok: false, code: "END_CONDITION_NOT_MET" };
  }
  const ranked: { readonly seatIndex: number; readonly netWorth: MatchCash }[] = [];
  for (const player of activePlayers) {
    const netWorth = calculatePlayerNetWorth(player, properties);
    if (netWorth === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
    ranked.push({ seatIndex: player.seatIndex, netWorth });
  }
  ranked.sort((left, right) => {
    if (left.netWorth > right.netWorth) return -1;
    if (left.netWorth < right.netWorth) return 1;
    return left.seatIndex - right.seatIndex;
  });
  const ranking = ranked.map((entry, index): TerminalRankingEntry => ({ ...entry, rank: index + 1 }));
  const winnerSeatIndex = ranking[0]!.seatIndex;
  return {
    ok: true,
    terminal: {
      reason,
      winnerSeatIndex,
      endedAtMs,
      ranking,
      settlementEntitlement: { winnerSeatIndex, status: "pending" },
    },
  };
}

export interface TimeLimitTerminalState {
  readonly players: readonly (TerminalPlayerState | null)[];
  readonly properties: readonly PropertyState[];
  readonly gameEndAtMs: number | null;
}

export function deriveTimeLimitTerminalOutcome(
  state: TimeLimitTerminalState,
  endedAtMs: number,
): TerminalOutcomeResult {
  if (
    !isPlainObject(state) ||
    !hasExactOwnKeys(state, ["players", "properties", "gameEndAtMs"]) ||
    !Number.isSafeInteger(state.gameEndAtMs) ||
    state.gameEndAtMs === null ||
    state.gameEndAtMs < 0
  ) return { ok: false, code: "INVALID_TERMINAL_STATE" };
  if (!Number.isSafeInteger(endedAtMs) || endedAtMs < 0) {
    return { ok: false, code: "INVALID_TERMINAL_STATE" };
  }
  if (endedAtMs < state.gameEndAtMs) {
    return { ok: false, code: "END_CONDITION_NOT_MET" };
  }
  return deriveRankedTerminalOutcome(state.players, state.properties, "timeLimit", endedAtMs);
}

export function deriveBankruptcyTerminalOutcome(
  resolution: BankruptcyResolutionResult,
  endedAtMs: number,
): TerminalOutcomeResult {
  if (!isVerifiedBankruptcyResolution(resolution)) {
    return { ok: false, code: "INVALID_TERMINAL_STATE" };
  }
  if (!resolution.endConditionMet || resolution.winnerSeatIndex === null) {
    return { ok: false, code: "END_CONDITION_NOT_MET" };
  }
  const activePlayers = resolution.players.filter((player) => player?.status === "active");
  if (
    activePlayers.length !== 1 ||
    activePlayers[0]?.seatIndex !== resolution.winnerSeatIndex
  ) return { ok: false, code: "INVALID_TERMINAL_STATE" };
  return deriveRankedTerminalOutcome(
    resolution.players,
    resolution.properties,
    "lastPlayerStanding",
    endedAtMs,
  );
}
