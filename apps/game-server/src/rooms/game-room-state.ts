import { schema } from "@colyseus/schema";
import {
  GameplayPublicStateSchema,
  PublicGameStateSchema,
  type GameplayPublicState,
  type PublicGameState,
} from "@pootown/game-contracts";
import {
  BOARD_SPACES,
  activeSeats,
  isValidActiveGameplayAggregateState,
  isValidFinishedGameplayAggregateState,
  occupiedSeats,
  parseSnapshot,
  serializeSnapshot,
  type GameState,
  type GameplayAggregateState,
} from "@pootown/game-core";

export type RoomPublicState = PublicGameState | GameplayPublicState;

export const GameRoomState = schema({
  stateVersion: "number",
  publicStateJson: "string",
});

export type GameRoomStateInstance = InstanceType<typeof GameRoomState> & {
  publicStateJson: string;
  stateVersion: number;
};

function publicLifecycleState(state: GameState): PublicGameState {
  const canonical = parseSnapshot(serializeSnapshot(state));
  const seats = canonical.seats.map((seat) => seat === null ? null : {
    seatIndex: seat.seatIndex,
    playerId: seat.playerId,
    status: seat.status,
    cash: seat.cash.toString(),
    position: seat.position,
    inJail: seat.inJail,
  });
  return PublicGameStateSchema.parse({
    schemaVersion: 1,
    stateVersion: canonical.stateVersion,
    gameId: canonical.gameId,
    creatorId: canonical.creatorId,
    lifecycle: canonical.lifecycle,
    minimumPlayers: canonical.minimumPlayers,
    maximumPlayers: canonical.maximumPlayers,
    seats,
    currentPlayers: occupiedSeats(canonical).length,
    activePlayers: activeSeats(canonical).length,
    bankCash: canonical.bankCash.toString(),
    housesRemaining: canonical.housesRemaining,
    hotelsRemaining: canonical.hotelsRemaining,
    createdAtMs: canonical.createdAtMs,
    startedAtMs: canonical.startedAtMs,
    cancelledAtMs: canonical.cancelledAtMs,
    gameEndAtMs: canonical.gameEndAtMs,
    turn: canonical.turn,
  });
}

function publicGameplayState(state: GameplayAggregateState): GameplayPublicState {
  if (!isValidActiveGameplayAggregateState(state) && !isValidFinishedGameplayAggregateState(state)) {
    throw new Error("Gameplay state is invalid");
  }
  const seats = state.players.map((player) => player === null ? null : ({
    seatIndex: player.seatIndex,
    playerId: player.playerId,
    status: player.status,
    cash: player.cash.toString(),
    position: player.position,
    inJail: player.inJail,
    jailTurns: player.jailTurns,
    consecutiveDoubles: player.consecutiveDoubles,
    missedTurns: player.missedTurns,
    getOutOfJailCards: player.getOutOfJailCards,
    ownedPropertyPositions: state.properties.flatMap((property) =>
      property.ownerSeatIndex === player.seatIndex ? [property.position] : []),
  }));
  const board = BOARD_SPACES.map((definition, position) => {
    const property = state.properties[position];
    if (property === undefined) throw new Error("Gameplay property state is incomplete");
    if (definition.propertyType === "street" ||
        definition.propertyType === "railroad" ||
        definition.propertyType === "utility") {
      const owner = property.ownerSeatIndex === null ? null : state.players[property.ownerSeatIndex];
      if (property.ownerSeatIndex !== null && owner === null) {
        throw new Error("Gameplay property owner is not seated");
      }
      return {
        position,
        kind: definition.propertyType,
        ownerId: owner?.playerId ?? null,
        mortgaged: property.mortgaged,
        houses: property.houses,
        hasHotel: property.hasHotel,
      };
    }
    return { position, kind: definition.propertyType };
  });
  const activeTrades = state.activeTrades.map((trade) => {
    const proposer = state.players[trade.proposerSeatIndex];
    const receiver = state.players[trade.receiverSeatIndex];
    if (proposer === null || proposer === undefined || receiver === null || receiver === undefined) {
      throw new Error("Gameplay trade participant is not seated");
    }
    const terms = trade.terms;
    return {
      tradeId: trade.tradeId,
      tradeType: terms.tradeType,
      proposerId: proposer.playerId,
      receiverId: receiver.playerId,
      offeredCash: ("offeredCash" in terms ? terms.offeredCash : 0n).toString(),
      requestedCash: ("requestedCash" in terms ? terms.requestedCash : 0n).toString(),
      offeredPropertyPosition: "offeredPropertyPosition" in terms ? terms.offeredPropertyPosition : null,
      requestedPropertyPosition: "requestedPropertyPosition" in terms ? terms.requestedPropertyPosition : null,
      status: "pending" as const,
      createdAtMs: trade.createdAtMs,
      expiresAtMs: trade.expiresAtMs,
    };
  });
  const terminal = state.terminal === null ? null : (() => {
    const winner = state.players[state.terminal.winnerSeatIndex];
    if (winner === null || winner === undefined) throw new Error("Terminal winner is not seated");
    return {
      reason: state.terminal.reason,
      winnerId: winner.playerId,
      endedAtMs: state.terminal.endedAtMs,
      ranking: state.terminal.ranking.map((entry) => {
        const player = state.players[entry.seatIndex];
        if (player === null || player === undefined) throw new Error("Terminal ranking player is not seated");
        return {
          rank: entry.rank,
          seatIndex: entry.seatIndex,
          playerId: player.playerId,
          netWorth: entry.netWorth.toString(),
        };
      }),
      settlementEntitlement: {
        winnerId: winner.playerId,
        status: state.terminal.settlementEntitlement.status,
      },
    };
  })();
  return GameplayPublicStateSchema.parse({
    schemaVersion: 1,
    stateVersion: state.stateVersion,
    gameId: state.gameId,
    rulesetId: state.rulesetId,
    seats,
    board,
    turn: state.turn.phase === "finished"
      ? state.turn
      : Object.fromEntries(Object.entries(state.turn).filter(([key]) => key !== "emittedWarnings")),
    activeTrades,
    lastDice: state.lastDice === null ? null : {
      dieOne: state.lastDice.dice[0],
      dieTwo: state.lastDice.dice[1],
      total: state.lastDice.total,
      isDoubles: state.lastDice.isDoubles,
    },
    terminal,
  });
}

export function toRoomPublicState(state: GameState | GameplayAggregateState): RoomPublicState {
  return "players" in state ? publicGameplayState(state) : publicLifecycleState(state);
}

export function createGameRoomState(state: GameState | GameplayAggregateState): GameRoomStateInstance {
  const publicState = toRoomPublicState(state);
  const roomState = new GameRoomState() as GameRoomStateInstance;
  roomState.stateVersion = publicState.stateVersion;
  roomState.publicStateJson = JSON.stringify(publicState);
  return roomState;
}

export function updateGameRoomState(
  roomState: GameRoomStateInstance,
  state: GameState | GameplayAggregateState,
): RoomPublicState {
  const publicState = toRoomPublicState(state);
  roomState.stateVersion = publicState.stateVersion;
  roomState.publicStateJson = JSON.stringify(publicState);
  return publicState;
}
