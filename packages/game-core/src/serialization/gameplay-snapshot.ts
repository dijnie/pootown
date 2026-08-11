import { SnapshotError } from "../errors";
import {
  GAMEPLAY_AGGREGATE_SCHEMA_VERSION,
  isValidActiveGameplayAggregateState,
  isValidFinishedGameplayAggregateState,
  type ActiveGameplayAggregateTurn,
  type GameplayAggregateState,
  type GameplayPlayerState,
} from "../model/gameplay-aggregate-state";
import { MAX_STATE_VERSION } from "../model/game-state";
import { gameId, playerId } from "../model/identifiers";
import { matchCash, MAX_MATCH_CASH, type MatchCash } from "../model/money";
import type { RandomCheckpoint } from "../ports/random-source";
import { GAMEPLAY_POLICY, GAMEPLAY_RULESET_ID } from "../rules/gameplay-policy";
import type { DiceRoll } from "../rules/movement";
import type { PropertyState } from "../rules/property-rules";
import type { TerminalOutcome } from "../rules/terminal-rules";
import type { PendingTrade, TradeTerms } from "../rules/trade-rules";

interface GameplaySnapshotEnvelope {
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly state: unknown;
  readonly checksum: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SnapshotError(`${label} must be an object`);
  return value;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new SnapshotError(`${label} has unknown or missing fields`);
  }
}

function integer(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new SnapshotError(`${label} must be a safe integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function nullableInteger(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
  return value === null ? null : integer(value, label, minimum, maximum);
}

function cash(value: unknown, label: string): MatchCash {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value)) {
    throw new SnapshotError(`${label} must be a canonical unsigned decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_MATCH_CASH) throw new SnapshotError(`${label} exceeds match cash limits`);
  return matchCash(parsed);
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new SnapshotError(`${label} must be a bounded string`);
  }
  return value;
}

function opaqueIdentifier(value: unknown, label: string): string {
  const identifier = text(value, label, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(identifier)) {
    throw new SnapshotError(`${label} must be a valid opaque identifier`);
  }
  return identifier;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new SnapshotError(`${label} must be boolean`);
  return value;
}

function serializeValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (Array.isArray(value)) return value.map(serializeValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]));
  }
  return value;
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalStringify(entry)}`).join(",")}}`;
}

function checksum(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of canonicalStringify(value)) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function hydratePlayer(value: unknown, index: number): GameplayPlayerState | null {
  if (value === null) return null;
  const player = record(value, `players[${index}]`);
  exactKeys(player, [
    "seatIndex", "playerId", "status", "cash", "position", "inJail", "jailTurns",
    "consecutiveDoubles", "missedTurns", "getOutOfJailCards", "joinedAtMs",
  ], `players[${index}]`);
  if (player.status !== "active" && player.status !== "eliminated") {
    throw new SnapshotError(`players[${index}].status is invalid`);
  }
  return {
    seatIndex: integer(player.seatIndex, `players[${index}].seatIndex`, 0, 3),
    playerId: playerId(opaqueIdentifier(player.playerId, `players[${index}].playerId`)),
    status: player.status,
    cash: cash(player.cash, `players[${index}].cash`),
    position: integer(player.position, `players[${index}].position`, 0, 39),
    inJail: boolean(player.inJail, `players[${index}].inJail`),
    jailTurns: integer(player.jailTurns, `players[${index}].jailTurns`, 0, 3),
    consecutiveDoubles: integer(player.consecutiveDoubles, `players[${index}].consecutiveDoubles`, 0, 2),
    missedTurns: integer(player.missedTurns, `players[${index}].missedTurns`, 0, 3),
    getOutOfJailCards: integer(player.getOutOfJailCards, `players[${index}].getOutOfJailCards`, 0, 255),
    joinedAtMs: integer(player.joinedAtMs, `players[${index}].joinedAtMs`),
  };
}

function hydrateProperty(value: unknown, index: number): PropertyState {
  const property = record(value, `properties[${index}]`);
  exactKeys(property, ["position", "ownerSeatIndex", "houses", "hasHotel", "mortgaged"], `properties[${index}]`);
  return {
    position: integer(property.position, `properties[${index}].position`, 0, 39),
    ownerSeatIndex: nullableInteger(property.ownerSeatIndex, `properties[${index}].ownerSeatIndex`, 0, 3),
    houses: integer(property.houses, `properties[${index}].houses`, 0, 4),
    hasHotel: boolean(property.hasHotel, `properties[${index}].hasHotel`),
    mortgaged: boolean(property.mortgaged, `properties[${index}].mortgaged`),
  };
}

