import type { PlayerId } from "../model/identifiers";

export type DomainEvent =
  | { readonly type: "gameCreated"; readonly creatorId: PlayerId }
  | {
      readonly type: "playerJoined";
      readonly playerId: PlayerId;
      readonly seatIndex: number;
      readonly totalPlayers: number;
    }
  | {
      readonly type: "playerLeft";
      readonly playerId: PlayerId;
      readonly seatIndex: number;
      readonly remainingPlayers: number;
    }
  | { readonly type: "gameStarted"; readonly totalPlayers: number }
  | { readonly type: "gameCancelled"; readonly playersCount: number };
