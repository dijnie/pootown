import {
  GAME_SCHEMA_VERSION,
  MAX_STATE_VERSION,
  MAXIMUM_PLAYERS,
  MINIMUM_PLAYERS,
  STARTING_BANK_CASH,
  STARTING_MATCH_CASH,
  type InProgressGameState,
} from "./game-state";
import type { GameId, PlayerId } from "./identifiers";
import { MAX_MATCH_CASH, type MatchCash } from "./money";
import type { RandomCheckpoint } from "../ports/random-source";
import type { CardDeck } from "../rules/card-rules";
import { GAMEPLAY_POLICY, GAMEPLAY_RULESET_ID } from "../rules/gameplay-policy";
import { isValidBankruptcyState } from "../rules/bankruptcy-rules";
import { BOARD_SPACES } from "../rules/board-definition";
import { createPropertyStates, isValidPropertyStates, type PropertyState } from "../rules/property-rules";
import type { DiceRoll } from "../rules/movement";
import { cleanupExpiredTrades, type PendingTrade } from "../rules/trade-rules";
import { calculatePlayerNetWorth, type TerminalOutcome } from "../rules/terminal-rules";
import type { TimeoutWarningSeconds } from "../rules/timeout-rules";

export const GAMEPLAY_AGGREGATE_SCHEMA_VERSION = 1 as const;

export interface GameplayPlayerState {
  readonly seatIndex: number;
  readonly playerId: PlayerId;
  readonly status: "active" | "eliminated";
  readonly cash: MatchCash;
  readonly position: number;
  readonly inJail: boolean;
  readonly jailTurns: number;
  readonly consecutiveDoubles: number;
  readonly missedTurns: number;
  readonly getOutOfJailCards: number;
  readonly joinedAtMs: number;
}

interface ActiveTurnClock {
  readonly currentSeatIndex: number;
  readonly startedAtMs: number;
  readonly deadlineAtMs: number;
  readonly emittedWarnings: readonly TimeoutWarningSeconds[];
}

export type ActiveGameplayAggregateTurn =
  | ({ readonly phase: "awaitingRoll" } & ActiveTurnClock)
  | ({ readonly phase: "awaitingPropertyDecision"; readonly propertyPosition: number } & ActiveTurnClock)
  | ({ readonly phase: "awaitingRentPayment"; readonly propertyPosition: number } & ActiveTurnClock)
  | ({ readonly phase: "awaitingCardDraw"; readonly deck: CardDeck } & ActiveTurnClock)
  | ({ readonly phase: "awaitingTaxPayment"; readonly taxKind: "mev" | "priorityFee" } & ActiveTurnClock)
  | ({ readonly phase: "awaitingBankruptcy" } & ActiveTurnClock)
  | ({ readonly phase: "awaitingEndTurn" } & ActiveTurnClock);

export type GameplayAggregateTurn = ActiveGameplayAggregateTurn | { readonly phase: "finished" };

interface GameplayAggregateStateBase {
  readonly schemaVersion: typeof GAMEPLAY_AGGREGATE_SCHEMA_VERSION;
  readonly stateVersion: number;
  readonly gameId: GameId;
  readonly rulesetId: InProgressGameState["rulesetId"];
  readonly players: readonly (GameplayPlayerState | null)[];
  readonly properties: readonly PropertyState[];
  readonly bankCash: MatchCash;
  readonly freeParkingPool: MatchCash;
  readonly housesRemaining: number;
  readonly hotelsRemaining: number;
  readonly startedAtMs: number;
  readonly gameEndAtMs: number | null;
  readonly activeTrades: readonly PendingTrade[];
  readonly lastDice: DiceRoll | null;
  readonly rng: RandomCheckpoint;
}

export interface ActiveGameplayAggregateState extends GameplayAggregateStateBase {
  readonly lifecycle: "inProgress";
  readonly turn: ActiveGameplayAggregateTurn;
  readonly bankruptcyRequiredSeatIndex: number | null;
  readonly terminal: null;
}

export interface FinishedGameplayAggregateState extends GameplayAggregateStateBase {
  readonly lifecycle: "finished";
  readonly turn: { readonly phase: "finished" };
  readonly bankruptcyRequiredSeatIndex: null;
  readonly terminal: TerminalOutcome;
}