function hydrateTerms(value: unknown, label: string): TradeTerms {
  const terms = record(value, label);
  if (terms.tradeType === "moneyOnly") {
    exactKeys(terms, ["tradeType", "offeredCash", "requestedCash"], label);
    return { tradeType: "moneyOnly", offeredCash: cash(terms.offeredCash, `${label}.offeredCash`), requestedCash: cash(terms.requestedCash, `${label}.requestedCash`) };
  }
  if (terms.tradeType === "propertyOnly") {
    exactKeys(terms, ["tradeType", "offeredPropertyPosition", "requestedPropertyPosition"], label);
    return {
      tradeType: "propertyOnly",
      offeredPropertyPosition: nullableInteger(terms.offeredPropertyPosition, `${label}.offeredPropertyPosition`, 0, 39),
      requestedPropertyPosition: nullableInteger(terms.requestedPropertyPosition, `${label}.requestedPropertyPosition`, 0, 39),
    };
  }
  if (terms.tradeType === "moneyForProperty") {
    exactKeys(terms, ["tradeType", "offeredCash", "requestedPropertyPosition"], label);
    return { tradeType: "moneyForProperty", offeredCash: cash(terms.offeredCash, `${label}.offeredCash`), requestedPropertyPosition: integer(terms.requestedPropertyPosition, `${label}.requestedPropertyPosition`, 0, 39) };
  }
  if (terms.tradeType === "propertyForMoney") {
    exactKeys(terms, ["tradeType", "offeredPropertyPosition", "requestedCash"], label);
    return { tradeType: "propertyForMoney", offeredPropertyPosition: integer(terms.offeredPropertyPosition, `${label}.offeredPropertyPosition`, 0, 39), requestedCash: cash(terms.requestedCash, `${label}.requestedCash`) };
  }
  throw new SnapshotError(`${label}.tradeType is invalid`);
}

function hydrateTrade(value: unknown, index: number): PendingTrade {
  const label = `activeTrades[${index}]`;
  const trade = record(value, label);
  exactKeys(trade, ["tradeId", "proposerSeatIndex", "receiverSeatIndex", "terms", "createdAtMs", "expiresAtMs"], label);
  return {
    tradeId: opaqueIdentifier(trade.tradeId, `${label}.tradeId`),
    proposerSeatIndex: integer(trade.proposerSeatIndex, `${label}.proposerSeatIndex`, 0, 3),
    receiverSeatIndex: integer(trade.receiverSeatIndex, `${label}.receiverSeatIndex`, 0, 3),
    terms: hydrateTerms(trade.terms, `${label}.terms`),
    createdAtMs: integer(trade.createdAtMs, `${label}.createdAtMs`),
    expiresAtMs: integer(trade.expiresAtMs, `${label}.expiresAtMs`),
  };
}

function hydrateDice(value: unknown): DiceRoll | null {
  if (value === null) return null;
  const dice = record(value, "lastDice");
  exactKeys(dice, ["dice", "total", "isDoubles"], "lastDice");
  if (!Array.isArray(dice.dice) || dice.dice.length !== 2) throw new SnapshotError("lastDice.dice must contain two dice");
  return {
    dice: [integer(dice.dice[0], "lastDice.dice[0]", 1, 6), integer(dice.dice[1], "lastDice.dice[1]", 1, 6)],
    total: integer(dice.total, "lastDice.total", 2, 12),
    isDoubles: boolean(dice.isDoubles, "lastDice.isDoubles"),
  };
}

function hydrateRng(value: unknown): RandomCheckpoint {
  const rng = record(value, "rng");
  exactKeys(rng, ["algorithm", "state", "draws", "bytesConsumed"], "rng");
  return {
    algorithm: text(rng.algorithm, "rng.algorithm", 64),
    state: text(rng.state, "rng.state", 4_096),
    draws: integer(rng.draws, "rng.draws"),
    bytesConsumed: integer(rng.bytesConsumed, "rng.bytesConsumed"),
  };
}

