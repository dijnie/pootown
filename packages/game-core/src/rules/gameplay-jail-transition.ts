import type { GameplayJailCommand } from "../commands/gameplay-command";
import type { ActiveGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { isValidActiveGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { MAX_STATE_VERSION } from "../model/game-state";
import {
  activeGameplayPlayer,
  advanceGameplayTurn,
  createClockedGameplayTurn,
  freezeActiveGameplayState,
  type GameplayTransitionContext,
  type GameplayTransitionResult,
} from "./gameplay-turn-transition";
import { payJailFine, useJailCard } from "./jail-rules";

function reject(
  state: ActiveGameplayAggregateState,
  code: "INVALID_COMMAND" | "INVALID_STATE" | "STALE_STATE_VERSION" | "UNAUTHORIZED_ACTOR" | "INVALID_PHASE",
  message: string,
  retryable = false,
): GameplayTransitionResult {
  return { ok: false, state, error: { code, message, retryable } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validCommand(command: GameplayJailCommand): boolean {
  if (!isPlainObject(command)) return false;
  const keys = Object.keys(command);
  if (
    keys.length !== 3 ||
    !keys.includes("type") ||
    !keys.includes("expectedStateVersion") ||
    !keys.includes("payload") ||
    (command.type !== "payJailFine" && command.type !== "useJailCard") ||
    !isPlainObject(command.payload) ||
    Object.keys(command.payload).length !== 0
  ) return false;
  return Number.isInteger(command.expectedStateVersion) && command.expectedStateVersion >= 0;
}

/** Applies player-owned jail release actions and their forced turn advance. */
export function transitionGameplayJail(
  state: ActiveGameplayAggregateState,
  command: GameplayJailCommand,
  context: GameplayTransitionContext,
): GameplayTransitionResult {
  if (!isValidActiveGameplayAggregateState(state)) {
    return reject(state, "INVALID_STATE", "gameplay aggregate is invalid");
  }
  if (!validCommand(command) || !Number.isSafeInteger(context.nowMs) || context.nowMs < state.turn.startedAtMs) {
    return reject(state, "INVALID_COMMAND", "command context is invalid");
  }
  if (command.expectedStateVersion !== state.stateVersion) {
    return reject(state, "STALE_STATE_VERSION", "expected state version is stale", true);
  }
  if (state.stateVersion >= MAX_STATE_VERSION) {
    return reject(state, "INVALID_STATE", "state version cannot advance");
  }
  const current = activeGameplayPlayer(state);
  if (current === null) return reject(state, "INVALID_STATE", "turn does not reference an active player");
  if (context.actor.kind !== "player" || context.actor.playerId !== current.playerId) {
    return reject(state, "UNAUTHORIZED_ACTOR", "actor cannot execute this jail command");
  }
  if (state.turn.phase !== "awaitingRoll" || !current.inJail) {
    return reject(state, "INVALID_PHASE", "jail action is unavailable");
  }

  const result = command.type === "payJailFine" ? payJailFine(current) : useJailCard(current);
  if (!result.ok) return reject(state, "INVALID_PHASE", `jail action failed: ${result.code}`);

  if (result.outcome === "bankruptcyRequired") {
    const turn = createClockedGameplayTurn("awaitingBankruptcy", current.seatIndex, context.nowMs);
    if (turn === null) return reject(state, "INVALID_STATE", "bankruptcy deadline exceeds limits");
    return {
      ok: true,
      state: freezeActiveGameplayState(state, {
        stateVersion: state.stateVersion + 1,
        turn,
        bankruptcyRequiredSeatIndex: current.seatIndex,
        lastDice: null,
      }),
      events: Object.freeze([]),
    };
  }

  if (result.outcome !== "released" || result.releaseMethod === null) {
    return reject(state, "INVALID_STATE", "jail action did not release the player");
  }
  const advanced = advanceGameplayTurn(state, context.nowMs);
  if (advanced === null) return reject(state, "INVALID_STATE", "no next active player is available");
  const players = state.players.map((player, index) => player === null ? null : index === current.seatIndex
    ? { ...player, ...result.state, consecutiveDoubles: 0 }
    : player);
  return {
    ok: true,
    state: freezeActiveGameplayState(state, {
      stateVersion: state.stateVersion + 1,
      players,
      turn: advanced.turn,
      bankruptcyRequiredSeatIndex: null,
      lastDice: null,
    }),
    events: Object.freeze([Object.freeze({
      type: "jailExited" as const,
      playerId: current.playerId,
      method: result.releaseMethod,
    })]),
  };
}