export type GameplayAggregateState = ActiveGameplayAggregateState | FinishedGameplayAggregateState;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactOwnKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function validDice(value: unknown): value is DiceRoll {
  if (!isPlainObject(value) || !hasExactOwnKeys(value, ["dice", "total", "isDoubles"])) return false;
  const roll = value as unknown as DiceRoll;
  return (
    Array.isArray(roll.dice) &&
    roll.dice.length === 2 &&
    roll.dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6) &&
    roll.total === roll.dice[0] + roll.dice[1] &&
    roll.isDoubles === (roll.dice[0] === roll.dice[1])
  );
}

function validGameplayPlayerSlots(
  players: readonly (GameplayPlayerState | null)[],
  startedAtMs: number,
): boolean {
  const ids = new Set<string>();
  for (const [index, player] of players.entries()) {
    if (player === null) continue;
    if (
      !isPlainObject(player) ||
      !hasExactOwnKeys(player, [
        "seatIndex", "playerId", "status", "cash", "position", "inJail", "jailTurns",
        "consecutiveDoubles", "missedTurns", "getOutOfJailCards", "joinedAtMs",
      ]) ||
      player.seatIndex !== index ||
      !validOpaqueId(player.playerId) ||
      ids.has(player.playerId) ||
      typeof player.joinedAtMs !== "number" ||
      !Number.isSafeInteger(player.joinedAtMs) ||
      player.joinedAtMs < 0 ||
      player.joinedAtMs > startedAtMs
    ) return false;
    ids.add(player.playerId);
  }
  return true;
}

function validTurn(turn: ActiveGameplayAggregateTurn): boolean {
  if (!isPlainObject(turn) || !("phase" in turn)) return false;
  const baseKeys = ["phase", "currentSeatIndex", "startedAtMs", "deadlineAtMs", "emittedWarnings"];
  const payloadKey = turn.phase === "awaitingPropertyDecision" || turn.phase === "awaitingRentPayment"
    ? "propertyPosition"
    : turn.phase === "awaitingCardDraw"
      ? "deck"
      : turn.phase === "awaitingTaxPayment"
        ? "taxKind"
        : null;
  if (
    !["awaitingRoll", "awaitingPropertyDecision", "awaitingRentPayment", "awaitingCardDraw", "awaitingTaxPayment", "awaitingBankruptcy", "awaitingEndTurn"].includes(turn.phase) ||
    !hasExactOwnKeys(turn, payloadKey === null ? baseKeys : [...baseKeys, payloadKey]) ||
    !Number.isInteger(turn.currentSeatIndex) ||
    turn.currentSeatIndex < 0 ||
    turn.currentSeatIndex >= GAMEPLAY_POLICY.maximumPlayers ||
    !Number.isSafeInteger(turn.startedAtMs) ||
    turn.startedAtMs < 0 ||
    !Number.isSafeInteger(turn.deadlineAtMs) ||
    turn.deadlineAtMs !== turn.startedAtMs + GAMEPLAY_POLICY.turnTimeoutMs ||
    !Array.isArray(turn.emittedWarnings)
  ) return false;
  const warnings = Array.from(turn.emittedWarnings);
  if (
    warnings.length > 2 ||
    warnings.some((warning) => warning !== 30 && warning !== 10) ||
    (warnings.length === 2 && (warnings[0] !== 30 || warnings[1] !== 10))
  ) return false;
  if (turn.phase === "awaitingPropertyDecision" || turn.phase === "awaitingRentPayment") {
    return Number.isInteger(turn.propertyPosition) && turn.propertyPosition >= 0 && turn.propertyPosition < 40;
  }
  if (turn.phase === "awaitingCardDraw") return turn.deck === "chance" || turn.deck === "communityChest";
  if (turn.phase === "awaitingTaxPayment") return turn.taxKind === "mev" || turn.taxKind === "priorityFee";
  return true;
}