function hydrateTurn(value: unknown, lifecycle: unknown): ActiveGameplayAggregateTurn | { readonly phase: "finished" } {
  const turn = record(value, "turn");
  if (lifecycle === "finished") {
    exactKeys(turn, ["phase"], "turn");
    if (turn.phase !== "finished") throw new SnapshotError("finished turn phase is invalid");
    return { phase: "finished" };
  }
  if (typeof turn.phase !== "string") throw new SnapshotError("turn phase is invalid");
  const baseKeys = ["phase", "currentSeatIndex", "startedAtMs", "deadlineAtMs", "emittedWarnings"];
  const payloadKey = turn.phase === "awaitingPropertyDecision" || turn.phase === "awaitingRentPayment"
    ? "propertyPosition"
    : turn.phase === "awaitingCardDraw"
      ? "deck"
      : turn.phase === "awaitingTaxPayment"
        ? "taxKind"
        : null;
  exactKeys(turn, payloadKey === null ? baseKeys : [...baseKeys, payloadKey], "turn");
  if (!Array.isArray(turn.emittedWarnings)) throw new SnapshotError("turn.emittedWarnings must be an array");
  const clock = {
    currentSeatIndex: integer(turn.currentSeatIndex, "turn.currentSeatIndex", 0, 3),
    startedAtMs: integer(turn.startedAtMs, "turn.startedAtMs"),
    deadlineAtMs: integer(turn.deadlineAtMs, "turn.deadlineAtMs"),
    emittedWarnings: turn.emittedWarnings.map((warning, index) => {
      if (warning !== 30 && warning !== 10) throw new SnapshotError(`turn.emittedWarnings[${index}] is invalid`);
      return warning;
    }),
  };
  if (turn.phase === "awaitingPropertyDecision" || turn.phase === "awaitingRentPayment") {
    return { ...clock, phase: turn.phase, propertyPosition: integer(turn.propertyPosition, "turn.propertyPosition", 0, 39) };
  }
  if (turn.phase === "awaitingCardDraw") {
    if (turn.deck !== "chance" && turn.deck !== "communityChest") throw new SnapshotError("turn.deck is invalid");
    return { ...clock, phase: "awaitingCardDraw", deck: turn.deck };
  }
  if (turn.phase === "awaitingTaxPayment") {
    if (turn.taxKind !== "mev" && turn.taxKind !== "priorityFee") throw new SnapshotError("turn.taxKind is invalid");
    return { ...clock, phase: "awaitingTaxPayment", taxKind: turn.taxKind };
  }
  if (turn.phase === "awaitingRoll" || turn.phase === "awaitingBankruptcy" || turn.phase === "awaitingEndTurn") {
    return { ...clock, phase: turn.phase };
  }
  throw new SnapshotError("turn phase is invalid");
}

function hydrateTerminal(value: unknown): TerminalOutcome | null {
  if (value === null) return null;
  const terminal = record(value, "terminal");
  exactKeys(terminal, ["reason", "winnerSeatIndex", "endedAtMs", "ranking", "settlementEntitlement"], "terminal");
  if (!["lastPlayerStanding", "timeLimit", "timeoutForfeit"].includes(terminal.reason as string)) {
    throw new SnapshotError("terminal.reason is invalid");
  }
  if (!Array.isArray(terminal.ranking)) throw new SnapshotError("terminal.ranking must be an array");
  const ranking = terminal.ranking.map((value, index) => {
    const entry = record(value, `terminal.ranking[${index}]`);
    exactKeys(entry, ["rank", "seatIndex", "netWorth"], `terminal.ranking[${index}]`);
    return {
      rank: integer(entry.rank, `terminal.ranking[${index}].rank`, 1, 4),
      seatIndex: integer(entry.seatIndex, `terminal.ranking[${index}].seatIndex`, 0, 3),
      netWorth: cash(entry.netWorth, `terminal.ranking[${index}].netWorth`),
    };
  });
  const entitlement = record(terminal.settlementEntitlement, "terminal.settlementEntitlement");
  exactKeys(entitlement, ["winnerSeatIndex", "status"], "terminal.settlementEntitlement");
  if (entitlement.status !== "pending") throw new SnapshotError("terminal entitlement status is invalid");
  return {
    reason: terminal.reason as TerminalOutcome["reason"],
    winnerSeatIndex: integer(terminal.winnerSeatIndex, "terminal.winnerSeatIndex", 0, 3),
    endedAtMs: integer(terminal.endedAtMs, "terminal.endedAtMs"),
    ranking,
    settlementEntitlement: {
      winnerSeatIndex: integer(entitlement.winnerSeatIndex, "terminal.settlementEntitlement.winnerSeatIndex", 0, 3),
      status: "pending",
    },
  };
}

