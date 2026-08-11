import type { MatchCash } from "../model/money";
import { checkedAddMatchCash, checkedSubtractMatchCash, MAX_MATCH_CASH } from "../model/money";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import { isValidPropertyStates, type PropertyState } from "./property-rules";

export type TradeTerms =
  | { readonly tradeType: "moneyOnly"; readonly offeredCash: MatchCash; readonly requestedCash: MatchCash }
  | {
      readonly tradeType: "propertyOnly";
      readonly offeredPropertyPosition: number | null;
      readonly requestedPropertyPosition: number | null;
    }
  | { readonly tradeType: "moneyForProperty"; readonly offeredCash: MatchCash; readonly requestedPropertyPosition: number }
  | { readonly tradeType: "propertyForMoney"; readonly offeredPropertyPosition: number; readonly requestedCash: MatchCash };

export interface TradePlayerState {
  readonly seatIndex: number;
  readonly cash: MatchCash;
}

export interface PendingTrade {
  readonly tradeId: string;
  readonly proposerSeatIndex: number;
  readonly receiverSeatIndex: number;
  readonly terms: TradeTerms;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export type TradeRuleErrorCode =
  | "INVALID_TRADE_STATE"
  | "INVALID_TRADE"
  | "TRADE_ID_CONFLICT"
  | "TOO_MANY_ACTIVE_TRADES"
  | "INSUFFICIENT_CASH"
  | "PROPERTY_NOT_OWNED"
  | "PROPERTY_MORTGAGED"
  | "TRADE_NOT_FOUND"
  | "TRADE_EXPIRED"
  | "NOT_TRADE_TARGET"
  | "NOT_TRADE_PROPOSER"
  | "ARITHMETIC_OVERFLOW";

export type TradeMutationResult =
  | {
      readonly ok: true;
      readonly trades: readonly PendingTrade[];
      readonly players: readonly (TradePlayerState | null)[];
      readonly properties: readonly PropertyState[];
      readonly trade: PendingTrade | null;
      readonly removedTradeIds: readonly string[];
    }
  | { readonly ok: false; readonly code: TradeRuleErrorCode };

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function isCash(value: unknown): value is MatchCash {
  return typeof value === "bigint" && value >= 0n && value <= MAX_MATCH_CASH;
}

function isPosition(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < 40;
}

function isSeatIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < 4;
}

function isPlainObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cashTerms(terms: TradeTerms): readonly [MatchCash, MatchCash] {
  if (terms.tradeType === "moneyOnly") return [terms.offeredCash, terms.requestedCash];
  if (terms.tradeType === "moneyForProperty") return [terms.offeredCash, 0n as MatchCash];
  if (terms.tradeType === "propertyForMoney") return [0n as MatchCash, terms.requestedCash];
  return [0n as MatchCash, 0n as MatchCash];
}

function propertyTerms(terms: TradeTerms): readonly [number | null, number | null] {
  if (terms.tradeType === "propertyOnly") return [terms.offeredPropertyPosition, terms.requestedPropertyPosition];
  if (terms.tradeType === "moneyForProperty") return [null, terms.requestedPropertyPosition];
  if (terms.tradeType === "propertyForMoney") return [terms.offeredPropertyPosition, null];
  return [null, null];
}

function hasExactOwnKeys(value: object, expectedKeys: readonly string[]): boolean {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key));
}

