import type { DeclareBankruptcyGameplayCommand } from "../commands/gameplay-command";
import type { GameCoreError } from "../errors";
import type { GameplayDomainEvent } from "../events/domain-event";
import type {
  ActiveGameplayAggregateState,
  FinishedGameplayAggregateState,
  GameplayAggregateState,
  GameplayPlayerState,
} from "../model/gameplay-aggregate-state";
import { isValidActiveGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { MAX_STATE_VERSION } from "../model/game-state";
import { resolveBankruptcy, type SuccessfulBankruptcyResolution } from "./bankruptcy-rules";
import {
  activeGameplayPlayer,
  advanceGameplayTurn,
  freezeActiveGameplayState,
  type GameplayTransitionContext,
} from "./gameplay-turn-transition";
import { deriveBankruptcyTerminalOutcome, type TerminalOutcome } from "./terminal-rules";

export type GameplayBankruptcyTransitionResult =
  | { readonly ok: true; readonly state: GameplayAggregateState; readonly events: readonly GameplayDomainEvent[] }
  | { readonly ok: false; readonly state: ActiveGameplayAggregateState; readonly error: GameCoreError };

function reject(
  state: ActiveGameplayAggregateState,
  code: GameCoreError["code"],
  message: string,
  retryable = false,
): GameplayBankruptcyTransitionResult {
  return { ok: false, state, error: { code, message, retryable } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validCommand(command: DeclareBankruptcyGameplayCommand): boolean {
  if (!isPlainObject(command)) return false;
  return (
    Object.keys(command).length === 3 &&
    Object.hasOwn(command, "type") &&
    Object.hasOwn(command, "expectedStateVersion") &&
    Object.hasOwn(command, "payload") &&
    command.type === "declareBankruptcy" &&
    Number.isInteger(command.expectedStateVersion) &&
    command.expectedStateVersion >= 0 &&
    isPlainObject(command.payload) &&
    Object.keys(command.payload).length === 0
  );
}

function mergePlayers(
  state: ActiveGameplayAggregateState,
  resolution: SuccessfulBankruptcyResolution,
): readonly (GameplayPlayerState | null)[] | null {
  const players = resolution.players.map((resolved, index) => {
    const original = state.players[index];
    if (resolved === null || original === null || original === undefined) {
      return resolved === null && original === null ? null : undefined;
    }
    return { ...original, ...resolved };
  });
  if (players.some((player) => player === undefined)) return null;
  return players as readonly (GameplayPlayerState | null)[];
}

function freezeTerminal(terminal: TerminalOutcome): TerminalOutcome {
  return Object.freeze({
    ...terminal,
    ranking: Object.freeze(terminal.ranking.map((entry) => Object.freeze({ ...entry }))),
    settlementEntitlement: Object.freeze({ ...terminal.settlementEntitlement }),
  });
}

function finishState(
  state: ActiveGameplayAggregateState,
  players: readonly (GameplayPlayerState | null)[],
  resolution: SuccessfulBankruptcyResolution,
  terminal: TerminalOutcome,
): FinishedGameplayAggregateState {
  return Object.freeze({
    ...state,
    stateVersion: state.stateVersion + 1,
    lifecycle: "finished" as const,
    players: Object.freeze(players.map((player) => player === null ? null : Object.freeze({ ...player }))),
    properties: Object.freeze(resolution.properties.map((property) => Object.freeze({ ...property }))),
    bankCash: resolution.bankCash,
    housesRemaining: resolution.inventory.housesRemaining,
    hotelsRemaining: resolution.inventory.hotelsRemaining,
    turn: Object.freeze({ phase: "finished" as const }),
    bankruptcyRequiredSeatIndex: null,
    activeTrades: Object.freeze([]),
    lastDice: null,
    terminal: freezeTerminal(terminal),
    rng: Object.freeze({ ...state.rng }),
  });
}

/** Liquidates a verified pending bankruptcy and either advances or finishes the game. */
export function transitionGameplayBankruptcy(
  state: ActiveGameplayAggregateState,
  command: DeclareBankruptcyGameplayCommand,
  context: GameplayTransitionContext,
): GameplayBankruptcyTransitionResult {
  if (!isValidActiveGameplayAggregateState(state)) {
    return reject(state, "INVALID_STATE", "gameplay aggregate is invalid");
  }
  if (!validCommand(command) || !Number.isSafeInteger(context.nowMs) || context.nowMs < state.turn.startedAtMs) {
    return reject(state, "INVALID_COMMAND", "command context is invalid");
  }
  if (command.expectedStateVersion !== state.stateVersion) {
    return reject(state, "STALE_STATE_VERSION", "expected state version is stale", true);
  }
  if (state.stateVersion >= MAX_STATE_VERSION) return reject(state, "INVALID_STATE", "state version cannot advance");
  const current = activeGameplayPlayer(state);
  if (current === null) return reject(state, "INVALID_STATE", "turn does not reference an active player");
  if (context.actor.kind !== "player" || context.actor.playerId !== current.playerId) {
    return reject(state, "UNAUTHORIZED_ACTOR", "actor cannot declare this bankruptcy");
  }
  if (state.turn.phase !== "awaitingBankruptcy" || state.bankruptcyRequiredSeatIndex !== current.seatIndex) {
    return reject(state, "INVALID_PHASE", "bankruptcy is not pending for the current player");
  }

  const resolution = resolveBankruptcy(
    state.players,
    state.properties,
    { housesRemaining: state.housesRemaining, hotelsRemaining: state.hotelsRemaining },
    state.bankCash,
    current.seatIndex,
  );
  if (!resolution.ok) return reject(state, "INVALID_STATE", `bankruptcy resolution failed: ${resolution.code}`);
  const players = mergePlayers(state, resolution);
  if (players === null) return reject(state, "INVALID_STATE", "bankruptcy player mapping is inconsistent");
  const bankruptcyEvent = Object.freeze({
    type: "playerBankrupt" as const,
    playerId: current.playerId,
    creditorId: null,
    liquidationValue: resolution.liquidationValue,
    cashTransferred: resolution.cashTransferred,
  });

  if (!resolution.endConditionMet) {
    const advanced = advanceGameplayTurn(state, context.nowMs);
    if (advanced === null) return reject(state, "INVALID_STATE", "no next active player is available");
    const activeTrades = state.activeTrades.filter(
      (trade) => trade.proposerSeatIndex !== current.seatIndex && trade.receiverSeatIndex !== current.seatIndex,
    );
    return {
      ok: true,
      state: freezeActiveGameplayState(state, {
        stateVersion: state.stateVersion + 1,
        players,
        properties: resolution.properties,
        bankCash: resolution.bankCash,
        housesRemaining: resolution.inventory.housesRemaining,
        hotelsRemaining: resolution.inventory.hotelsRemaining,
        turn: advanced.turn,
        bankruptcyRequiredSeatIndex: null,
        activeTrades,
        lastDice: null,
      }),
      events: Object.freeze([bankruptcyEvent]),
    };
  }

  const terminalResult = deriveBankruptcyTerminalOutcome(resolution, context.nowMs);
  if (!terminalResult.ok) return reject(state, "INVALID_STATE", `terminal outcome failed: ${terminalResult.code}`);
  const winner = players[terminalResult.terminal.winnerSeatIndex];
  if (winner === null || winner === undefined || winner.status !== "active") {
    return reject(state, "INVALID_STATE", "terminal winner is unavailable");
  }
  const eventRanking = terminalResult.terminal.ranking.map((entry) => {
    const player = players[entry.seatIndex];
    if (player === null || player === undefined) return null;
    return Object.freeze({ ...entry, playerId: player.playerId });
  });
  if (eventRanking.some((entry) => entry === null)) {
    return reject(state, "INVALID_STATE", "terminal ranking player is unavailable");
  }
  const reason = "lastPlayerStanding" as const;
  return {
    ok: true,
    state: finishState(state, players, resolution, terminalResult.terminal),
    events: Object.freeze([
      bankruptcyEvent,
      Object.freeze({
        type: "gameEnded" as const,
        reason,
        winnerId: winner.playerId,
        ranking: Object.freeze(eventRanking as readonly NonNullable<(typeof eventRanking)[number]>[]),
      }),
      Object.freeze({
        type: "settlementEntitled" as const,
        winnerId: winner.playerId,
        reason,
        entitlementKey: state.gameId,
      }),
    ]),
  };
}
