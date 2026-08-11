import {
  isValidBankruptcyState,
  resolveBankruptcy,
  type BankruptcyPlayerState,
  type SuccessfulBankruptcyResolution,
} from "./bankruptcy-rules";
import type { BuildingInventory } from "./building-rules";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import type { PropertyState } from "./property-rules";
import type { MatchCash } from "../model/money";

export type TimeoutWarningSeconds = 30 | 10;

export interface TimeoutTurnState {
  readonly currentSeatIndex: number;
  readonly startedAtMs: number;
  readonly deadlineAtMs: number;
  readonly emittedWarnings: readonly TimeoutWarningSeconds[];
}

export interface TimeoutGameState {
  readonly players: readonly (BankruptcyPlayerState | null)[];
  readonly properties: readonly PropertyState[];
  readonly inventory: BuildingInventory;
  readonly bankCash: MatchCash;
  readonly turn: TimeoutTurnState;
}

export type TimeoutRuleErrorCode =
  | "INVALID_TIMEOUT_STATE"
  | "TIMEOUT_NOT_REACHED"
  | "WARNING_NOT_REACHED"
  | "WARNING_ALREADY_EMITTED"
  | "NO_NEXT_ACTIVE_PLAYER"
  | "BANKRUPTCY_FAILED";

export type TimeoutWarningResult =
  | { readonly ok: true; readonly turn: TimeoutTurnState; readonly warningSeconds: TimeoutWarningSeconds }
  | { readonly ok: false; readonly code: TimeoutRuleErrorCode };

export type TimeoutResolution =
  | {
      readonly ok: true;
      readonly kind: "turnAdvanced";
      readonly timedOutSeatIndex: number;
      readonly missedTurns: 1 | 2;
      readonly players: readonly (BankruptcyPlayerState | null)[];
      readonly properties: readonly PropertyState[];
      readonly inventory: BuildingInventory;
      readonly bankCash: MatchCash;
      readonly turn: TimeoutTurnState;
    }
  | {
      readonly ok: true;
      readonly kind: "forfeit";
      readonly timedOutSeatIndex: number;
      readonly missedTurns: 3;
      readonly bankruptcy: SuccessfulBankruptcyResolution;
      readonly turn: TimeoutTurnState | null;
    }
  | { readonly ok: false; readonly code: TimeoutRuleErrorCode };

export type SuccessfulTimeoutForfeit = Extract<TimeoutResolution, { readonly ok: true; readonly kind: "forfeit" }>;

const verifiedTimeoutForfeits = new WeakSet<object>();

function isPlainObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactOwnKeys(value: object, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key));
}

