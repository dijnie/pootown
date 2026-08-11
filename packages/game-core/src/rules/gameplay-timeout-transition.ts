import type { GameplayTimeoutCommand } from "../commands/gameplay-command";
import type { GameCoreError } from "../errors";
import type { GameplayDomainEvent } from "../events/domain-event";
import type {
  ActiveGameplayAggregateState,
  ActiveGameplayAggregateTurn,
  FinishedGameplayAggregateState,
  GameplayAggregateState,
  GameplayPlayerState,
} from "../model/gameplay-aggregate-state";
import { isValidActiveGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { MAX_STATE_VERSION } from "../model/game-state";
import { freezeActiveGameplayState, type GameplayTransitionContext } from "./gameplay-turn-transition";
import { deriveTimeLimitTerminalOutcome, deriveTimeoutForfeitTerminalOutcome, type TerminalOutcome } from "./terminal-rules";
import { emitTimeoutWarning, resolveTurnTimeout, type TimeoutTurnState } from "./timeout-rules";

export type GameplayTimeoutTransitionResult =
  | { readonly ok: true; readonly state: GameplayAggregateState; readonly events: readonly GameplayDomainEvent[] }
  | { readonly ok: false; readonly state: ActiveGameplayAggregateState; readonly error: GameCoreError };

function reject(state: ActiveGameplayAggregateState, code: GameCoreError["code"], message: string, retryable = false): GameplayTimeoutTransitionResult {
  return { ok: false, state, error: { code, message, retryable } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validCommand(command: GameplayTimeoutCommand): boolean {
  if (!isPlainObject(command) || Object.keys(command).length !== 3 || !isPlainObject(command.payload)) return false;
  return ["warnTurnThirtySeconds", "warnTurnTenSeconds", "handleTurnTimeout", "enforceGameTimeLimit"].includes(command.type) &&
    Number.isInteger(command.expectedStateVersion) && command.expectedStateVersion >= 0 && Object.keys(command.payload).length === 0;
}

function timeoutTurn(turn: ActiveGameplayAggregateTurn): TimeoutTurnState {
  return {
    currentSeatIndex: turn.currentSeatIndex,
    startedAtMs: turn.startedAtMs,
    deadlineAtMs: turn.deadlineAtMs,
    emittedWarnings: turn.emittedWarnings,
  };
}

function mergePlayers(state: ActiveGameplayAggregateState, resolvedPlayers: readonly unknown[]): readonly (GameplayPlayerState | null)[] | null {
  const players = resolvedPlayers.map((resolved, index) => {
    const original = state.players[index];
    if (resolved === null || original === null || original === undefined) return resolved === null && original === null ? null : undefined;
    if (!isPlainObject(resolved) || typeof resolved.cash !== "bigint") return undefined;
    return { ...original, ...resolved } as GameplayPlayerState;
  });
  return players.some((player) => player === undefined) ? null : players as readonly (GameplayPlayerState | null)[];
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
  properties: ActiveGameplayAggregateState["properties"],
  bankCash: ActiveGameplayAggregateState["bankCash"],
  housesRemaining: number,
  hotelsRemaining: number,
  terminal: TerminalOutcome,
): FinishedGameplayAggregateState {
  return Object.freeze({
    ...state,
    stateVersion: state.stateVersion + 1,
    lifecycle: "finished" as const,
    players: Object.freeze(players.map((player) => player === null ? null : Object.freeze({ ...player }))),
    properties: Object.freeze(properties.map((property) => Object.freeze({ ...property }))),
    bankCash,
    housesRemaining,
    hotelsRemaining,
    turn: Object.freeze({ phase: "finished" as const }),
    bankruptcyRequiredSeatIndex: null,
    activeTrades: Object.freeze([]),
    lastDice: null,
    terminal: freezeTerminal(terminal),
    rng: Object.freeze({ ...state.rng }),
  });
}

function terminalEvents(
  state: ActiveGameplayAggregateState,
  players: readonly (GameplayPlayerState | null)[],
  terminal: TerminalOutcome,
): readonly GameplayDomainEvent[] | null {
  const winner = players[terminal.winnerSeatIndex];
  if (winner === null || winner === undefined || winner.status !== "active") return null;
  const ranking = terminal.ranking.map((entry) => {
    const player = players[entry.seatIndex];
    return player === null || player === undefined ? null : Object.freeze({ ...entry, playerId: player.playerId });
  });
  if (ranking.some((entry) => entry === null)) return null;
  return Object.freeze([
    Object.freeze({ type: "gameEnded" as const, reason: terminal.reason as "timeLimit" | "timeoutForfeit", winnerId: winner.playerId, ranking: Object.freeze(ranking as readonly NonNullable<(typeof ranking)[number]>[]) }),
    Object.freeze({ type: "settlementEntitled" as const, winnerId: winner.playerId, reason: terminal.reason as "timeLimit" | "timeoutForfeit", entitlementKey: state.gameId }),
  ]);
}

/** Applies internal warnings, turn expiry, timeout forfeits, and the game time limit. */
export function transitionGameplayTimeout(
  state: ActiveGameplayAggregateState,
  command: GameplayTimeoutCommand,
  context: GameplayTransitionContext,
): GameplayTimeoutTransitionResult {
  if (!isValidActiveGameplayAggregateState(state)) return reject(state, "INVALID_STATE", "gameplay aggregate is invalid");
  if (!validCommand(command) || !Number.isSafeInteger(context.nowMs) || context.nowMs < state.turn.startedAtMs) return reject(state, "INVALID_COMMAND", "command context is invalid");
  if (command.expectedStateVersion !== state.stateVersion) return reject(state, "STALE_STATE_VERSION", "expected state version is stale", true);
  if (state.stateVersion >= MAX_STATE_VERSION) return reject(state, "INVALID_STATE", "state version cannot advance");
  if (context.actor.kind !== "internal") return reject(state, "UNAUTHORIZED_ACTOR", "only an internal actor can enforce time");
  if (state.bankruptcyRequiredSeatIndex !== null) return reject(state, "INVALID_PHASE", "turn timers pause while bankruptcy is pending");
  if (
    command.type !== "enforceGameTimeLimit" &&
    state.gameEndAtMs !== null &&
    context.nowMs >= state.gameEndAtMs
  ) {
    return reject(state, "INVALID_PHASE", "game time limit must be enforced before turn timers");
  }

  if (command.type === "enforceGameTimeLimit") {
    const terminalResult = deriveTimeLimitTerminalOutcome({ players: state.players, properties: state.properties, gameEndAtMs: state.gameEndAtMs }, context.nowMs);
    if (!terminalResult.ok) {
      return reject(
        state,
        terminalResult.code === "ARITHMETIC_OVERFLOW" ? "ARITHMETIC_OVERFLOW" : "INVALID_COMMAND",
        `game time limit failed: ${terminalResult.code}`,
      );
    }
    const events = terminalEvents(state, state.players, terminalResult.terminal);
    if (events === null) return reject(state, "INVALID_STATE", "terminal event mapping failed");
    return {
      ok: true,
      state: finishState(state, state.players, state.properties, state.bankCash, state.housesRemaining, state.hotelsRemaining, terminalResult.terminal),
      events,
    };
  }

  const current = state.players[state.turn.currentSeatIndex];
  if (current === null || current === undefined || current.status !== "active") return reject(state, "INVALID_STATE", "timed player is unavailable");

  if (command.type === "warnTurnThirtySeconds" || command.type === "warnTurnTenSeconds") {
    const seconds = command.type === "warnTurnThirtySeconds" ? 30 : 10;
    const warning = emitTimeoutWarning(timeoutTurn(state.turn), seconds, context.nowMs);
    if (!warning.ok) return reject(state, "INVALID_COMMAND", `timeout warning failed: ${warning.code}`);
    const turn = Object.freeze({ ...state.turn, ...warning.turn }) as ActiveGameplayAggregateTurn;
    return {
      ok: true,
      state: freezeActiveGameplayState(state, { stateVersion: state.stateVersion + 1, turn }),
      events: Object.freeze([Object.freeze({ type: "timeoutWarning" as const, playerId: current.playerId, remainingSeconds: seconds })]),
    };
  }

  const resolution = resolveTurnTimeout({
    players: state.players,
    properties: state.properties,
    inventory: { housesRemaining: state.housesRemaining, hotelsRemaining: state.hotelsRemaining },
    bankCash: state.bankCash,
    turn: timeoutTurn(state.turn),
  }, context.nowMs);
  if (!resolution.ok) return reject(state, "INVALID_COMMAND", `turn timeout failed: ${resolution.code}`);

  if (resolution.kind === "turnAdvanced") {
    const players = mergePlayers(state, resolution.players);
    if (players === null) return reject(state, "INVALID_STATE", "timeout player mapping failed");
    const next = players[resolution.turn.currentSeatIndex];
    if (next === null || next === undefined) return reject(state, "INVALID_STATE", "next timed player is unavailable");
    const turn = Object.freeze({ phase: "awaitingRoll" as const, ...resolution.turn });
    return {
      ok: true,
      state: freezeActiveGameplayState(state, { stateVersion: state.stateVersion + 1, players, turn, lastDice: null }),
      events: Object.freeze([
        Object.freeze({ type: "timeoutPenalty" as const, playerId: current.playerId, missedTurns: resolution.missedTurns }),
        Object.freeze({ type: "forcedTurnEnd" as const, timedOutPlayerId: current.playerId, nextPlayerId: next.playerId }),
      ]),
    };
  }

  const players = mergePlayers(state, resolution.bankruptcy.players);
  if (players === null) return reject(state, "INVALID_STATE", "timeout forfeit player mapping failed");
  const activeTrades = state.activeTrades.filter((trade) => trade.proposerSeatIndex !== current.seatIndex && trade.receiverSeatIndex !== current.seatIndex);
  const baseEvents: GameplayDomainEvent[] = [
    Object.freeze({ type: "timeoutPenalty", playerId: current.playerId, missedTurns: 3 }),
    Object.freeze({ type: "timeoutForfeit", playerId: current.playerId, totalMissedTurns: 3 }),
    Object.freeze({ type: "playerBankrupt", playerId: current.playerId, creditorId: null, liquidationValue: resolution.bankruptcy.liquidationValue, cashTransferred: resolution.bankruptcy.cashTransferred }),
  ];
  if (!resolution.bankruptcy.endConditionMet) {
    if (resolution.turn === null) return reject(state, "INVALID_STATE", "timeout continuation is unavailable");
    const next = players[resolution.turn.currentSeatIndex];
    if (next === null || next === undefined) return reject(state, "INVALID_STATE", "next timed player is unavailable");
    const turn = Object.freeze({ phase: "awaitingRoll" as const, ...resolution.turn });
    return {
      ok: true,
      state: freezeActiveGameplayState(state, {
        stateVersion: state.stateVersion + 1,
        players,
        properties: resolution.bankruptcy.properties,
        bankCash: resolution.bankruptcy.bankCash,
        housesRemaining: resolution.bankruptcy.inventory.housesRemaining,
        hotelsRemaining: resolution.bankruptcy.inventory.hotelsRemaining,
        turn,
        activeTrades,
        lastDice: null,
      }),
      events: Object.freeze([...baseEvents, Object.freeze({ type: "forcedTurnEnd" as const, timedOutPlayerId: current.playerId, nextPlayerId: next.playerId })]),
    };
  }
  const terminalResult = deriveTimeoutForfeitTerminalOutcome(resolution, context.nowMs);
  if (!terminalResult.ok) return reject(state, "INVALID_STATE", `timeout terminal outcome failed: ${terminalResult.code}`);
  const endingEvents = terminalEvents(state, players, terminalResult.terminal);
  if (endingEvents === null) return reject(state, "INVALID_STATE", "timeout terminal event mapping failed");
  return {
    ok: true,
    state: finishState(
      state,
      players,
      resolution.bankruptcy.properties,
      resolution.bankruptcy.bankCash,
      resolution.bankruptcy.inventory.housesRemaining,
      resolution.bankruptcy.inventory.hotelsRemaining,
      terminalResult.terminal,
    ),
    events: Object.freeze([...baseEvents, ...endingEvents]),
  };
}
