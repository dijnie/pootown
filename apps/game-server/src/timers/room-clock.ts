import { createHash } from "node:crypto";
import type { InternalGameplayCommand } from "@pootown/game-contracts/internal";
import type { GameState, GameplayAggregateState } from "@pootown/game-core";

type ScheduledCommandType = Extract<InternalGameplayCommand["type"],
  "warnTurnThirtySeconds" | "warnTurnTenSeconds" | "handleTurnTimeout" |
  "cleanupExpiredTrades" | "enforceGameTimeLimit">;

export interface ScheduledRoomCommand {
  readonly command: InternalGameplayCommand;
  readonly dueAtMs: number;
}

interface Candidate {
  readonly dueAtMs: number;
  readonly priority: number;
  readonly type: ScheduledCommandType;
}

function requestId(gameId: string, type: string, dueAtMs: number, stateVersion: number): string {
  const bytes = createHash("sha256")
    .update(`${gameId}\0${type}\0${dueAtMs}\0${stateVersion}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function turnCandidate(state: Extract<GameplayAggregateState, { lifecycle: "inProgress" }>, nowMs: number): Candidate {
  const deadline = state.turn.deadlineAtMs;
  if (nowMs >= deadline) return { type: "handleTurnTimeout", dueAtMs: deadline, priority: 1 };
  const tenAt = deadline - 10_000;
  if (!state.turn.emittedWarnings.includes(10) && nowMs >= tenAt) {
    return { type: "warnTurnTenSeconds", dueAtMs: tenAt, priority: 2 };
  }
  const thirtyAt = deadline - 30_000;
  if (!state.turn.emittedWarnings.includes(30) && nowMs >= thirtyAt && nowMs < tenAt) {
    return { type: "warnTurnThirtySeconds", dueAtMs: thirtyAt, priority: 3 };
  }
  if (!state.turn.emittedWarnings.includes(30) && nowMs < thirtyAt) {
    return { type: "warnTurnThirtySeconds", dueAtMs: thirtyAt, priority: 3 };
  }
  if (!state.turn.emittedWarnings.includes(10) && nowMs < tenAt) {
    return { type: "warnTurnTenSeconds", dueAtMs: tenAt, priority: 2 };
  }
  return { type: "handleTurnTimeout", dueAtMs: deadline, priority: 1 };
}

export function nextScheduledRoomCommand(
  state: GameState | GameplayAggregateState,
  nowMs: number,
): ScheduledRoomCommand | null {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !("players" in state) ||
      state.lifecycle !== "inProgress" || state.bankruptcyRequiredSeatIndex !== null) return null;
  const candidates: Candidate[] = [turnCandidate(state, nowMs)];
  if (state.gameEndAtMs !== null) {
    candidates.push({ type: "enforceGameTimeLimit", dueAtMs: state.gameEndAtMs, priority: 0 });
  }
  const tradeExpiry = state.activeTrades.reduce<number | null>(
    (earliest, trade) => earliest === null || trade.expiresAtMs < earliest ? trade.expiresAtMs : earliest,
    null,
  );
  if (tradeExpiry !== null) {
    candidates.push({ type: "cleanupExpiredTrades", dueAtMs: tradeExpiry, priority: 4 });
  }
  candidates.sort((left, right) => {
    const leftReady = left.dueAtMs <= nowMs;
    const rightReady = right.dueAtMs <= nowMs;
    if (leftReady !== rightReady) return leftReady ? -1 : 1;
    return leftReady
      ? left.priority - right.priority || left.dueAtMs - right.dueAtMs
      : left.dueAtMs - right.dueAtMs || left.priority - right.priority;
  });
  const selected = candidates[0]!;
  return {
    dueAtMs: selected.dueAtMs,
    command: {
      requestId: requestId(state.gameId, selected.type, selected.dueAtMs, state.stateVersion),
      expectedStateVersion: state.stateVersion,
      type: selected.type,
      payload: {},
    } as InternalGameplayCommand,
  };
}

export interface RoomClockOptions {
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  readonly dispatch: (command: InternalGameplayCommand) => Promise<boolean>;
  readonly nowMs?: () => number;
  readonly onFailure: (error: unknown) => void | Promise<void>;
  readonly setTimer?: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
}

export class RoomClock {
  private currentState: GameState | GameplayAggregateState | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly options: RoomClockOptions) {}

  public synchronize(state: GameState | GameplayAggregateState): void {
    this.stop();
    this.currentState = state;
    const nowMs = this.options.nowMs?.() ?? Date.now();
    const scheduled = nextScheduledRoomCommand(state, nowMs);
    if (scheduled === null) return;
    const delayMs = Math.min(Math.max(0, scheduled.dueAtMs - nowMs), 2_147_483_647);
    const setTimer = this.options.setTimer ?? setTimeout;
    this.timer = setTimer(() => { void this.dispatch(scheduled); }, delayMs);
  }

  public stop(): void {
    if (this.timer === undefined) return;
    (this.options.clearTimer ?? clearTimeout)(this.timer);
    this.timer = undefined;
  }

  private async dispatch(scheduled: ScheduledRoomCommand): Promise<void> {
    this.timer = undefined;
    const versionBeforeDispatch = this.currentState?.stateVersion;
    if (versionBeforeDispatch !== scheduled.command.expectedStateVersion) {
      if (this.currentState !== undefined) this.synchronize(this.currentState);
      return;
    }
    try {
      const advanced = await this.options.dispatch(scheduled.command);
      if (!advanced) return;
      if (this.currentState?.stateVersion === versionBeforeDispatch) {
        throw new Error("Room timer command did not advance the checkpoint");
      }
    } catch (error) {
      await this.options.onFailure(error);
    }
  }
}
