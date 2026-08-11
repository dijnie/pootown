import type { PlayerId } from "../model/identifiers";

interface VersionedGameplayCommand {
  readonly expectedStateVersion: number;
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

export type GameplayCommandActor =
  | { readonly kind: "player"; readonly playerId: PlayerId }
  | { readonly kind: "internal" };
