import type { GameCommand } from "../commands/game-command";
import type { GameCoreError, GameCoreErrorCode } from "../errors";
import type { DomainEvent } from "../events/domain-event";
import {
  DEFAULT_TURN_TIMEOUT_MS,
  GAME_SCHEMA_VERSION,
  MAXIMUM_PLAYERS,
  MAX_STATE_VERSION,
  MINIMUM_PLAYERS,
  STARTING_BANK_CASH,
  STARTING_MATCH_CASH,
  occupiedSeats,
  type CancelledGameState,
  type GameState,
  type InProgressGameState,
  type PlayerSeat,
  type WaitingGameState,
} from "../model/game-state";
import type { PlayerId } from "../model/identifiers";
import { matchCash } from "../model/money";
import type { RandomCheckpoint, RandomSource } from "../ports/random-source";

export interface TransitionContext {
  readonly actorId: PlayerId;
  readonly nowMs: number;
  readonly randomSource: RandomSource;
}

export type TransitionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly DomainEvent[] }
  | { readonly ok: false; readonly state: GameState | null; readonly error: GameCoreError };

function reject(
  state: GameState | null,
  code: GameCoreErrorCode,
  message: string,
  retryable = false,
): TransitionResult {
  return { ok: false, state, error: { code, message, retryable } };
}

function isSafeEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function requireWaiting(state: GameState): WaitingGameState | null {
  return state.lifecycle === "waitingForPlayers" ? state : null;
}

function createSeat(player: PlayerId, seatIndex: number, nowMs: number): PlayerSeat {
  return {
    seatIndex,
    playerId: player,
    status: "active",
    cash: matchCash(STARTING_MATCH_CASH),
    position: 0,
    inJail: false,
    joinedAtMs: nowMs,
  };
}

function randomCheckpoint(randomSource: RandomSource): RandomCheckpoint | null {
  let checkpoint: unknown;
  try {
    checkpoint = randomSource.checkpoint();
  } catch {
    return null;
  }
  if (
    typeof checkpoint !== "object" ||
    checkpoint === null ||
    !("algorithm" in checkpoint) ||
    typeof checkpoint.algorithm !== "string" ||
    checkpoint.algorithm.length < 1 ||
    checkpoint.algorithm.length > 64 ||
    !("state" in checkpoint) ||
    typeof checkpoint.state !== "string" ||
    checkpoint.state.length < 1 ||
    checkpoint.state.length > 4_096 ||
    !("draws" in checkpoint) ||
    typeof checkpoint.draws !== "number" ||
    !Number.isSafeInteger(checkpoint.draws) ||
    checkpoint.draws < 0 ||
    !("bytesConsumed" in checkpoint) ||
    typeof checkpoint.bytesConsumed !== "number" ||
    !Number.isSafeInteger(checkpoint.bytesConsumed) ||
    checkpoint.bytesConsumed < 0
  ) {
    return null;
  }
  return {
    algorithm: checkpoint.algorithm,
    state: checkpoint.state,
    draws: checkpoint.draws,
    bytesConsumed: checkpoint.bytesConsumed,
  };
}

function canResumeRandomSource(randomSource: RandomSource, checkpoint: RandomCheckpoint): boolean {
  try {
    return randomSource.canResume(checkpoint) === true;
  } catch {
    return false;
  }
}

function withVersionAndRng<T extends GameState>(state: T, context: TransitionContext): T | null {
  const rng = randomCheckpoint(context.randomSource);
  if (rng === null) return null;
  return {
    ...state,
    stateVersion: state.stateVersion + 1,
    rng,
  };
}

