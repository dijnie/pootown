import type { GameCommand } from "../commands/game-command";
import type { GameCoreError } from "../errors";
import type { DomainEvent } from "../events/domain-event";
import type { GameState } from "../model/game-state";
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