/** Validates the complete persisted active aggregate before any command is applied. */
export function isValidActiveGameplayAggregateState(value: unknown): value is ActiveGameplayAggregateState {
  if (
    !isPlainObject(value) ||
    !hasExactOwnKeys(value, [
      "schemaVersion", "stateVersion", "gameId", "rulesetId", "lifecycle", "players", "properties",
      "bankCash", "freeParkingPool", "housesRemaining", "hotelsRemaining", "startedAtMs", "gameEndAtMs",
      "turn", "bankruptcyRequiredSeatIndex", "activeTrades", "lastDice", "terminal", "rng",
    ])
  ) return false;
  const state = value as unknown as ActiveGameplayAggregateState;
  if (
    state.schemaVersion !== GAMEPLAY_AGGREGATE_SCHEMA_VERSION ||
    state.lifecycle !== "inProgress" ||
    state.rulesetId !== GAMEPLAY_RULESET_ID ||
    !validOpaqueId(state.gameId) ||
    !Number.isInteger(state.stateVersion) ||
    state.stateVersion < 1 ||
    state.stateVersion > MAX_STATE_VERSION ||
    !Array.isArray(state.players) ||
    state.players.length !== GAMEPLAY_POLICY.maximumPlayers ||
    !Array.isArray(state.properties) ||
    !isValidPropertyStates(state.properties) ||
    typeof state.freeParkingPool !== "bigint" ||
    state.freeParkingPool < 0n ||
    state.freeParkingPool > MAX_MATCH_CASH ||
    !Number.isSafeInteger(state.startedAtMs) ||
    state.startedAtMs < 0 ||
    (state.gameEndAtMs !== null &&
      (!Number.isSafeInteger(state.gameEndAtMs) || state.gameEndAtMs < state.startedAtMs)) ||
    state.terminal !== null ||
    !validTurn(state.turn) ||
    state.turn.startedAtMs < state.startedAtMs ||
    !isPlainObject(state.rng) ||
    !hasExactOwnKeys(state.rng, ["algorithm", "state", "draws", "bytesConsumed"]) ||
    typeof state.rng.algorithm !== "string" ||
    state.rng.algorithm.length < 1 ||
    state.rng.algorithm.length > 64 ||
    typeof state.rng.state !== "string" ||
    state.rng.state.length < 1 ||
    state.rng.state.length > 4_096 ||
    !Number.isSafeInteger(state.rng.draws) ||
    state.rng.draws < 0 ||
    !Number.isSafeInteger(state.rng.bytesConsumed) ||
    state.rng.bytesConsumed < 0 ||
    (state.lastDice !== null && !validDice(state.lastDice)) ||
    (state.turn.phase !== "awaitingRoll" && state.turn.phase !== "awaitingBankruptcy" && state.lastDice === null) ||
    cleanupExpiredTrades(state.activeTrades, 0) === null ||
    !isValidBankruptcyState(
      state.players,
      state.properties,
      { housesRemaining: state.housesRemaining, hotelsRemaining: state.hotelsRemaining },
      state.bankCash,
    )
  ) return false;
  if (!validGameplayPlayerSlots(state.players, state.startedAtMs)) return false;
  const current = state.players[state.turn.currentSeatIndex];
  if (current === null || current === undefined || current.status !== "active") return false;
  if (state.bankruptcyRequiredSeatIndex !== null) {
    if (
      !Number.isInteger(state.bankruptcyRequiredSeatIndex) ||
      state.bankruptcyRequiredSeatIndex !== state.turn.currentSeatIndex ||
      state.turn.phase !== "awaitingBankruptcy"
    ) return false;
  } else if (state.turn.phase === "awaitingBankruptcy") {
    return false;
  }
  if (state.turn.phase === "awaitingPropertyDecision" || state.turn.phase === "awaitingRentPayment") {
    const property = state.properties[state.turn.propertyPosition];
    const definition = BOARD_SPACES[state.turn.propertyPosition];
    if (
      current.position !== state.turn.propertyPosition ||
      property === undefined || definition === undefined ||
      !["street", "railroad", "utility"].includes(definition.propertyType) ||
      (state.turn.phase === "awaitingPropertyDecision" && property.ownerSeatIndex !== null) ||
      (state.turn.phase === "awaitingRentPayment" &&
        (property.ownerSeatIndex === null || property.ownerSeatIndex === current.seatIndex || property.mortgaged))
    ) return false;
  }
  if (state.turn.phase === "awaitingCardDraw") {
    if (current.position !== state.properties[current.position]?.position) return false;
    const kind = BOARD_SPACES[current.position]?.propertyType;
    if ((state.turn.deck === "chance" && kind !== "chance") || (state.turn.deck === "communityChest" && kind !== "communityChest")) {
      return false;
    }
  }
  if (state.turn.phase === "awaitingTaxPayment") {
    const expected = current.position === GAMEPLAY_POLICY.mevTax.position
      ? "mev"
      : current.position === GAMEPLAY_POLICY.priorityFeeTax.position
        ? "priorityFee"
        : null;
    if (state.turn.taxKind !== expected) return false;
  }
  return true;
}