function validTerms(terms: TradeTerms): boolean {
  if (typeof terms !== "object" || terms === null || !("tradeType" in terms)) return false;
  if (terms.tradeType === "moneyOnly") {
    return (
      hasExactOwnKeys(terms, ["tradeType", "offeredCash", "requestedCash"]) &&
      isCash(terms.offeredCash) &&
      isCash(terms.requestedCash) &&
      (terms.offeredCash > 0n || terms.requestedCash > 0n)
    );
  }
  if (terms.tradeType === "propertyOnly") {
    const offered = terms.offeredPropertyPosition;
    const requested = terms.requestedPropertyPosition;
    return (
      hasExactOwnKeys(terms, ["tradeType", "offeredPropertyPosition", "requestedPropertyPosition"]) &&
      (offered === null || isPosition(offered)) &&
      (requested === null || isPosition(requested)) &&
      (offered !== null || requested !== null) &&
      offered !== requested
    );
  }
  if (terms.tradeType === "moneyForProperty") {
    return (
      hasExactOwnKeys(terms, ["tradeType", "offeredCash", "requestedPropertyPosition"]) &&
      isCash(terms.offeredCash) &&
      terms.offeredCash > 0n &&
      isPosition(terms.requestedPropertyPosition)
    );
  }
  if (terms.tradeType === "propertyForMoney") {
    return (
      hasExactOwnKeys(terms, ["tradeType", "offeredPropertyPosition", "requestedCash"]) &&
      isPosition(terms.offeredPropertyPosition) &&
      isCash(terms.requestedCash) &&
      terms.requestedCash > 0n
    );
  }
  return false;
}

function validPendingTrade(trade: unknown): trade is PendingTrade {
  if (
    typeof trade !== "object" ||
    trade === null ||
    !isPlainObject(trade) ||
    !hasExactOwnKeys(trade, [
      "tradeId",
      "proposerSeatIndex",
      "receiverSeatIndex",
      "terms",
      "createdAtMs",
      "expiresAtMs",
    ])
  ) return false;
  const candidate = trade as PendingTrade;
  if (
    !isOpaqueId(candidate.tradeId) ||
    !isSeatIndex(candidate.proposerSeatIndex) ||
    !isSeatIndex(candidate.receiverSeatIndex) ||
    candidate.proposerSeatIndex === candidate.receiverSeatIndex ||
    !validTerms(candidate.terms) ||
    !Number.isSafeInteger(candidate.createdAtMs) ||
    candidate.createdAtMs < 0
  ) return false;
  const expectedExpiry = candidate.createdAtMs + GAMEPLAY_POLICY.tradeExpiryMs;
  return Number.isSafeInteger(expectedExpiry) && candidate.expiresAtMs === expectedExpiry;
}

function validState(
  trades: readonly PendingTrade[],
  players: readonly (TradePlayerState | null)[],
  properties: readonly PropertyState[],
): boolean {
  if (
    !Array.isArray(trades) ||
    !Array.isArray(players) ||
    !Array.isArray(properties) ||
    trades.length > GAMEPLAY_POLICY.maximumActiveTrades ||
    players.length !== 4 ||
    !Array.from(properties).every(isPlainObject) ||
    !isValidPropertyStates(properties)
  ) {
    return false;
  }
  const occupiedSeats = new Set<number>();
  for (const [index, player] of players.entries()) {
    if (player === null) continue;
    if (!isPlainObject(player) || player.seatIndex !== index || !isCash(player.cash)) return false;
    occupiedSeats.add(index);
  }
  if (properties.some((property) => property.ownerSeatIndex !== null && !occupiedSeats.has(property.ownerSeatIndex))) return false;
  const tradeIds = new Set<string>();
  return Array.from(trades).every((trade) => {
    if (
      !validPendingTrade(trade) ||
      tradeIds.has(trade.tradeId) ||
      !occupiedSeats.has(trade.proposerSeatIndex) ||
      !occupiedSeats.has(trade.receiverSeatIndex) ||
      trade.proposerSeatIndex === trade.receiverSeatIndex
    ) return false;
    tradeIds.add(trade.tradeId);
    return true;
  });
}

function validateProperty(
  properties: readonly PropertyState[],
  position: number | null,
  ownerSeatIndex: number,
): TradeRuleErrorCode | null {
  if (position === null) return null;
  const property = properties[position];
  if (property?.ownerSeatIndex !== ownerSeatIndex) return "PROPERTY_NOT_OWNED";
  return property.mortgaged ? "PROPERTY_MORTGAGED" : null;
}

