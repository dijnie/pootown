import type { GameId, PlayerId } from "./identifiers";
import type { MatchCash } from "./money";
import type { RandomCheckpoint } from "../ports/random-source";

export const GAME_SCHEMA_VERSION = 1 as const;
export const MINIMUM_PLAYERS = 2 as const;
export const MAXIMUM_PLAYERS = 4 as const;
export const STARTING_MATCH_CASH = 1_500n;
export const STARTING_BANK_CASH = 1_000_000n;
export const DEFAULT_TURN_TIMEOUT_MS = 30_000;
export const MAX_STATE_VERSION = 2_147_483_647;

export interface PlayerSeat {
  readonly seatIndex: number;
  readonly playerId: PlayerId;
  readonly status: "active" | "eliminated";
  readonly cash: MatchCash;
  readonly position: number;
  readonly inJail: boolean;
  readonly joinedAtMs: number;
}

export type SeatSlot = PlayerSeat | null;

interface GameStateBase {
  readonly schemaVersion: typeof GAME_SCHEMA_VERSION;
  readonly stateVersion: number;
  readonly gameId: GameId;
  readonly creatorId: PlayerId;
  readonly minimumPlayers: typeof MINIMUM_PLAYERS;
  readonly maximumPlayers: number;
  readonly seats: readonly SeatSlot[];
  readonly bankCash: MatchCash;
  readonly freeParkingPool: MatchCash;
  readonly housesRemaining: number;
  readonly hotelsRemaining: number;
  readonly createdAtMs: number;
  readonly timeLimitMs: number | null;
  readonly turnTimeoutMs: number;
  readonly rng: RandomCheckpoint;
}

export interface WaitingGameState extends GameStateBase {
  readonly lifecycle: "waitingForPlayers";
  readonly startedAtMs: null;
  readonly cancelledAtMs: null;
  readonly gameEndAtMs: null;
  readonly turn: { readonly phase: "notStarted" };
}

export interface InProgressGameState extends GameStateBase {
  readonly lifecycle: "inProgress";
  readonly startedAtMs: number;
  readonly cancelledAtMs: null;
  readonly gameEndAtMs: number | null;
  readonly turn: {
    readonly phase: "awaitingRoll";
    readonly currentSeatIndex: number;
    readonly startedAtMs: number;
    readonly deadlineAtMs: number;
  };
}

export interface CancelledGameState extends GameStateBase {
  readonly lifecycle: "cancelled";
  readonly startedAtMs: null;
  readonly cancelledAtMs: number;
  readonly gameEndAtMs: null;
  readonly turn: { readonly phase: "finished" };
}

export interface FinishedGameState extends GameStateBase {
  readonly lifecycle: "finished";
  readonly startedAtMs: number;
  readonly cancelledAtMs: null;
  readonly gameEndAtMs: number;
  readonly turn: { readonly phase: "finished" };
}

export type GameState =
  | WaitingGameState
  | InProgressGameState
  | CancelledGameState
  | FinishedGameState;

export function occupiedSeats(state: GameState): readonly PlayerSeat[] {
  return state.seats.filter((seat): seat is PlayerSeat => seat !== null);
}

export function activeSeats(state: GameState): readonly PlayerSeat[] {
  return occupiedSeats(state).filter((seat) => seat.status === "active");
}