/** Validates a terminal aggregate restored from a durable checkpoint. */
export function isValidFinishedGameplayAggregateState(value: unknown): value is FinishedGameplayAggregateState {
  if (
    !isPlainObject(value) ||
    !hasExactOwnKeys(value, [
      "schemaVersion", "stateVersion", "gameId", "rulesetId", "lifecycle", "players", "properties",
      "bankCash", "freeParkingPool", "housesRemaining", "hotelsRemaining", "startedAtMs", "gameEndAtMs",
      "turn", "bankruptcyRequiredSeatIndex", "activeTrades", "lastDice", "terminal", "rng",
    ])
  ) return false;
  const state = value as unknown as FinishedGameplayAggregateState;
  if (
    state.schemaVersion !== GAMEPLAY_AGGREGATE_SCHEMA_VERSION ||
    state.lifecycle !== "finished" ||
    state.rulesetId !== GAMEPLAY_RULESET_ID ||
    !validOpaqueId(state.gameId) ||
    !Number.isInteger(state.stateVersion) ||
    state.stateVersion < 1 ||
    state.stateVersion > MAX_STATE_VERSION ||
    !Array.isArray(state.players) ||
    state.players.length !== GAMEPLAY_POLICY.maximumPlayers ||
    !Array.isArray(state.properties) ||
    !isValidPropertyStates(state.properties) ||
    typeof state.freeParkingPool !== "bigint" ||
    state.freeParkingPool < 0n ||
    state.freeParkingPool > MAX_MATCH_CASH ||
    !Number.isSafeInteger(state.startedAtMs) ||
    state.startedAtMs < 0 ||
    (state.gameEndAtMs !== null &&
      (!Number.isSafeInteger(state.gameEndAtMs) || state.gameEndAtMs < state.startedAtMs)) ||
    !isPlainObject(state.turn) ||
    !hasExactOwnKeys(state.turn, ["phase"]) ||
    state.turn.phase !== "finished" ||
    state.bankruptcyRequiredSeatIndex !== null ||
    !Array.isArray(state.activeTrades) ||
    state.activeTrades.length !== 0 ||
    state.lastDice !== null ||
    !isPlainObject(state.rng) ||
    !hasExactOwnKeys(state.rng, ["algorithm", "state", "draws", "bytesConsumed"]) ||
    typeof state.rng.algorithm !== "string" ||
    state.rng.algorithm.length < 1 ||
    state.rng.algorithm.length > 64 ||
    typeof state.rng.state !== "string" ||
    state.rng.state.length < 1 ||
    state.rng.state.length > 4_096 ||
    !Number.isSafeInteger(state.rng.draws) ||
    state.rng.draws < 0 ||
    !Number.isSafeInteger(state.rng.bytesConsumed) ||
    state.rng.bytesConsumed < 0 ||
    !isValidBankruptcyState(
      state.players,
      state.properties,
      { housesRemaining: state.housesRemaining, hotelsRemaining: state.hotelsRemaining },
      state.bankCash,
    ) ||
    !validGameplayPlayerSlots(state.players, state.startedAtMs)
  ) return false;

  const terminal = state.terminal;
  if (
    !isPlainObject(terminal) ||
    !hasExactOwnKeys(terminal, ["reason", "winnerSeatIndex", "endedAtMs", "ranking", "settlementEntitlement"]) ||
    !["lastPlayerStanding", "timeLimit", "timeoutForfeit"].includes(terminal.reason) ||
    !Number.isInteger(terminal.winnerSeatIndex) ||
    terminal.winnerSeatIndex < 0 ||
    terminal.winnerSeatIndex >= GAMEPLAY_POLICY.maximumPlayers ||
    !Number.isSafeInteger(terminal.endedAtMs) ||
    terminal.endedAtMs < state.startedAtMs ||
    !Array.isArray(terminal.ranking) ||
    !isPlainObject(terminal.settlementEntitlement) ||
    !hasExactOwnKeys(terminal.settlementEntitlement, ["winnerSeatIndex", "status"]) ||
    terminal.settlementEntitlement.winnerSeatIndex !== terminal.winnerSeatIndex ||
    terminal.settlementEntitlement.status !== "pending" ||
    (terminal.reason === "timeLimit" &&
      (state.gameEndAtMs === null || terminal.endedAtMs < state.gameEndAtMs))
  ) return false;

  const activePlayers = state.players.filter(
    (player): player is GameplayPlayerState => player !== null && player.status === "active",
  );
  if (
    activePlayers.length === 0 ||
    ((terminal.reason === "lastPlayerStanding" || terminal.reason === "timeoutForfeit") && activePlayers.length !== 1) ||
    terminal.ranking.length !== activePlayers.length
  ) return false;
  const expectedRanking = activePlayers.map((player) => {
    const netWorth = calculatePlayerNetWorth(player, state.properties);
    return netWorth === null ? null : { seatIndex: player.seatIndex, netWorth };
  });
  if (expectedRanking.some((entry) => entry === null)) return false;
  expectedRanking.sort((left, right) => {
    if (left!.netWorth > right!.netWorth) return -1;
    if (left!.netWorth < right!.netWorth) return 1;
    return left!.seatIndex - right!.seatIndex;
  });
  for (const [index, entry] of terminal.ranking.entries()) {
    const expected = expectedRanking[index];
    if (
      expected === null || expected === undefined ||
      !isPlainObject(entry) ||
      !hasExactOwnKeys(entry, ["rank", "seatIndex", "netWorth"]) ||
      entry.rank !== index + 1 ||
      entry.seatIndex !== expected.seatIndex ||
      entry.netWorth !== expected.netWorth
    ) return false;
  }
  return terminal.winnerSeatIndex === expectedRanking[0]?.seatIndex;
}