export function cleanupExpiredTrades(
  trades: readonly PendingTrade[],
  nowMs: number,
): { readonly trades: readonly PendingTrade[]; readonly removedTradeIds: readonly string[] } | null {
  if (!Array.isArray(trades) || !Array.from(trades).every(validPendingTrade) || !Number.isSafeInteger(nowMs) || nowMs < 0) return null;
  return {
    trades: trades.filter((trade) => trade.expiresAtMs > nowMs),
    removedTradeIds: trades.filter((trade) => trade.expiresAtMs <= nowMs).map((trade) => trade.tradeId),
  };
}

export function createTrade(
  trades: readonly PendingTrade[],
  players: readonly (TradePlayerState | null)[],
  properties: readonly PropertyState[],
  tradeId: string,
  proposerSeatIndex: number,
  receiverSeatIndex: number,
  terms: TradeTerms,
  nowMs: number,
): TradeMutationResult {
  if (!validState(trades, players, properties) || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { ok: false, code: "INVALID_TRADE_STATE" };
  }
  if (
    !isOpaqueId(tradeId) ||
    !validTerms(terms) ||
    !isSeatIndex(proposerSeatIndex) ||
    !isSeatIndex(receiverSeatIndex) ||
    proposerSeatIndex === receiverSeatIndex
  ) {
    return { ok: false, code: "INVALID_TRADE" };
  }
  const proposer = players[proposerSeatIndex];
  const receiver = players[receiverSeatIndex];
  if (proposer === null || proposer === undefined || receiver === null || receiver === undefined) {
    return { ok: false, code: "INVALID_TRADE" };
  }
  const cleaned = cleanupExpiredTrades(trades, nowMs);
  if (cleaned === null) return { ok: false, code: "INVALID_TRADE_STATE" };
  if (trades.some((trade) => trade.tradeId === tradeId)) return { ok: false, code: "TRADE_ID_CONFLICT" };
  if (cleaned.trades.length >= GAMEPLAY_POLICY.maximumActiveTrades) return { ok: false, code: "TOO_MANY_ACTIVE_TRADES" };
  const [offeredCash] = cashTerms(terms);
  if (proposer.cash < offeredCash) return { ok: false, code: "INSUFFICIENT_CASH" };
  const [offeredProperty, requestedProperty] = propertyTerms(terms);
  const offeredError = validateProperty(properties, offeredProperty, proposerSeatIndex);
  if (offeredError !== null) return { ok: false, code: offeredError };
  const requestedError = validateProperty(properties, requestedProperty, receiverSeatIndex);
  if (requestedError !== null) return { ok: false, code: requestedError };
  const expiresAtMs = nowMs + GAMEPLAY_POLICY.tradeExpiryMs;
  if (!Number.isSafeInteger(expiresAtMs)) return { ok: false, code: "INVALID_TRADE_STATE" };
  const trade: PendingTrade = { tradeId, proposerSeatIndex, receiverSeatIndex, terms, createdAtMs: nowMs, expiresAtMs };
  return {
    ok: true,
    trades: [...cleaned.trades, trade],
    players,
    properties,
    trade,
    removedTradeIds: cleaned.removedTradeIds,
  };
}