function createGame(command: Extract<GameCommand, { type: "createGame" }>, context: TransitionContext): TransitionResult {
  if (command.expectedStateVersion !== 0) {
    return reject(null, "STALE_STATE_VERSION", "new games require state version zero");
  }
  if (
    !Number.isInteger(command.payload.maximumPlayers) ||
    command.payload.maximumPlayers < MINIMUM_PLAYERS ||
    command.payload.maximumPlayers > MAXIMUM_PLAYERS
  ) {
    return reject(null, "INVALID_COMMAND", "maximumPlayers must be between two and four");
  }
  if (
    command.payload.timeLimitMs !== null &&
    (!Number.isSafeInteger(command.payload.timeLimitMs) ||
      command.payload.timeLimitMs <= 0 ||
      command.payload.timeLimitMs > 86_400_000)
  ) {
    return reject(null, "INVALID_COMMAND", "timeLimitMs must be null or between one millisecond and one day");
  }

  const rng = randomCheckpoint(context.randomSource);
  if (rng === null) {
    return reject(null, "INVALID_STATE", "random source returned an invalid checkpoint");
  }
  const seats = Array.from({ length: MAXIMUM_PLAYERS }, () => null) as Array<PlayerSeat | null>;
  seats[0] = createSeat(context.actorId, 0, context.nowMs);
  const state: WaitingGameState = {
    schemaVersion: GAME_SCHEMA_VERSION,
    stateVersion: 1,
    gameId: command.payload.gameId,
    creatorId: context.actorId,
    lifecycle: "waitingForPlayers",
    minimumPlayers: MINIMUM_PLAYERS,
    maximumPlayers: command.payload.maximumPlayers,
    seats,
    bankCash: matchCash(STARTING_BANK_CASH),
    freeParkingPool: matchCash(0n),
    housesRemaining: 32,
    hotelsRemaining: 12,
    createdAtMs: context.nowMs,
    startedAtMs: null,
    cancelledAtMs: null,
    timeLimitMs: command.payload.timeLimitMs,
    gameEndAtMs: null,
    turnTimeoutMs: DEFAULT_TURN_TIMEOUT_MS,
    turn: { phase: "notStarted" },
    rng,
  };

  return { ok: true, state, events: [{ type: "gameCreated", creatorId: context.actorId }] };
}

