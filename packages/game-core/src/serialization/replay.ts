import type { GameCommand } from "../commands/game-command";
import type { GameplayCommand } from "../commands/gameplay-command";
import type { GameCoreError } from "../errors";
import type { DomainEvent } from "../events/domain-event";
import type { GameplayDomainEvent } from "../events/domain-event";
import type { GameState } from "../model/game-state";
import type { GameplayAggregateState } from "../model/gameplay-aggregate-state";
import { isValidActiveGameplayAggregateState, isValidFinishedGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { transitionGameplay, type GameplayCommandContext } from "../rules/gameplay-transition";
import { transition, type TransitionContext } from "../rules/lifecycle";

export interface ReplayStep {
  readonly command: GameCommand;
  readonly context: TransitionContext;
}

export type ReplayResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly DomainEvent[] }
  | { readonly ok: false; readonly state: GameState | null; readonly failedStep: number; readonly error: GameCoreError };

export function replay(initialState: GameState | null, steps: readonly ReplayStep[]): ReplayResult {
  let state = initialState;
  const events: DomainEvent[] = [];
  for (const [index, step] of steps.entries()) {
    const result = transition(state, step.command, step.context);
    if (!result.ok) return { ok: false, state: result.state, failedStep: index, error: result.error };
    state = result.state;
    events.push(...result.events);
  }
  if (state === null) {
    return {
      ok: false,
      state: null,
      failedStep: 0,
      error: { code: "GAME_NOT_FOUND", message: "replay produced no game state", retryable: false },
    };
  }
  return { ok: true, state, events };
}

export interface GameplayReplayStep {
  readonly command: GameplayCommand;
  readonly context: GameplayCommandContext;
}

export type GameplayReplayResult =
  | { readonly ok: true; readonly state: GameplayAggregateState; readonly events: readonly GameplayDomainEvent[] }
  | { readonly ok: false; readonly state: GameplayAggregateState; readonly failedStep: number; readonly error: GameCoreError };

/** Replays gameplay commands from a durable aggregate checkpoint in exact order. */
export function replayGameplay(
  initialState: GameplayAggregateState,
  steps: readonly GameplayReplayStep[],
): GameplayReplayResult {
  if (!isValidActiveGameplayAggregateState(initialState) && !isValidFinishedGameplayAggregateState(initialState)) {
    return {
      ok: false,
      state: initialState,
      failedStep: 0,
      error: { code: "INVALID_STATE", message: "initial gameplay aggregate is invalid", retryable: false },
    };
  }
  let state = initialState;
  const events: GameplayDomainEvent[] = [];
  for (const [index, step] of steps.entries()) {
    if (typeof step !== "object" || step === null || Array.isArray(step)) {
      return {
        ok: false,
        state,
        failedStep: index,
        error: { code: "INVALID_COMMAND", message: "gameplay replay step is invalid", retryable: false },
      };
    }
    const result = transitionGameplay(state, step.command, step.context);
    if (!result.ok) return { ok: false, state: result.state, failedStep: index, error: result.error };
    state = result.state;
    events.push(...result.events);
  }
  return Object.freeze({ ok: true, state, events: Object.freeze(events) });
}