export function acceptTrade(
  trades: readonly PendingTrade[],
  players: readonly (TradePlayerState | null)[],
  properties: readonly PropertyState[],
  tradeId: string,
  actorSeatIndex: number,
  nowMs: number,
): TradeMutationResult {
  if (!validState(trades, players, properties) || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { ok: false, code: "INVALID_TRADE_STATE" };
  }
  if (!isOpaqueId(tradeId) || !isSeatIndex(actorSeatIndex)) return { ok: false, code: "INVALID_TRADE" };
  const trade = trades.find((candidate) => candidate.tradeId === tradeId);
  if (trade === undefined) return { ok: false, code: "TRADE_NOT_FOUND" };
  if (trade.receiverSeatIndex !== actorSeatIndex) return { ok: false, code: "NOT_TRADE_TARGET" };
  if (trade.expiresAtMs <= nowMs) return { ok: false, code: "TRADE_EXPIRED" };
  const proposer = players[trade.proposerSeatIndex];
  const receiver = players[trade.receiverSeatIndex];
  if (proposer === null || proposer === undefined || receiver === null || receiver === undefined) {
    return { ok: false, code: "INVALID_TRADE_STATE" };
  }
  const [offeredCash, requestedCash] = cashTerms(trade.terms);
  const proposerAfterDebit = checkedSubtractMatchCash(proposer.cash, offeredCash);
  const receiverAfterDebit = checkedSubtractMatchCash(receiver.cash, requestedCash);
  if (proposerAfterDebit === null || receiverAfterDebit === null) return { ok: false, code: "INSUFFICIENT_CASH" };
  const receiverCash = checkedAddMatchCash(receiverAfterDebit, offeredCash);
  const proposerCash = checkedAddMatchCash(proposerAfterDebit, requestedCash);
  if (receiverCash === null || proposerCash === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
  const [offeredProperty, requestedProperty] = propertyTerms(trade.terms);
  const offeredError = validateProperty(properties, offeredProperty, trade.proposerSeatIndex);
  if (offeredError !== null) return { ok: false, code: offeredError };
  const requestedError = validateProperty(properties, requestedProperty, trade.receiverSeatIndex);
  if (requestedError !== null) return { ok: false, code: requestedError };
  const nextPlayers = players.map((player, index) => {
    if (player === null) return null;
    if (index === trade.proposerSeatIndex) return { ...player, cash: proposerCash };
    if (index === trade.receiverSeatIndex) return { ...player, cash: receiverCash };
    return player;
  });
  const nextProperties = properties.map((property) => {
    if (property.position === offeredProperty) return { ...property, ownerSeatIndex: trade.receiverSeatIndex };
    if (property.position === requestedProperty) return { ...property, ownerSeatIndex: trade.proposerSeatIndex };
    return property;
  });
  return {
    ok: true,
    trades: trades.filter((candidate) => candidate.tradeId !== tradeId),
    players: nextPlayers,
    properties: nextProperties,
    trade,
    removedTradeIds: [tradeId],
  };
}

function removeTrade(
  trades: readonly PendingTrade[],
  players: readonly (TradePlayerState | null)[],
  properties: readonly PropertyState[],
  tradeId: string,
  actorSeatIndex: number,
  nowMs: number,
  actorRole: "receiver" | "proposer",
): TradeMutationResult {
  if (!validState(trades, players, properties)) return { ok: false, code: "INVALID_TRADE_STATE" };
  if (!isOpaqueId(tradeId) || !isSeatIndex(actorSeatIndex)) return { ok: false, code: "INVALID_TRADE" };
  const cleaned = cleanupExpiredTrades(trades, nowMs);
  if (cleaned === null) return { ok: false, code: "INVALID_TRADE_STATE" };
  const trade = cleaned.trades.find((candidate) => candidate.tradeId === tradeId);
  if (trade === undefined) return { ok: false, code: "TRADE_NOT_FOUND" };
  if (actorRole === "receiver" && trade.receiverSeatIndex !== actorSeatIndex) return { ok: false, code: "NOT_TRADE_TARGET" };
  if (actorRole === "proposer" && trade.proposerSeatIndex !== actorSeatIndex) return { ok: false, code: "NOT_TRADE_PROPOSER" };
  return {
    ok: true,
    trades: cleaned.trades.filter((candidate) => candidate.tradeId !== tradeId),
    players,
    properties,
    trade,
    removedTradeIds: [...cleaned.removedTradeIds, tradeId],
  };
}

export function rejectTrade(
  trades: readonly PendingTrade[], players: readonly (TradePlayerState | null)[], properties: readonly PropertyState[],
  tradeId: string, actorSeatIndex: number, nowMs: number,
): TradeMutationResult {
  return removeTrade(trades, players, properties, tradeId, actorSeatIndex, nowMs, "receiver");
}

export function cancelTrade(
  trades: readonly PendingTrade[], players: readonly (TradePlayerState | null)[], properties: readonly PropertyState[],
  tradeId: string, actorSeatIndex: number, nowMs: number,
): TradeMutationResult {
  return removeTrade(trades, players, properties, tradeId, actorSeatIndex, nowMs, "proposer");
}
