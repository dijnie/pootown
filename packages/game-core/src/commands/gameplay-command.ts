import type { PlayerId } from "../model/identifiers";
import type { MatchCash } from "../model/money";

interface VersionedGameplayCommand {
  readonly expectedStateVersion: number;
}

interface PositionedGameplayCommand extends VersionedGameplayCommand {
  readonly payload: { readonly position: number };
}

export interface RollDiceGameplayCommand extends VersionedGameplayCommand {
  readonly type: "rollDice";
  readonly payload: Record<string, never>;
}

export interface ResolveRandomDiceGameplayCommand extends VersionedGameplayCommand {
  readonly type: "resolveRandomDice";
  readonly payload: Record<string, never>;
}

export interface EndTurnGameplayCommand extends VersionedGameplayCommand {
  readonly type: "endTurn";
  readonly payload: Record<string, never>;
}

export type GameplayTurnCommand =
  | RollDiceGameplayCommand
  | ResolveRandomDiceGameplayCommand
  | EndTurnGameplayCommand;

export interface PayJailFineGameplayCommand extends VersionedGameplayCommand {
  readonly type: "payJailFine";
  readonly payload: Record<string, never>;
}

export interface UseJailCardGameplayCommand extends VersionedGameplayCommand {
  readonly type: "useJailCard";
  readonly payload: Record<string, never>;
}

export type GameplayJailCommand =
  | PayJailFineGameplayCommand
  | UseJailCardGameplayCommand;

export interface DrawChanceCardGameplayCommand extends VersionedGameplayCommand {
  readonly type: "drawChanceCard";
  readonly payload: Record<string, never>;
}

export interface DrawCommunityChestCardGameplayCommand extends VersionedGameplayCommand {
  readonly type: "drawCommunityChestCard";
  readonly payload: Record<string, never>;
}

export interface ResolveRandomCardGameplayCommand extends VersionedGameplayCommand {
  readonly type: "resolveRandomCard";
  readonly payload: { readonly deck: "chance" | "communityChest" };
}

export type GameplayCardCommand =
  | DrawChanceCardGameplayCommand
  | DrawCommunityChestCardGameplayCommand
  | ResolveRandomCardGameplayCommand;

export interface DeclareBankruptcyGameplayCommand extends VersionedGameplayCommand {
  readonly type: "declareBankruptcy";
  readonly payload: Record<string, never>;
}

export type GameplayTradeTerms =
  | { readonly tradeType: "moneyOnly"; readonly offeredCash: MatchCash; readonly requestedCash: MatchCash }
  | { readonly tradeType: "propertyOnly"; readonly offeredPropertyPosition: number | null; readonly requestedPropertyPosition: number | null }
  | { readonly tradeType: "moneyForProperty"; readonly offeredCash: MatchCash; readonly requestedPropertyPosition: number }
  | { readonly tradeType: "propertyForMoney"; readonly offeredPropertyPosition: number; readonly requestedCash: MatchCash };

export interface CreateTradeGameplayCommand extends VersionedGameplayCommand {
  readonly type: "createTrade";
  readonly payload: { readonly receiverId: PlayerId; readonly terms: GameplayTradeTerms };
}

interface TradeDecisionGameplayCommand extends VersionedGameplayCommand {
  readonly payload: { readonly tradeId: string };
}

export interface AcceptTradeGameplayCommand extends TradeDecisionGameplayCommand { readonly type: "acceptTrade" }
export interface RejectTradeGameplayCommand extends TradeDecisionGameplayCommand { readonly type: "rejectTrade" }
export interface CancelTradeGameplayCommand extends TradeDecisionGameplayCommand { readonly type: "cancelTrade" }
export interface CleanupExpiredTradesGameplayCommand extends VersionedGameplayCommand {
  readonly type: "cleanupExpiredTrades";
  readonly payload: Record<string, never>;
}

export type GameplayTradeCommand =
  | CreateTradeGameplayCommand
  | AcceptTradeGameplayCommand
  | RejectTradeGameplayCommand
  | CancelTradeGameplayCommand
  | CleanupExpiredTradesGameplayCommand;

export interface WarnTurnThirtySecondsGameplayCommand extends VersionedGameplayCommand { readonly type: "warnTurnThirtySeconds"; readonly payload: Record<string, never> }
export interface WarnTurnTenSecondsGameplayCommand extends VersionedGameplayCommand { readonly type: "warnTurnTenSeconds"; readonly payload: Record<string, never> }
export interface HandleTurnTimeoutGameplayCommand extends VersionedGameplayCommand { readonly type: "handleTurnTimeout"; readonly payload: Record<string, never> }
export interface EnforceGameTimeLimitGameplayCommand extends VersionedGameplayCommand { readonly type: "enforceGameTimeLimit"; readonly payload: Record<string, never> }

export type GameplayTimeoutCommand =
  | WarnTurnThirtySecondsGameplayCommand
  | WarnTurnTenSecondsGameplayCommand
  | HandleTurnTimeoutGameplayCommand
  | EnforceGameTimeLimitGameplayCommand;

export interface BuyPropertyGameplayCommand extends PositionedGameplayCommand {
  readonly type: "buyProperty";
}

export interface DeclinePropertyGameplayCommand extends PositionedGameplayCommand {
  readonly type: "declineProperty";
}

export interface PayRentGameplayCommand extends PositionedGameplayCommand {
  readonly type: "payRent";
}

export interface BuildHouseGameplayCommand extends PositionedGameplayCommand {
  readonly type: "buildHouse";
}

export interface BuildHotelGameplayCommand extends PositionedGameplayCommand {
  readonly type: "buildHotel";
}

export interface SellBuildingGameplayCommand extends VersionedGameplayCommand {
  readonly type: "sellBuilding";
  readonly payload: { readonly position: number; readonly buildingType: "house" | "hotel" };
}

export interface PayMevTaxGameplayCommand extends VersionedGameplayCommand {
  readonly type: "payMevTax";
  readonly payload: Record<string, never>;
}

export interface PayPriorityFeeTaxGameplayCommand extends VersionedGameplayCommand {
  readonly type: "payPriorityFeeTax";
  readonly payload: Record<string, never>;
}

export type GameplayPropertyCommand =
  | BuyPropertyGameplayCommand
  | DeclinePropertyGameplayCommand
  | PayRentGameplayCommand
  | BuildHouseGameplayCommand
  | BuildHotelGameplayCommand
  | SellBuildingGameplayCommand
  | PayMevTaxGameplayCommand
  | PayPriorityFeeTaxGameplayCommand;

export type GameplayCommand =
  | GameplayTurnCommand
  | GameplayPropertyCommand
  | GameplayJailCommand
  | GameplayCardCommand
  | DeclareBankruptcyGameplayCommand
  | GameplayTradeCommand
  | GameplayTimeoutCommand;

export type GameplayCommandActor =
  | { readonly kind: "player"; readonly playerId: PlayerId }
  | { readonly kind: "internal" };
