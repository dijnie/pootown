import type {
  GameplayCommandActor,
  GameplayTurnCommand,
} from "../commands/gameplay-command";
import type { GameCoreError } from "../errors";
import type { GameplayDomainEvent } from "../events/domain-event";
import type {
  ActiveGameplayAggregateState,
  ActiveGameplayAggregateTurn,
  GameplayPlayerState,
} from "../model/gameplay-aggregate-state";
import { isValidActiveGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { MAX_STATE_VERSION } from "../model/game-state";
import { checkedAddMatchCash, matchCash } from "../model/money";
import type { RandomCheckpoint, RandomSource } from "../ports/random-source";
import { BOARD_SPACES } from "./board-definition";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import { applyDoubles, moveBy, rollDice } from "./movement";

export interface GameplayTransitionContext {
  readonly actor: GameplayCommandActor;
  readonly nowMs: number;
  readonly randomSource: RandomSource;
}

export type GameplayTransitionResult =
  | {
      readonly ok: true;
      readonly state: ActiveGameplayAggregateState;
      readonly events: readonly GameplayDomainEvent[];
    }
  | {
      readonly ok: false;
      readonly state: ActiveGameplayAggregateState;
      readonly error: GameCoreError;
    };

function reject(
  state: ActiveGameplayAggregateState,
  code: GameCoreError["code"],
  message: string,
  retryable = false,
): GameplayTransitionResult {
  return { ok: false, state, error: { code, message, retryable } };
}

function safeEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function checkpoint(randomSource: RandomSource): RandomCheckpoint | null {
  let value: unknown;
  try {
    value = randomSource.checkpoint();
  } catch {
    return null;
  }
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    !("algorithm" in value) || typeof value.algorithm !== "string" || value.algorithm.length < 1 || value.algorithm.length > 64 ||
    !("state" in value) || typeof value.state !== "string" || value.state.length < 1 || value.state.length > 4_096 ||
    !("draws" in value) || !Number.isSafeInteger(value.draws) || (value.draws as number) < 0 ||
    !("bytesConsumed" in value) || !Number.isSafeInteger(value.bytesConsumed) || (value.bytesConsumed as number) < 0
  ) return null;
  return {
    algorithm: value.algorithm,
    state: value.state,
    draws: value.draws as number,
    bytesConsumed: value.bytesConsumed as number,
  };
}

function canResume(randomSource: RandomSource, value: RandomCheckpoint): boolean {
  try {
    return randomSource.canResume(value) === true;
  } catch {
    return false;
  }
}

