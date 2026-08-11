import type { GameplayCardCommand } from "../commands/gameplay-command";
import type { ActiveGameplayAggregateState, ActiveGameplayAggregateTurn } from "../model/gameplay-aggregate-state";
import { isValidActiveGameplayAggregateState } from "../model/gameplay-aggregate-state";
import { MAX_STATE_VERSION } from "../model/game-state";
import type { RandomSource } from "../ports/random-source";
import { resolveCard, type CardDeck } from "./card-rules";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import {
  activeGameplayPlayer,
  createClockedGameplayTurn,
  createGameplayLandingTurn,
  freezeActiveGameplayState,
  type GameplayTransitionContext,
  type GameplayTransitionResult,
} from "./gameplay-turn-transition";
import {
  canResumeGameplayCheckpoint,
  forkGameplayRandomSource,
  isAdvancedGameplayCheckpoint,
  readRandomCheckpoint,
} from "./gameplay-random-support";

const CARD_COUNT = 5;
const MAXIMUM_REJECTION_DRAWS = 32;

function reject(
  state: ActiveGameplayAggregateState,
  code: "INVALID_COMMAND" | "INVALID_STATE" | "STALE_STATE_VERSION" | "UNAUTHORIZED_ACTOR" | "INVALID_PHASE",
  message: string,
  retryable = false,
): GameplayTransitionResult {
  return { ok: false, state, error: { code, message, retryable } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function commandDeck(command: GameplayCardCommand): CardDeck | null {
  if (command.type === "drawChanceCard") return "chance";
  if (command.type === "drawCommunityChestCard") return "communityChest";
  return command.payload.deck === "chance" || command.payload.deck === "communityChest"
    ? command.payload.deck
    : null;
}

function validCommand(command: GameplayCardCommand): boolean {
  if (!isPlainObject(command)) return false;
  const keys = Object.keys(command);
  if (
    keys.length !== 3 ||
    !keys.includes("type") ||
    !keys.includes("expectedStateVersion") ||
    !keys.includes("payload") ||
    !isPlainObject(command.payload) ||
    !Number.isInteger(command.expectedStateVersion) ||
    command.expectedStateVersion < 0
  ) return false;
  if (command.type === "drawChanceCard" || command.type === "drawCommunityChestCard") {
    return Object.keys(command.payload).length === 0;
  }
  return command.type === "resolveRandomCard" &&
    Object.keys(command.payload).length === 1 &&
    Object.hasOwn(command.payload, "deck") &&
    (command.payload.deck === "chance" || command.payload.deck === "communityChest");
}

function drawCardId(randomSource: RandomSource): { readonly cardId: number; readonly bytesConsumed: number } | null {
  for (let attempt = 1; attempt <= MAXIMUM_REJECTION_DRAWS; attempt += 1) {
    let bytes: Uint8Array;
    try {
      bytes = randomSource.nextBytes(1);
    } catch {
      return null;
    }
    if (!(bytes instanceof Uint8Array) || bytes.length !== 1) return null;
    const byte = bytes[0];
    if (byte !== undefined && byte < 255) {
      return { cardId: (byte % CARD_COUNT) + 1, bytesConsumed: attempt };
    }
  }
  return null;
}

function continuationTurn(
  state: ActiveGameplayAggregateState,
  position: number,
  nowMs: number,
  moved: boolean,
): ActiveGameplayAggregateTurn | null {
  const rolledDoubles = state.lastDice?.isDoubles === true;
  if (moved) {
    return createGameplayLandingTurn(state, position, state.turn.currentSeatIndex, nowMs, rolledDoubles);
  }
  return createClockedGameplayTurn(rolledDoubles ? "awaitingRoll" : "awaitingEndTurn", state.turn.currentSeatIndex, nowMs);
}

/** Resolves a pending card draw from isolated server-owned randomness. */
export function transitionGameplayCard(
  state: ActiveGameplayAggregateState,
  command: GameplayCardCommand,
  context: GameplayTransitionContext,
): GameplayTransitionResult {
  if (!isValidActiveGameplayAggregateState(state)) {
    return reject(state, "INVALID_STATE", "gameplay aggregate is invalid");
  }
  if (!validCommand(command) || !Number.isSafeInteger(context.nowMs) || context.nowMs < state.turn.startedAtMs) {
    return reject(state, "INVALID_COMMAND", "command context is invalid");
  }
  if (command.expectedStateVersion !== state.stateVersion) {
    return reject(state, "STALE_STATE_VERSION", "expected state version is stale", true);
  }
  if (state.stateVersion >= MAX_STATE_VERSION) {
    return reject(state, "INVALID_STATE", "state version cannot advance");
  }
  const current = activeGameplayPlayer(state);
  if (current === null) return reject(state, "INVALID_STATE", "turn does not reference an active player");
  const deck = commandDeck(command);
  if (deck === null) return reject(state, "INVALID_COMMAND", "card deck is invalid");
  const authorized = command.type === "resolveRandomCard"
    ? context.actor.kind === "internal"
    : context.actor.kind === "player" && context.actor.playerId === current.playerId;
  if (!authorized) return reject(state, "UNAUTHORIZED_ACTOR", "actor cannot execute this card command");
  if (state.turn.phase !== "awaitingCardDraw" || state.turn.deck !== deck) {
    return reject(state, "INVALID_PHASE", "card command does not match the pending deck");
  }

  const commandRandomSource = forkGameplayRandomSource(context.randomSource, state.rng);
  if (commandRandomSource === null) return reject(state, "INVALID_STATE", "random source cannot fork the persisted checkpoint");
  const draw = drawCardId(commandRandomSource);
  if (draw === null) return reject(state, "INVALID_STATE", "random source failed to select a card");
  const nextCheckpoint = readRandomCheckpoint(commandRandomSource);
  if (
    nextCheckpoint === null ||
    !isAdvancedGameplayCheckpoint(state.rng, nextCheckpoint, draw.bytesConsumed) ||
    !canResumeGameplayCheckpoint(commandRandomSource, nextCheckpoint)
  ) return reject(state, "INVALID_STATE", "random source returned an invalid checkpoint");

  const joinedPlayerCount = state.players.filter((player) => player !== null).length;
  const resolution = resolveCard(deck, draw.cardId, current, joinedPlayerCount);
  if (!resolution.ok) return reject(state, "INVALID_STATE", `card resolution failed: ${resolution.code}`);
  const players = state.players.map((player, index) => player === null ? null : index === current.seatIndex
    ? { ...player, ...resolution.state }
    : player);
  const cardEvent = Object.freeze({
    type: "cardDrawn" as const,
    playerId: current.playerId,
    deck,
    cardId: resolution.card.id,
    effect: resolution.card.effect,
  });

  if (resolution.bankruptcyRequired) {
    const turn = createClockedGameplayTurn("awaitingBankruptcy", current.seatIndex, context.nowMs);
    if (turn === null) return reject(state, "INVALID_STATE", "bankruptcy deadline exceeds limits");
    return {
      ok: true,
      state: freezeActiveGameplayState(state, {
        stateVersion: state.stateVersion + 1,
        players,
        turn,
        bankruptcyRequiredSeatIndex: current.seatIndex,
        rng: nextCheckpoint,
      }),
      events: Object.freeze([cardEvent]),
    };
  }

  const turn = continuationTurn(state, resolution.state.position, context.nowMs, resolution.movement !== null);
  if (turn === null) return reject(state, "INVALID_STATE", "card follow-up landing cannot be resolved");
  const events = resolution.movement === null
    ? [cardEvent]
    : [
        cardEvent,
        Object.freeze({
          type: "playerMoved" as const,
          playerId: current.playerId,
          fromPosition: resolution.movement.from,
          toPosition: resolution.movement.to,
          passedGo: resolution.movement.passedGo,
          salaryCollected: resolution.movement.passedGo ? GAMEPLAY_POLICY.passGoSalary : 0n,
        }),
      ];
  return {
    ok: true,
    state: freezeActiveGameplayState(state, {
      stateVersion: state.stateVersion + 1,
      players,
      turn,
      rng: nextCheckpoint,
    }),
    events: Object.freeze(events),
  };
}
