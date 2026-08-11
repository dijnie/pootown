import type { GameId } from "../model/identifiers";

interface VersionedCommand {
  readonly expectedStateVersion: number;
}

export interface CreateGameCommand extends VersionedCommand {
  readonly type: "createGame";
  readonly payload: {
    readonly gameId: GameId;
    readonly maximumPlayers: number;
    readonly timeLimitMs: number | null;
  };
}

export interface JoinGameCommand extends VersionedCommand {
  readonly type: "joinGame";
  readonly payload: Record<string, never>;
}

export interface LeaveGameCommand extends VersionedCommand {
  readonly type: "leaveGame";
  readonly payload: Record<string, never>;
}

export interface CancelGameCommand extends VersionedCommand {
  readonly type: "cancelGame";
  readonly payload: Record<string, never>;
}

export interface StartGameCommand extends VersionedCommand {
  readonly type: "startGame";
  readonly payload: Record<string, never>;
}

export type GameCommand =
  | CreateGameCommand
  | JoinGameCommand
  | LeaveGameCommand
  | CancelGameCommand
  | StartGameCommand;
