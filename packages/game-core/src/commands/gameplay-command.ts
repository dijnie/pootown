import type { PlayerId } from "../model/identifiers";

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
  | DeclareBankruptcyGameplayCommand;

export type GameplayCommandActor =
  | { readonly kind: "player"; readonly playerId: PlayerId }
  | { readonly kind: "internal" };
