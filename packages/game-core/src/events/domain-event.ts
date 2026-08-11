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
  | { readonly type: "jailEntered"; readonly playerId: PlayerId; readonly reason: "space" | "threeDoubles" }
  | { readonly type: "jailExited"; readonly playerId: PlayerId; readonly method: "doubles" | "fine" | "card" }
  | {
      readonly type: "cardDrawn";
      readonly playerId: PlayerId;
      readonly deck: "chance" | "communityChest";
      readonly cardId: number;
      readonly effect: "money" | "move" | "getOutOfJailFree" | "collectFromPlayers" | "moveToNearest" | "repairFree";
    }
  | { readonly type: "propertyPurchased"; readonly playerId: PlayerId; readonly position: number; readonly price: bigint }
  | { readonly type: "propertyDeclined"; readonly playerId: PlayerId; readonly position: number; readonly price: bigint }
  | {
      readonly type: "rentPaid";
      readonly payerId: PlayerId;
      readonly ownerId: PlayerId;
      readonly position: number;
      readonly amount: bigint;
    }
  | {
      readonly type: "buildingBuilt";
      readonly playerId: PlayerId;
      readonly position: number;
      readonly buildingType: "house" | "hotel";
      readonly houseCount: number;
      readonly cost: bigint;
    }
  | {
      readonly type: "buildingSold";
      readonly playerId: PlayerId;
      readonly position: number;
      readonly buildingType: "house" | "hotel";
      readonly salePrice: bigint;
    }
  | {
      readonly type: "taxPaid";
      readonly playerId: PlayerId;
      readonly position: number;
      readonly taxKind: "mev" | "priorityFee";
      readonly amount: bigint;
    }
  | {
      readonly type: "playerBankrupt";
      readonly playerId: PlayerId;
      readonly creditorId: PlayerId | null;
      readonly liquidationValue: bigint;
      readonly cashTransferred: bigint;
    }
  | {
      readonly type: "gameEnded";
      readonly reason: "lastPlayerStanding" | "timeLimit" | "timeoutForfeit";
      readonly winnerId: PlayerId;
      readonly ranking: readonly {
        readonly rank: number;
        readonly seatIndex: number;
        readonly playerId: PlayerId;
        readonly netWorth: bigint;
      }[];
    }
  | {
      readonly type: "settlementEntitled";
      readonly winnerId: PlayerId;
      readonly reason: "lastPlayerStanding" | "timeLimit" | "timeoutForfeit";
      readonly entitlementKey: string;
    }
  | {
      readonly type: "tradeCreated";
      readonly tradeId: string;
      readonly tradeType: "moneyOnly" | "propertyOnly" | "moneyForProperty" | "propertyForMoney";
      readonly proposerId: PlayerId;
      readonly receiverId: PlayerId;
      readonly offeredCash: bigint;
      readonly requestedCash: bigint;
      readonly offeredPropertyPosition: number | null;
      readonly requestedPropertyPosition: number | null;
      readonly expiresAtMs: number;
    }
  | { readonly type: "tradeAccepted"; readonly tradeId: string; readonly proposerId: PlayerId; readonly receiverId: PlayerId }
  | { readonly type: "tradeRejected"; readonly tradeId: string; readonly rejecterId: PlayerId }
  | { readonly type: "tradeCancelled"; readonly tradeId: string; readonly cancellerId: PlayerId }
  | { readonly type: "tradeExpired"; readonly tradeId: string }
  | { readonly type: "timeoutWarning"; readonly playerId: PlayerId; readonly remainingSeconds: 30 | 10 }
  | { readonly type: "timeoutPenalty"; readonly playerId: PlayerId; readonly missedTurns: 1 | 2 | 3 }
  | { readonly type: "forcedTurnEnd"; readonly timedOutPlayerId: PlayerId; readonly nextPlayerId: PlayerId }
  | { readonly type: "timeoutForfeit"; readonly playerId: PlayerId; readonly totalMissedTurns: 3 };