function forkRandomSource(randomSource: RandomSource, value: RandomCheckpoint): RandomSource | null {
  if (typeof randomSource.fork !== "function") return null;
  let fork: RandomSource | null;
  try {
    fork = randomSource.fork(value);
  } catch {
    return null;
  }
  return fork !== null && fork !== randomSource && canResume(fork, value) ? fork : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validCommand(command: GameplayTurnCommand): boolean {
  if (!isPlainObject(command)) return false;
  const keys = Object.keys(command);
  if (keys.length !== 3 || !keys.includes("type") || !keys.includes("expectedStateVersion") || !keys.includes("payload")) {
    return false;
  }
  if (command.type !== "rollDice" && command.type !== "resolveRandomDice" && command.type !== "endTurn") return false;
  if (!isPlainObject(command.payload)) return false;
  return Object.keys(command.payload).length === 0;
}

function checkpointAdvanced(previous: RandomCheckpoint, next: RandomCheckpoint): boolean {
  return (
    next.algorithm === previous.algorithm &&
    next.draws > previous.draws &&
    next.bytesConsumed >= previous.bytesConsumed + 2
  );
}

export function activeGameplayPlayer(state: ActiveGameplayAggregateState): GameplayPlayerState | null {
  const player = state.players[state.turn.currentSeatIndex];
  return player?.status === "active" ? player : null;
}

function nextActiveSeat(state: ActiveGameplayAggregateState, currentSeatIndex: number): number | null {
  for (let offset = 1; offset <= GAMEPLAY_POLICY.maximumPlayers; offset += 1) {
    const seatIndex = (currentSeatIndex + offset) % GAMEPLAY_POLICY.maximumPlayers;
    if (state.players[seatIndex]?.status === "active") return seatIndex;
  }
  return null;
}

export function createClockedGameplayTurn(
  phase: ActiveGameplayAggregateTurn["phase"],
  seatIndex: number,
  nowMs: number,
): ActiveGameplayAggregateTurn | null {
  const deadlineAtMs = nowMs + GAMEPLAY_POLICY.turnTimeoutMs;
  if (!safeEpoch(nowMs) || !Number.isSafeInteger(deadlineAtMs)) return null;
  const clock = {
    currentSeatIndex: seatIndex,
    startedAtMs: nowMs,
    deadlineAtMs,
    emittedWarnings: Object.freeze([]),
  };
  if (phase === "awaitingRoll") return Object.freeze({ phase, ...clock });
  if (phase === "awaitingEndTurn") return Object.freeze({ phase, ...clock });
  return null;
}

function phaseForLanding(
  state: ActiveGameplayAggregateState,
  position: number,
  currentSeatIndex: number,
  nowMs: number,
  rolledDoubles: boolean,
): ActiveGameplayAggregateTurn | null {
  const definition = BOARD_SPACES[position];
  const clock = createClockedGameplayTurn(rolledDoubles ? "awaitingRoll" : "awaitingEndTurn", currentSeatIndex, nowMs);
  if (definition === undefined || clock === null) return null;
  const base = {
    currentSeatIndex,
    startedAtMs: clock.startedAtMs,
    deadlineAtMs: clock.deadlineAtMs,
    emittedWarnings: clock.emittedWarnings,
  };
  if (definition.propertyType === "street" || definition.propertyType === "railroad" || definition.propertyType === "utility") {
    const property = state.properties[position];
    if (property === undefined) return null;
    if (property.ownerSeatIndex === null) {
      return Object.freeze({ phase: "awaitingPropertyDecision", propertyPosition: position, ...base });
    }
    if (property.ownerSeatIndex !== currentSeatIndex && !property.mortgaged) {
      return Object.freeze({ phase: "awaitingRentPayment", propertyPosition: position, ...base });
    }
    return clock;
  }
  if (definition.propertyType === "chance" || definition.propertyType === "communityChest") {
    return Object.freeze({
      phase: "awaitingCardDraw",
      deck: definition.propertyType === "chance" ? "chance" : "communityChest",
      ...base,
    });
  }
  if (definition.propertyType === "tax") {
    return Object.freeze({
      phase: "awaitingTaxPayment",
      taxKind: position === GAMEPLAY_POLICY.mevTax.position ? "mev" : "priorityFee",
      ...base,
    });
  }
  return clock;
}

export function freezeActiveGameplayState(
  state: ActiveGameplayAggregateState,
  update: Partial<ActiveGameplayAggregateState>,
): ActiveGameplayAggregateState {
  const players = (update.players ?? state.players).map((player) =>
    player === null ? null : Object.freeze({ ...player }),
  );
  const lastDice = update.lastDice === undefined ? state.lastDice : update.lastDice;
  const activeTrades = (update.activeTrades ?? state.activeTrades).map((trade) => Object.freeze({
    ...trade,
    terms: Object.freeze({ ...trade.terms }),
  }));
  return Object.freeze({
    ...state,
    ...update,
    players: Object.freeze(players),
    properties: Object.freeze((update.properties ?? state.properties).map((property) => Object.freeze({ ...property }))),
    activeTrades: Object.freeze(activeTrades),
    lastDice: lastDice === null ? null : Object.freeze({
      ...lastDice,
      dice: Object.freeze([...lastDice.dice]) as unknown as readonly [number, number],
    }),
    rng: Object.freeze({ ...(update.rng ?? state.rng) }),
  });
}

function playerActorAuthorized(
  command: GameplayTurnCommand,
  state: ActiveGameplayAggregateState,
  context: GameplayTransitionContext,
): boolean {
  if (command.type === "resolveRandomDice") return context.actor.kind === "internal";
  const current = activeGameplayPlayer(state);
  return context.actor.kind === "player" && current?.playerId === context.actor.playerId;
}

function advanceTurn(
  state: ActiveGameplayAggregateState,
  nowMs: number,
): { readonly turn: ActiveGameplayAggregateTurn; readonly nextSeatIndex: number } | null {
  const nextSeatIndex = nextActiveSeat(state, state.turn.currentSeatIndex);
  if (nextSeatIndex === null || nextSeatIndex === state.turn.currentSeatIndex) return null;
  const turn = createClockedGameplayTurn("awaitingRoll", nextSeatIndex, nowMs);
  return turn === null ? null : { turn, nextSeatIndex };
}

export function transitionGameplayTurn(
  state: ActiveGameplayAggregateState,
  command: GameplayTurnCommand,
  context: GameplayTransitionContext,
): GameplayTransitionResult {
  if (!isValidActiveGameplayAggregateState(state)) {
    return reject(state, "INVALID_STATE", "gameplay aggregate is invalid");
  }
  if (
    !validCommand(command) ||
    !safeEpoch(context.nowMs) ||
    context.nowMs < state.turn.startedAtMs ||
    !Number.isInteger(command.expectedStateVersion) ||
    command.expectedStateVersion < 0
  ) {
    return reject(state, "INVALID_COMMAND", "command context is invalid");
  }
  if (command.expectedStateVersion !== state.stateVersion) {
    return reject(state, "STALE_STATE_VERSION", "expected state version is stale", true);
  }
  if (state.stateVersion >= MAX_STATE_VERSION) return reject(state, "INVALID_STATE", "state version cannot advance");
  const current = activeGameplayPlayer(state);
  if (current === null) return reject(state, "INVALID_STATE", "turn does not reference an active player");
  if (!playerActorAuthorized(command, state, context)) {
    return reject(state, "UNAUTHORIZED_ACTOR", "actor cannot execute this turn command");
  }

  if (command.type === "endTurn") {
    if (state.turn.phase !== "awaitingEndTurn") {
      return reject(state, "INVALID_COMMAND", "turn cannot end while an action is pending");
    }
    if (state.lastDice === null) {
      return reject(state, "INVALID_STATE", "turn cannot end before dice have been rolled");
    }
    if (state.bankruptcyRequiredSeatIndex !== null) {
      return reject(state, "INVALID_PHASE", "bankruptcy must be resolved before the turn can end");
    }
    const advanced = advanceTurn(state, context.nowMs);
    if (advanced === null) return reject(state, "INVALID_STATE", "no next active player is available");
    const players = state.players.map((player, index) => player === null ? null : {
      ...player,
      consecutiveDoubles: index === state.turn.currentSeatIndex ? 0 : player.consecutiveDoubles,
    });
    const next = freezeActiveGameplayState(state, {
      stateVersion: state.stateVersion + 1,
      players,
      turn: advanced.turn,
      lastDice: null,
    });
    return {
      ok: true,
      state: next,
      events: Object.freeze([]),
    };
  }

  if (state.turn.phase !== "awaitingRoll") {
    return reject(state, "INVALID_COMMAND", "dice can only be rolled at the start of a turn");
  }
  if (current.inJail) {
    return reject(state, "COMMAND_UNSUPPORTED", "jailed dice resolution is handled by the jail transition");
  }
  const commandRandomSource = forkRandomSource(context.randomSource, state.rng);
  if (commandRandomSource === null) {
    return reject(state, "INVALID_STATE", "random source cannot fork the persisted checkpoint");
  }
  const dice = rollDice(commandRandomSource);
  if (dice === null) return reject(state, "INVALID_STATE", "random source failed to produce valid dice");
  const nextCheckpoint = checkpoint(commandRandomSource);
  if (
    nextCheckpoint === null ||
    !checkpointAdvanced(state.rng, nextCheckpoint) ||
    !canResume(commandRandomSource, nextCheckpoint)
  ) {
    return reject(state, "INVALID_STATE", "random source returned an invalid checkpoint");
  }
  const doubles = applyDoubles(current.consecutiveDoubles, dice);
  if (doubles === null) return reject(state, "INVALID_STATE", "player doubles state is invalid");
  const frozenDice = Object.freeze({
    ...dice,
    dice: Object.freeze([...dice.dice]) as unknown as readonly [number, number],
  });
  const diceEvent = Object.freeze({ type: "diceRolled" as const, playerId: current.playerId, dice: frozenDice });

  if (doubles.sentToJail) {
    const advanced = advanceTurn(state, context.nowMs);
    if (advanced === null) return reject(state, "INVALID_STATE", "no next active player is available");
    const players = state.players.map((player, index) => player === null ? null : index === current.seatIndex
      ? { ...player, position: GAMEPLAY_POLICY.jailPosition, inJail: true, jailTurns: 0, consecutiveDoubles: 0 }
      : player);
    const next = freezeActiveGameplayState(state, {
      stateVersion: state.stateVersion + 1,
      players,
      turn: advanced.turn,
      lastDice: dice,
      rng: nextCheckpoint,
    });
    return {
      ok: true,
      state: next,
      events: Object.freeze([
        diceEvent,
        Object.freeze({ type: "jailEntered" as const, playerId: current.playerId, reason: "threeDoubles" as const }),
      ]),
    };
  }

  const movement = moveBy(current.position, dice.total);
  if (movement === null) return reject(state, "INVALID_STATE", "player position is invalid");
  let cash = current.cash;
  if (movement.passedGo) {
    const salary = matchCash(GAMEPLAY_POLICY.passGoSalary);
    const nextCash = checkedAddMatchCash(cash, salary);
    if (nextCash === null) return reject(state, "INVALID_STATE", "GO salary cannot be applied");
    cash = nextCash;
  }
  if (movement.to === GAMEPLAY_POLICY.goToJailPosition) {
    const advanced = advanceTurn(state, context.nowMs);
    if (advanced === null) return reject(state, "INVALID_STATE", "no next active player is available");
    const players = state.players.map((player, index) => player === null ? null : index === current.seatIndex
      ? {
          ...player,
          cash,
          position: GAMEPLAY_POLICY.jailPosition,
          inJail: true,
          jailTurns: 0,
          consecutiveDoubles: 0,
        }
      : player);
    const next = freezeActiveGameplayState(state, {
      stateVersion: state.stateVersion + 1,
      players,
      turn: advanced.turn,
      lastDice: dice,
      rng: nextCheckpoint,
    });
    return {
      ok: true,
      state: next,
      events: Object.freeze([
        diceEvent,
        Object.freeze({
          type: "playerMoved" as const,
          playerId: current.playerId,
          fromPosition: movement.from,
          toPosition: movement.to,
          passedGo: movement.passedGo,
          salaryCollected: movement.passedGo ? GAMEPLAY_POLICY.passGoSalary : 0n,
        }),
        Object.freeze({ type: "jailEntered" as const, playerId: current.playerId, reason: "space" as const }),
      ]),
    };
  }
  const turn = phaseForLanding(state, movement.to, current.seatIndex, context.nowMs, dice.isDoubles);
  if (turn === null) return reject(state, "INVALID_STATE", "landing cannot be resolved");
  const players = state.players.map((player, index) => player === null ? null : index === current.seatIndex
    ? { ...player, cash, position: movement.to, consecutiveDoubles: doubles.consecutiveDoubles }
    : player);
  const next = freezeActiveGameplayState(state, {
    stateVersion: state.stateVersion + 1,
    players,
    turn,
    lastDice: dice,
    rng: nextCheckpoint,
  });
  return {
    ok: true,
    state: next,
    events: Object.freeze([
      diceEvent,
      Object.freeze({
        type: "playerMoved" as const,
        playerId: current.playerId,
        fromPosition: movement.from,
        toPosition: movement.to,
        passedGo: movement.passedGo,
        salaryCollected: movement.passedGo ? GAMEPLAY_POLICY.passGoSalary : 0n,
      }),
    ]),
  };
}