function validLifecycleInput(state: InProgressGameState): boolean {
  if (
    !isPlainObject(state) ||
    !hasExactOwnKeys(state, [
      "schemaVersion", "rulesetId", "stateVersion", "gameId", "creatorId", "lifecycle",
      "minimumPlayers", "maximumPlayers", "seats", "bankCash", "freeParkingPool",
      "housesRemaining", "hotelsRemaining", "createdAtMs", "startedAtMs", "cancelledAtMs",
      "timeLimitMs", "gameEndAtMs", "turnTimeoutMs", "turn", "rng",
    ]) ||
    state.schemaVersion !== GAME_SCHEMA_VERSION ||
    state.rulesetId !== GAMEPLAY_RULESET_ID ||
    state.lifecycle !== "inProgress" ||
    !validOpaqueId(state.gameId) ||
    !validOpaqueId(state.creatorId) ||
    !Number.isInteger(state.stateVersion) ||
    state.stateVersion < 1 ||
    state.stateVersion > MAX_STATE_VERSION ||
    state.minimumPlayers !== MINIMUM_PLAYERS ||
    !Number.isInteger(state.maximumPlayers) ||
    state.maximumPlayers < MINIMUM_PLAYERS ||
    state.maximumPlayers > MAXIMUM_PLAYERS ||
    !Array.isArray(state.seats) ||
    state.seats.length !== MAXIMUM_PLAYERS ||
    state.bankCash !== STARTING_BANK_CASH ||
    state.freeParkingPool !== 0n ||
    state.housesRemaining !== GAMEPLAY_POLICY.totalHouses ||
    state.hotelsRemaining !== GAMEPLAY_POLICY.totalHotels ||
    !Number.isSafeInteger(state.createdAtMs) ||
    state.createdAtMs < 0 ||
    !Number.isSafeInteger(state.startedAtMs) ||
    state.startedAtMs < state.createdAtMs ||
    state.cancelledAtMs !== null ||
    state.turnTimeoutMs !== GAMEPLAY_POLICY.turnTimeoutMs ||
    (state.timeLimitMs !== null &&
      (!Number.isSafeInteger(state.timeLimitMs) || state.timeLimitMs < 1 || state.timeLimitMs > 86_400_000)) ||
    ((state.timeLimitMs === null && state.gameEndAtMs !== null) ||
      (state.timeLimitMs !== null &&
        (!Number.isSafeInteger(state.gameEndAtMs) ||
          state.gameEndAtMs !== state.startedAtMs + state.timeLimitMs))) ||
    !isPlainObject(state.turn) ||
    !hasExactOwnKeys(state.turn, ["phase", "currentSeatIndex", "startedAtMs", "deadlineAtMs"]) ||
    state.turn.phase !== "awaitingRoll" ||
    !Number.isSafeInteger(state.turn.currentSeatIndex) ||
    !Number.isSafeInteger(state.turn.startedAtMs) ||
    state.turn.startedAtMs !== state.startedAtMs ||
    !Number.isSafeInteger(state.turn.deadlineAtMs) ||
    state.turn.deadlineAtMs !== state.turn.startedAtMs + GAMEPLAY_POLICY.turnTimeoutMs ||
    !isPlainObject(state.rng) ||
    !hasExactOwnKeys(state.rng, ["algorithm", "state", "draws", "bytesConsumed"]) ||
    typeof state.rng.algorithm !== "string" ||
    state.rng.algorithm.length < 1 ||
    state.rng.algorithm.length > 64 ||
    typeof state.rng.state !== "string" ||
    state.rng.state.length < 1 ||
    state.rng.state.length > 4_096 ||
    !Number.isSafeInteger(state.rng.draws) ||
    state.rng.draws < 0 ||
    !Number.isSafeInteger(state.rng.bytesConsumed) ||
    state.rng.bytesConsumed < 0
  ) return false;
  const playerIds = new Set<string>();
  for (const [index, seat] of state.seats.entries()) {
    if (seat === null) continue;
    if (
      !isPlainObject(seat) ||
      !hasExactOwnKeys(seat, [
        "seatIndex", "playerId", "status", "cash", "position", "inJail", "joinedAtMs",
      ]) ||
      seat.seatIndex !== index ||
      seat.status !== "active" ||
      !validOpaqueId(seat.playerId) ||
      playerIds.has(seat.playerId) ||
      seat.cash !== STARTING_MATCH_CASH ||
      seat.position !== 0 ||
      seat.inJail !== false ||
      typeof seat.joinedAtMs !== "number" ||
      !Number.isSafeInteger(seat.joinedAtMs) ||
      seat.joinedAtMs < state.createdAtMs ||
      index >= state.maximumPlayers
    ) return false;
    playerIds.add(seat.playerId);
  }
  const occupied = state.seats.filter((seat) => seat !== null);
  const current = state.seats[state.turn.currentSeatIndex];
  return (
    occupied.length >= state.minimumPlayers &&
    state.seats[0]?.playerId === state.creatorId &&
    state.turn.currentSeatIndex === 0 &&
    current !== null &&
    current !== undefined &&
    current.status === "active"
  );
}

