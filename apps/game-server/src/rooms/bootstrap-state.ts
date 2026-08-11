import {
  DEFAULT_TURN_TIMEOUT_MS,
  GAMEPLAY_RULESET_ID,
  GAME_SCHEMA_VERSION,
  MAXIMUM_PLAYERS,
  MINIMUM_PLAYERS,
  STARTING_BANK_CASH,
  STARTING_MATCH_CASH,
  gameId,
  matchCash,
  parseSnapshot,
  playerId,
  serializeSnapshot,
  type GameState,
  type RandomSource,
  type WaitingGameState,
} from "@pootown/game-core";
import type { SessionBootstrapResponse } from "@pootown/game-contracts/internal";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function createWaitingState(
  bootstrap: SessionBootstrapResponse,
  randomSource: RandomSource,
): WaitingGameState {
  if (bootstrap.lifecycle !== "open" || bootstrap.stateVersion !== 0 || bootstrap.startedAtMs !== null) {
    throw new Error("Only a pristine open session can be initialized without a checkpoint");
  }
  const seats: WaitingGameState["seats"] = Array.from({ length: MAXIMUM_PLAYERS }, () => null);
  for (const player of bootstrap.players) {
    (seats as Array<WaitingGameState["seats"][number]>)[player.seatIndex] = {
      seatIndex: player.seatIndex,
      playerId: playerId(player.playerId),
      status: "active",
      cash: matchCash(STARTING_MATCH_CASH),
      position: 0,
      inJail: false,
      joinedAtMs: player.joinedAtMs,
    };
  }
  const state: WaitingGameState = {
    schemaVersion: GAME_SCHEMA_VERSION,
    rulesetId: GAMEPLAY_RULESET_ID,
    stateVersion: 1,
    gameId: gameId(bootstrap.gameId),
    creatorId: playerId(bootstrap.creatorPlayerId),
    lifecycle: "waitingForPlayers",
    minimumPlayers: MINIMUM_PLAYERS,
    maximumPlayers: bootstrap.maximumPlayers,
    seats,
    bankCash: matchCash(STARTING_BANK_CASH),
    freeParkingPool: matchCash(0n),
    housesRemaining: 32,
    hotelsRemaining: 12,
    createdAtMs: bootstrap.createdAtMs,
    startedAtMs: null,
    cancelledAtMs: null,
    timeLimitMs: bootstrap.timeLimitMs,
    gameEndAtMs: null,
    turnTimeoutMs: DEFAULT_TURN_TIMEOUT_MS,
    turn: { phase: "notStarted" },
    rng: randomSource.checkpoint(),
  };
  return deepFreeze(parseSnapshot(serializeSnapshot(state as GameState))) as WaitingGameState;
}
