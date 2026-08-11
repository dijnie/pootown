import type { PlayerId } from "../model/identifiers";
import type { DiceRoll } from "../rules/movement";

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

export type GameplayDomainEvent =
  | { readonly type: "diceRolled"; readonly playerId: PlayerId; readonly dice: DiceRoll }
  | {
      readonly type: "playerMoved";
      readonly playerId: PlayerId;
      readonly fromPosition: number;
      readonly toPosition: number;
      readonly passedGo: boolean;
      readonly salaryCollected: bigint;
    }
  | { readonly type: "jailEntered"; readonly playerId: PlayerId; readonly reason: "space" | "threeDoubles" };