export function transition(
  state: GameState | null,
  command: GameCommand,
  context: TransitionContext,
): TransitionResult {
  if (!isSafeEpoch(context.nowMs)) {
    return reject(state, "INVALID_COMMAND", "nowMs must be a non-negative safe integer");
  }
  if (command.type === "createGame") {
    return state === null
      ? createGame(command, context)
      : reject(state, "GAME_ALREADY_EXISTS", "game state already exists");
  }
  if (state === null) {
    return reject(null, "GAME_NOT_FOUND", "game state does not exist");
  }
  if (command.expectedStateVersion !== state.stateVersion) {
    return reject(state, "STALE_STATE_VERSION", "expected state version does not match", true);
  }
  const latestObservedAtMs = Math.max(
    state.createdAtMs,
    ...occupiedSeats(state).map((seat) => seat.joinedAtMs),
    state.startedAtMs ?? 0,
    state.cancelledAtMs ?? 0,
  );
  if (context.nowMs < latestObservedAtMs) {
    return reject(state, "INVALID_STATE", "command time predates the current state");
  }
  if (state.stateVersion >= MAX_STATE_VERSION) {
    return reject(state, "INVALID_STATE", "state version cannot be incremented safely");
  }
  if (!canResumeRandomSource(context.randomSource, state.rng)) {
    return reject(state, "INVALID_STATE", "random source cannot resume the stored continuation");
  }

  const waiting = requireWaiting(state);
  if (waiting === null) {
    return reject(state, "GAME_NOT_WAITING", "command is only valid before the game starts");
  }

  if (command.type === "joinGame") {
    if (occupiedSeats(waiting).some((seat) => seat.playerId === context.actorId)) {
      return reject(state, "PLAYER_ALREADY_JOINED", "player already occupies a seat");
    }
    const seatIndex = waiting.seats.findIndex(
      (seat, index) => index < waiting.maximumPlayers && seat === null,
    );
    if (seatIndex < 0) {
      return reject(state, "GAME_FULL", "maximum number of players reached");
    }
    const seats = [...waiting.seats];
    seats[seatIndex] = createSeat(context.actorId, seatIndex, context.nowMs);
    const next = withVersionAndRng({ ...waiting, seats }, context);
    if (next === null) return reject(state, "INVALID_STATE", "random source returned an invalid checkpoint");
    return {
      ok: true,
      state: next,
      events: [
        {
          type: "playerJoined",
          playerId: context.actorId,
          seatIndex,
          totalPlayers: occupiedSeats(next).length,
        },
      ],
    };
  }

  if (command.type === "leaveGame") {
    if (context.actorId === waiting.creatorId) {
      return reject(state, "CREATOR_CANNOT_LEAVE", "creator must cancel the game instead");
    }
    const seatIndex = waiting.seats.findIndex((seat) => seat?.playerId === context.actorId);
    if (seatIndex < 0) {
      return reject(state, "PLAYER_NOT_FOUND", "player does not occupy a seat");
    }
    const seats = [...waiting.seats];
    seats[seatIndex] = null;
    const next = withVersionAndRng({ ...waiting, seats }, context);
    if (next === null) return reject(state, "INVALID_STATE", "random source returned an invalid checkpoint");
    return {
      ok: true,
      state: next,
      events: [
        {
          type: "playerLeft",
          playerId: context.actorId,
          seatIndex,
          remainingPlayers: occupiedSeats(next).length,
        },
      ],
    };
  }

  if (command.type === "cancelGame") {
    if (context.actorId !== waiting.creatorId) {
      return reject(state, "UNAUTHORIZED_ACTOR", "only the creator can cancel the game");
    }
    const playersCount = occupiedSeats(waiting).length;
    const rng = randomCheckpoint(context.randomSource);
    if (rng === null) return reject(state, "INVALID_STATE", "random source returned an invalid checkpoint");
    const cancelled: CancelledGameState = {
      ...waiting,
      stateVersion: waiting.stateVersion + 1,
      lifecycle: "cancelled",
      cancelledAtMs: context.nowMs,
      turn: { phase: "finished" },
      rng,
    };
    return { ok: true, state: cancelled, events: [{ type: "gameCancelled", playersCount }] };
  }

  if (context.actorId !== waiting.creatorId) {
    return reject(state, "UNAUTHORIZED_ACTOR", "only the creator can start the game");
  }
  const totalPlayers = occupiedSeats(waiting).length;
  if (totalPlayers < waiting.minimumPlayers) {
    return reject(state, "MINIMUM_PLAYERS_NOT_MET", "at least two players are required");
  }
  const gameEndAtMs = waiting.timeLimitMs === null ? null : context.nowMs + waiting.timeLimitMs;
  const turnDeadlineAtMs = context.nowMs + waiting.turnTimeoutMs;
  if (
    (gameEndAtMs !== null && !Number.isSafeInteger(gameEndAtMs)) ||
    !Number.isSafeInteger(turnDeadlineAtMs)
  ) {
    return reject(state, "INVALID_STATE", "game deadline exceeds the supported timestamp range");
  }
  const rng = randomCheckpoint(context.randomSource);
  if (rng === null) return reject(state, "INVALID_STATE", "random source returned an invalid checkpoint");
  const started: InProgressGameState = {
    ...waiting,
    stateVersion: waiting.stateVersion + 1,
    lifecycle: "inProgress",
    startedAtMs: context.nowMs,
    gameEndAtMs,
    turn: {
      phase: "awaitingRoll",
      currentSeatIndex: 0,
      startedAtMs: context.nowMs,
      deadlineAtMs: turnDeadlineAtMs,
    },
    rng,
  };
  return { ok: true, state: started, events: [{ type: "gameStarted", totalPlayers }] };
}
