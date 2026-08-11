import type { GameplayTradeCommand, GameplayTradeTerms } from "../commands/gameplay-command";
import type { GameplayDomainEvent } from "../events/domain-event";
import type { ActiveGameplayAggregateState, GameplayPlayerState } from "../model/gameplay-aggregate-state";
import { gameplayPlayerById, isValidActiveGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { MAX_STATE_VERSION } from "../model/game-state";
import { matchCash } from "../model/money";
import {
  freezeActiveGameplayState,
  type GameplayTransitionContext,
  type GameplayTransitionResult,
} from "./gameplay-turn-transition";
import {
  acceptTrade,
  cancelTrade,
  cleanupExpiredTrades,
  createTrade,
  rejectTrade,
  type PendingTrade,
  type TradeMutationResult,
} from "./trade-rules";

export interface GameplayTradeTransitionContext extends GameplayTransitionContext {
  readonly tradeId?: string;
}

function reject(state: ActiveGameplayAggregateState, code: "INVALID_COMMAND" | "INVALID_STATE" | "STALE_STATE_VERSION" | "UNAUTHORIZED_ACTOR" | "INVALID_PHASE" | "ARITHMETIC_OVERFLOW", message: string, retryable = false): GameplayTransitionResult {
  return { ok: false, state, error: { code, message, retryable } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validCommand(command: GameplayTradeCommand): boolean {
  if (!isPlainObject(command) || Object.keys(command).length !== 3 || !isPlainObject(command.payload)) return false;
  if (!Number.isInteger(command.expectedStateVersion) || command.expectedStateVersion < 0) return false;
  if (command.type === "createTrade") {
    return Object.keys(command.payload).length === 2 &&
      Object.hasOwn(command.payload, "receiverId") &&
      Object.hasOwn(command.payload, "terms") &&
      typeof command.payload.receiverId === "string" &&
      isPlainObject(command.payload.terms);
  }
  if (command.type === "cleanupExpiredTrades") return Object.keys(command.payload).length === 0;
  return (command.type === "acceptTrade" || command.type === "rejectTrade" || command.type === "cancelTrade") &&
    Object.keys(command.payload).length === 1 &&
    Object.hasOwn(command.payload, "tradeId") &&
    typeof command.payload.tradeId === "string";
}

function mergePlayers(state: ActiveGameplayAggregateState, result: TradeMutationResult): readonly (GameplayPlayerState | null)[] | null {
  if (!result.ok) return null;
  const players = result.players.map((resolved, index) => {
    const original = state.players[index];
    if (resolved === null || original === null || original === undefined) return resolved === null && original === null ? null : undefined;
    return { ...original, cash: resolved.cash };
  });
  return players.some((player) => player === undefined) ? null : players as readonly (GameplayPlayerState | null)[];
}

function termsForEvent(terms: GameplayTradeTerms) {
  return {
    tradeType: terms.tradeType,
    offeredCash: terms.tradeType === "moneyOnly" || terms.tradeType === "moneyForProperty" ? terms.offeredCash : matchCash(0n),
    requestedCash: terms.tradeType === "moneyOnly" || terms.tradeType === "propertyForMoney" ? terms.requestedCash : matchCash(0n),
    offeredPropertyPosition: terms.tradeType === "propertyOnly" || terms.tradeType === "propertyForMoney" ? terms.offeredPropertyPosition : null,
    requestedPropertyPosition: terms.tradeType === "propertyOnly" || terms.tradeType === "moneyForProperty" ? terms.requestedPropertyPosition : null,
  };
}

function participantIds(state: ActiveGameplayAggregateState, trade: PendingTrade) {
  const proposer = state.players[trade.proposerSeatIndex];
  const receiver = state.players[trade.receiverSeatIndex];
  return proposer === null || proposer === undefined || receiver === null || receiver === undefined
    ? null
    : { proposerId: proposer.playerId, receiverId: receiver.playerId };
}

/** Applies asynchronous player trades against one versioned aggregate checkpoint. */
export function transitionGameplayTrade(state: ActiveGameplayAggregateState, command: GameplayTradeCommand, context: GameplayTradeTransitionContext): GameplayTransitionResult {
  if (!isValidActiveGameplayAggregateState(state)) return reject(state, "INVALID_STATE", "gameplay aggregate is invalid");
  if (!validCommand(command) || !Number.isSafeInteger(context.nowMs) || context.nowMs < state.turn.startedAtMs) return reject(state, "INVALID_COMMAND", "command context is invalid");
  if (command.expectedStateVersion !== state.stateVersion) return reject(state, "STALE_STATE_VERSION", "expected state version is stale", true);
  if (state.stateVersion >= MAX_STATE_VERSION) return reject(state, "INVALID_STATE", "state version cannot advance");
  if (state.bankruptcyRequiredSeatIndex !== null) return reject(state, "INVALID_PHASE", "trades pause while bankruptcy is pending");
  if (command.type === "cleanupExpiredTrades") {
    if (context.actor.kind !== "internal") return reject(state, "UNAUTHORIZED_ACTOR", "only an internal actor can clean expired trades");
    const cleaned = cleanupExpiredTrades(state.activeTrades, context.nowMs);
    if (cleaned === null) return reject(state, "INVALID_STATE", "trade cleanup state is invalid");
    if (cleaned.removedTradeIds.length === 0) return reject(state, "INVALID_COMMAND", "no expired trades are ready for cleanup");
    return {
      ok: true,
      state: freezeActiveGameplayState(state, { stateVersion: state.stateVersion + 1, activeTrades: cleaned.trades }),
      events: Object.freeze(cleaned.removedTradeIds.map((tradeId) => Object.freeze({ type: "tradeExpired" as const, tradeId }))),
    };
  }
  if (context.actor.kind !== "player") return reject(state, "UNAUTHORIZED_ACTOR", "internal actors cannot trade");
  const actor = gameplayPlayerById(state, context.actor.playerId);
  if (actor === null || actor.status !== "active") return reject(state, "UNAUTHORIZED_ACTOR", "trade actor is not active");

  let result: TradeMutationResult;
  if (command.type === "createTrade") {
    const receiver = gameplayPlayerById(state, command.payload.receiverId);
    if (receiver === null || receiver.status !== "active" || receiver.seatIndex === actor.seatIndex) {
      return reject(state, "INVALID_COMMAND", "trade receiver is unavailable");
    }
    if (typeof context.tradeId !== "string") return reject(state, "INVALID_COMMAND", "server trade ID is required");
    result = createTrade(state.activeTrades, state.players, state.properties, context.tradeId, actor.seatIndex, receiver.seatIndex, command.payload.terms, context.nowMs);
  } else {
    const mutation = command.type === "acceptTrade" ? acceptTrade : command.type === "rejectTrade" ? rejectTrade : cancelTrade;
    if (command.type === "acceptTrade") {
      const target = state.activeTrades.find((trade) => trade.tradeId === command.payload.tradeId);
      const cleaned = target !== undefined && target.expiresAtMs > context.nowMs
        ? cleanupExpiredTrades(state.activeTrades, context.nowMs)
        : null;
      const accepted = mutation(
        cleaned?.trades ?? state.activeTrades,
        state.players,
        state.properties,
        command.payload.tradeId,
        actor.seatIndex,
        context.nowMs,
      );
      result = accepted.ok && cleaned !== null
        ? { ...accepted, removedTradeIds: [...cleaned.removedTradeIds, ...accepted.removedTradeIds] }
        : accepted;
    } else {
      result = mutation(state.activeTrades, state.players, state.properties, command.payload.tradeId, actor.seatIndex, context.nowMs);
    }
  }
  if (!result.ok) {
    return reject(state, result.code === "ARITHMETIC_OVERFLOW" ? "ARITHMETIC_OVERFLOW" : "INVALID_COMMAND", `trade failed: ${result.code}`);
  }
  const mergedPlayers = mergePlayers(state, result);
  if (mergedPlayers === null) return reject(state, "INVALID_STATE", "trade player mapping is inconsistent");
  const expiredIds = result.removedTradeIds.filter((tradeId) => command.type === "createTrade" || tradeId !== command.payload.tradeId);
  const expiredEvents = expiredIds.map((tradeId) => Object.freeze({ type: "tradeExpired" as const, tradeId }));
  let event: GameplayDomainEvent;
  if (command.type === "createTrade") {
    if (result.trade === null) return reject(state, "INVALID_STATE", "created trade is unavailable");
    event = Object.freeze({ type: "tradeCreated" as const, tradeId: result.trade.tradeId, proposerId: actor.playerId, receiverId: command.payload.receiverId, ...termsForEvent(command.payload.terms), expiresAtMs: result.trade.expiresAtMs });
  } else {
    if (result.trade === null) return reject(state, "INVALID_STATE", "resolved trade is unavailable");
    const ids = participantIds(state, result.trade);
    if (ids === null) return reject(state, "INVALID_STATE", "trade participants are unavailable");
    event = command.type === "acceptTrade"
      ? Object.freeze({ type: "tradeAccepted" as const, tradeId: result.trade.tradeId, ...ids })
      : command.type === "rejectTrade"
        ? Object.freeze({ type: "tradeRejected" as const, tradeId: result.trade.tradeId, rejecterId: actor.playerId })
        : Object.freeze({ type: "tradeCancelled" as const, tradeId: result.trade.tradeId, cancellerId: actor.playerId });
  }
  return {
    ok: true,
    state: freezeActiveGameplayState(state, { stateVersion: state.stateVersion + 1, players: mergedPlayers, properties: result.properties, activeTrades: result.trades }),
    events: Object.freeze([...expiredEvents, event]),
  };
}