function hydrateGameplayState(value: unknown): GameplayAggregateState {
  const state = record(value, "state");
  exactKeys(state, [
    "schemaVersion", "stateVersion", "gameId", "rulesetId", "lifecycle", "players", "properties",
    "bankCash", "freeParkingPool", "housesRemaining", "hotelsRemaining", "startedAtMs", "gameEndAtMs",
    "turn", "bankruptcyRequiredSeatIndex", "activeTrades", "lastDice", "terminal", "rng",
  ], "state");
  if (state.schemaVersion !== GAMEPLAY_AGGREGATE_SCHEMA_VERSION) throw new SnapshotError("unsupported gameplay aggregate schema version");
  if (state.rulesetId !== GAMEPLAY_RULESET_ID) throw new SnapshotError("unsupported gameplay ruleset");
  if (state.lifecycle !== "inProgress" && state.lifecycle !== "finished") throw new SnapshotError("gameplay lifecycle is invalid");
  if (!Array.isArray(state.players) || state.players.length !== GAMEPLAY_POLICY.maximumPlayers) {
    throw new SnapshotError("gameplay snapshot must contain exactly four player slots");
  }
  if (!Array.isArray(state.properties) || state.properties.length !== 40) {
    throw new SnapshotError("gameplay snapshot must contain exactly forty property states");
  }
  if (!Array.isArray(state.activeTrades)) throw new SnapshotError("activeTrades must be an array");
  const common = {
    schemaVersion: GAMEPLAY_AGGREGATE_SCHEMA_VERSION,
    stateVersion: integer(state.stateVersion, "stateVersion", 1, MAX_STATE_VERSION),
    gameId: gameId(opaqueIdentifier(state.gameId, "gameId")),
    rulesetId: GAMEPLAY_RULESET_ID,
    players: state.players.map(hydratePlayer),
    properties: state.properties.map(hydrateProperty),
    bankCash: cash(state.bankCash, "bankCash"),
    freeParkingPool: cash(state.freeParkingPool, "freeParkingPool"),
    housesRemaining: integer(state.housesRemaining, "housesRemaining", 0, 32),
    hotelsRemaining: integer(state.hotelsRemaining, "hotelsRemaining", 0, 12),
    startedAtMs: integer(state.startedAtMs, "startedAtMs"),
    gameEndAtMs: nullableInteger(state.gameEndAtMs, "gameEndAtMs"),
    activeTrades: state.activeTrades.map(hydrateTrade),
    lastDice: hydrateDice(state.lastDice),
    rng: hydrateRng(state.rng),
  };
  const turn = hydrateTurn(state.turn, state.lifecycle);
  const terminal = hydrateTerminal(state.terminal);
  const candidate = state.lifecycle === "inProgress"
    ? {
        ...common,
        lifecycle: "inProgress" as const,
        turn: turn as ActiveGameplayAggregateTurn,
        bankruptcyRequiredSeatIndex: nullableInteger(state.bankruptcyRequiredSeatIndex, "bankruptcyRequiredSeatIndex", 0, 3),
        terminal,
      }
    : {
        ...common,
        lifecycle: "finished" as const,
        turn: turn as { readonly phase: "finished" },
        bankruptcyRequiredSeatIndex: nullableInteger(state.bankruptcyRequiredSeatIndex, "bankruptcyRequiredSeatIndex", 0, 3),
        terminal: terminal as TerminalOutcome,
      };
  if (candidate.lifecycle === "inProgress") {
    if (!isValidActiveGameplayAggregateState(candidate)) throw new SnapshotError("gameplay aggregate invariants are invalid");
  } else if (!isValidFinishedGameplayAggregateState(candidate)) {
    throw new SnapshotError("finished gameplay aggregate invariants are invalid");
  }
  return deepFreeze(candidate) as GameplayAggregateState;
}

/** Serializes a complete active or terminal gameplay checkpoint with an integrity checksum. */
export function serializeGameplaySnapshot(state: GameplayAggregateState): string {
  const serializedState = serializeValue(state);
  hydrateGameplayState(serializedState);
  const signed = {
    schemaVersion: GAMEPLAY_AGGREGATE_SCHEMA_VERSION,
    stateVersion: state.stateVersion,
    state: serializedState,
  };
  return JSON.stringify({ ...signed, checksum: checksum(signed) });
}

/** Parses and deeply freezes a strict complete gameplay checkpoint. */
export function parseGameplaySnapshot(serialized: string): GameplayAggregateState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new SnapshotError("gameplay snapshot is not valid JSON");
  }
  const envelope = record(parsed, "gameplay snapshot") as unknown as GameplaySnapshotEnvelope;
  exactKeys(envelope as unknown as Record<string, unknown>, ["schemaVersion", "stateVersion", "state", "checksum"], "gameplay snapshot");
  if (envelope.schemaVersion !== GAMEPLAY_AGGREGATE_SCHEMA_VERSION) {
    throw new SnapshotError("unsupported gameplay snapshot schema version");
  }
  const stateVersion = integer(envelope.stateVersion, "gameplay snapshot stateVersion", 1, MAX_STATE_VERSION);
  const expectedChecksum = checksum({ schemaVersion: envelope.schemaVersion, stateVersion, state: envelope.state });
  if (envelope.checksum !== expectedChecksum) throw new SnapshotError("gameplay snapshot checksum mismatch");
  const state = hydrateGameplayState(envelope.state);
  if (state.stateVersion !== stateVersion) throw new SnapshotError("gameplay snapshot revision mismatch");
  return state;
}
