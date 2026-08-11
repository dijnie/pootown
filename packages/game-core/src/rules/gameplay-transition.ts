import type { GameplayCommand } from "../commands/gameplay-command";
import type { GameCoreError } from "../errors";
import type { GameplayDomainEvent } from "../events/domain-event";
import type { ActiveGameplayAggregateState, GameplayAggregateState } from "../model/gameplay-aggregate-state";
import { isValidActiveGameplayAggregateState, isValidFinishedGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { transitionGameplayBankruptcy } from "./gameplay-bankruptcy-transition";
import { transitionGameplayCard } from "./gameplay-card-transition";
import { transitionGameplayJail } from "./gameplay-jail-transition";
import { transitionGameplayProperty } from "./gameplay-property-transition";
import { transitionGameplayTimeout } from "./gameplay-timeout-transition";
import { transitionGameplayTrade, type GameplayTradeTransitionContext } from "./gameplay-trade-transition";
import { transitionGameplayTurn, type GameplayTransitionContext } from "./gameplay-turn-transition";

export interface GameplayCommandContext extends GameplayTransitionContext {
  readonly tradeId?: string;
}

export type GameplayAggregateTransitionResult =
  | { readonly ok: true; readonly state: GameplayAggregateState; readonly events: readonly GameplayDomainEvent[] }
  | { readonly ok: false; readonly state: GameplayAggregateState; readonly error: GameCoreError };

function reject(
  state: GameplayAggregateState,
  code: GameCoreError["code"],
  message: string,
): GameplayAggregateTransitionResult {
  return { ok: false, state, error: { code, message, retryable: false } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactOwnKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function validContext(context: unknown): context is GameplayCommandContext {
  if (!isPlainObject(context)) return false;
  const expectedKeys = Object.hasOwn(context, "tradeId")
    ? ["actor", "nowMs", "randomSource", "tradeId"]
    : ["actor", "nowMs", "randomSource"];
  if (
    !hasExactOwnKeys(context, expectedKeys) ||
    !Number.isSafeInteger(context.nowMs) ||
    (context.nowMs as number) < 0 ||
    (Object.hasOwn(context, "tradeId") && typeof context.tradeId !== "string") ||
    !isPlainObject(context.actor)
  ) return false;
  if (context.actor.kind === "internal") {
    if (!hasExactOwnKeys(context.actor, ["kind"])) return false;
  } else if (context.actor.kind === "player") {
    if (
      !hasExactOwnKeys(context.actor, ["kind", "playerId"]) ||
      typeof context.actor.playerId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(context.actor.playerId)
    ) return false;
  } else {
    return false;
  }
  const randomSource = context.randomSource as Record<string, unknown> | null;
  return (
    typeof randomSource === "object" &&
    randomSource !== null &&
    typeof randomSource.nextBytes === "function" &&
    typeof randomSource.checkpoint === "function" &&
    typeof randomSource.canResume === "function" &&
    (randomSource.fork === undefined || typeof randomSource.fork === "function")
  );
}

/** Routes every supported gameplay command through one server-authoritative entrypoint. */
export function transitionGameplay(
  state: GameplayAggregateState,
  command: GameplayCommand,
  context: GameplayCommandContext,
): GameplayAggregateTransitionResult {
  if (isValidFinishedGameplayAggregateState(state)) {
    return reject(state, "INVALID_PHASE", "finished games cannot accept commands");
  }
  if (!isValidActiveGameplayAggregateState(state)) {
    return reject(state, "INVALID_STATE", "gameplay aggregate is invalid");
  }
  if (
    typeof command !== "object" ||
    command === null ||
    Array.isArray(command) ||
    typeof command.type !== "string" ||
    !validContext(context)
  ) {
    return reject(state, "INVALID_COMMAND", "gameplay command context is invalid");
  }

  const active = state as ActiveGameplayAggregateState;
  switch (command.type) {
    case "rollDice":
    case "resolveRandomDice":
    case "endTurn":
      return transitionGameplayTurn(active, command, context);
    case "buyProperty":
    case "declineProperty":
    case "payRent":
    case "buildHouse":
    case "buildHotel":
    case "sellBuilding":
    case "payMevTax":
    case "payPriorityFeeTax":
      return transitionGameplayProperty(active, command, context);
    case "payJailFine":
    case "useJailCard":
      return transitionGameplayJail(active, command, context);
    case "drawChanceCard":
    case "drawCommunityChestCard":
    case "resolveRandomCard":
      return transitionGameplayCard(active, command, context);
    case "declareBankruptcy":
      return transitionGameplayBankruptcy(active, command, context);
    case "createTrade":
    case "acceptTrade":
    case "rejectTrade":
    case "cancelTrade":
    case "cleanupExpiredTrades":
      return transitionGameplayTrade(active, command, context as GameplayTradeTransitionContext);
    case "warnTurnThirtySeconds":
    case "warnTurnTenSeconds":
    case "handleTurnTimeout":
    case "enforceGameTimeLimit":
      return transitionGameplayTimeout(active, command, context);
    default:
      return reject(active, "COMMAND_UNSUPPORTED", "gameplay command is unsupported");
  }
}