export function initializeGameplayAggregate(state: InProgressGameState): ActiveGameplayAggregateState | null {
  if (!validLifecycleInput(state)) return null;
  const players = state.seats.map((seat): GameplayPlayerState | null => seat === null
    ? null
    : {
        seatIndex: seat.seatIndex,
        playerId: seat.playerId,
        status: seat.status,
        cash: seat.cash,
        position: seat.position,
        inJail: seat.inJail,
        jailTurns: 0,
        consecutiveDoubles: 0,
        missedTurns: 0,
        getOutOfJailCards: 0,
        joinedAtMs: seat.joinedAtMs,
      });
  const properties = createPropertyStates().map((property) => Object.freeze(property));
  return Object.freeze({
    schemaVersion: GAMEPLAY_AGGREGATE_SCHEMA_VERSION,
    stateVersion: state.stateVersion,
    gameId: state.gameId,
    rulesetId: state.rulesetId,
    lifecycle: "inProgress",
    players: Object.freeze(players.map((player) => player === null ? null : Object.freeze(player))),
    properties: Object.freeze(properties),
    bankCash: state.bankCash,
    freeParkingPool: state.freeParkingPool,
    housesRemaining: state.housesRemaining,
    hotelsRemaining: state.hotelsRemaining,
    startedAtMs: state.startedAtMs,
    gameEndAtMs: state.gameEndAtMs,
    turn: Object.freeze({
      phase: "awaitingRoll",
      currentSeatIndex: state.turn.currentSeatIndex,
      startedAtMs: state.turn.startedAtMs,
      deadlineAtMs: state.turn.deadlineAtMs,
      emittedWarnings: Object.freeze([]),
    }),
    bankruptcyRequiredSeatIndex: null,
    activeTrades: Object.freeze([]),
    lastDice: null,
    terminal: null,
    rng: Object.freeze({ ...state.rng }),
  });
}

export function gameplayPlayerById(
  state: GameplayAggregateState,
  playerId: PlayerId,
): GameplayPlayerState | null {
  return state.players.find((player) => player?.playerId === playerId) ?? null;
}

export function gameplayActivePlayers(state: GameplayAggregateState): readonly GameplayPlayerState[] {
  return state.players.filter(
    (player): player is GameplayPlayerState => player !== null && player.status === "active",
  );
}
