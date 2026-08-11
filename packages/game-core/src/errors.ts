export type GameCoreErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_STATE"
  | "STALE_STATE_VERSION"
  | "GAME_NOT_FOUND"
  | "GAME_ALREADY_EXISTS"
  | "GAME_NOT_WAITING"
  | "MINIMUM_PLAYERS_NOT_MET"
  | "UNAUTHORIZED_ACTOR"
  | "PLAYER_ALREADY_JOINED"
  | "PLAYER_NOT_FOUND"
  | "GAME_FULL"
  | "CREATOR_CANNOT_LEAVE"
  | "COMMAND_UNSUPPORTED";

export interface GameCoreError {
  readonly code: GameCoreErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export class SnapshotError extends Error {
  readonly code = "INVALID_SNAPSHOT";

  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}