function validTurn(turn: TimeoutTurnState): boolean {
  if (
    !isPlainObject(turn) ||
    !hasExactOwnKeys(turn, ["currentSeatIndex", "startedAtMs", "deadlineAtMs", "emittedWarnings"]) ||
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
  return (
    warnings.length <= 2 &&
    warnings.every((warning) => warning === 30 || warning === 10) &&
    new Set(warnings).size === warnings.length &&
    !(warnings[0] === 10 && warnings.length === 2)
  );
}

function validState(state: TimeoutGameState): boolean {
  if (
    !isPlainObject(state) ||
    !hasExactOwnKeys(state, ["players", "properties", "inventory", "bankCash", "turn"]) ||
    !isValidBankruptcyState(state.players, state.properties, state.inventory, state.bankCash) ||
    !validTurn(state.turn)
  ) return false;
  const current = state.players[state.turn.currentSeatIndex];
  return current !== null && current !== undefined && current.status === "active";
}

export function isVerifiedTimeoutForfeit(value: unknown): value is SuccessfulTimeoutForfeit {
  return isPlainObject(value) && verifiedTimeoutForfeits.has(value as object);
}

export function emitTimeoutWarning(
  turn: TimeoutTurnState,
  warningSeconds: TimeoutWarningSeconds,
  nowMs: number,
): TimeoutWarningResult {
  if (
    !validTurn(turn) ||
    (warningSeconds !== 30 && warningSeconds !== 10) ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0
  ) return { ok: false, code: "INVALID_TIMEOUT_STATE" };
  if (turn.emittedWarnings.includes(warningSeconds)) {
    return { ok: false, code: "WARNING_ALREADY_EMITTED" };
  }
  if (warningSeconds === 30 && turn.emittedWarnings.includes(10)) {
    return { ok: false, code: "WARNING_ALREADY_EMITTED" };
  }
  const warningAtMs = turn.deadlineAtMs - (warningSeconds * 1_000);
  if (nowMs < warningAtMs || nowMs >= turn.deadlineAtMs) {
    return { ok: false, code: "WARNING_NOT_REACHED" };
  }
  return {
    ok: true,
    turn: Object.freeze({ ...turn, emittedWarnings: Object.freeze([...turn.emittedWarnings, warningSeconds]) }),
    warningSeconds,
  };
}

function nextActiveSeat(
  players: readonly (BankruptcyPlayerState | null)[],
  currentSeatIndex: number,
): number | null {
  for (let offset = 1; offset <= GAMEPLAY_POLICY.maximumPlayers; offset += 1) {
    const seatIndex = (currentSeatIndex + offset) % GAMEPLAY_POLICY.maximumPlayers;
    if (players[seatIndex]?.status === "active") return seatIndex;
  }
  return null;
}

export function resolveTurnTimeout(state: TimeoutGameState, nowMs: number): TimeoutResolution {
  if (!validState(state) || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { ok: false, code: "INVALID_TIMEOUT_STATE" };
  }
  if (nowMs < state.turn.deadlineAtMs) return { ok: false, code: "TIMEOUT_NOT_REACHED" };
  const timedOutPlayer = state.players[state.turn.currentSeatIndex]!;
  const missedTurns = timedOutPlayer.missedTurns + 1;
  if (missedTurns > GAMEPLAY_POLICY.maximumMissedTurns) {
    return { ok: false, code: "INVALID_TIMEOUT_STATE" };
  }
  const players = state.players.map((player, index) => player === null
    ? null
    : { ...player, missedTurns: index === state.turn.currentSeatIndex ? missedTurns : player.missedTurns });

  if (missedTurns === GAMEPLAY_POLICY.maximumMissedTurns) {
    const bankruptcy = resolveBankruptcy(
      players,
      state.properties,
      state.inventory,
      state.bankCash,
      state.turn.currentSeatIndex,
    );
    if (!bankruptcy.ok) return { ok: false, code: "BANKRUPTCY_FAILED" };
    let turn: TimeoutTurnState | null = null;
    if (!bankruptcy.endConditionMet) {
      const nextSeatIndex = nextActiveSeat(bankruptcy.players, state.turn.currentSeatIndex);
      const deadlineAtMs = nowMs + GAMEPLAY_POLICY.turnTimeoutMs;
      if (nextSeatIndex === null) return { ok: false, code: "NO_NEXT_ACTIVE_PLAYER" };
      if (!Number.isSafeInteger(deadlineAtMs)) return { ok: false, code: "INVALID_TIMEOUT_STATE" };
      turn = Object.freeze({
        currentSeatIndex: nextSeatIndex,
        startedAtMs: nowMs,
        deadlineAtMs,
        emittedWarnings: Object.freeze([]),
      });
    }
    const result: SuccessfulTimeoutForfeit = Object.freeze({
      ok: true,
      kind: "forfeit",
      timedOutSeatIndex: state.turn.currentSeatIndex,
      missedTurns: 3,
      bankruptcy,
      turn,
    });
    verifiedTimeoutForfeits.add(result);
    return result;
  }

  const nextSeatIndex = nextActiveSeat(players, state.turn.currentSeatIndex);
  if (nextSeatIndex === null || nextSeatIndex === state.turn.currentSeatIndex) {
    return { ok: false, code: "NO_NEXT_ACTIVE_PLAYER" };
  }
  const deadlineAtMs = nowMs + GAMEPLAY_POLICY.turnTimeoutMs;
  if (!Number.isSafeInteger(deadlineAtMs)) return { ok: false, code: "INVALID_TIMEOUT_STATE" };
  return Object.freeze({
    ok: true,
    kind: "turnAdvanced",
    timedOutSeatIndex: state.turn.currentSeatIndex,
    missedTurns: missedTurns as 1 | 2,
    players: Object.freeze(players.map((player) => player === null ? null : Object.freeze(player))),
    properties: Object.freeze(state.properties.map((property) => Object.freeze({ ...property }))),
    inventory: Object.freeze({ ...state.inventory }),
    bankCash: state.bankCash,
    turn: Object.freeze({
      currentSeatIndex: nextSeatIndex,
      startedAtMs: nowMs,
      deadlineAtMs,
      emittedWarnings: Object.freeze([]),
    }),
  });
}
