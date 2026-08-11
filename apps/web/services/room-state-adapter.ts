import type {
  GameplayPublicState,
  GameplayTurnState,
  PublicGameState,
} from "@pootown/game-contracts";

import { boardData, type ColorGroup } from "../configs/board-data.js";
import {
  GameEndReason,
  GameStatus,
  TradeStatus,
  TradeType,
} from "../types/schema.js";
import type { RoomPublicState } from "./game-room-client.js";
import {
  type GameAccount,
  type PlayerAccount,
  type PropertyAccount,
  type TradeInfo,
  type PropertyInfo,
} from "../types/schema.js";

const PLAYER_COLORS = ["#00c8f0", "#ff4d50", "#ffbf00", "#00d696"] as const;
const GAME_STATUS = { waiting: GameStatus.WaitingForPlayers, inProgress: GameStatus.InProgress, finished: GameStatus.Finished };
const TRADE_STATUS_PENDING = TradeStatus.Pending;
const TRADE_TYPES = {
  moneyOnly: TradeType.MoneyOnly,
  propertyOnly: TradeType.PropertyOnly,
  moneyForProperty: TradeType.MoneyForProperty,
  propertyForMoney: TradeType.PropertyForMoney,
};
const GAME_END_REASONS = { bankruptcy: GameEndReason.BankruptcyVictory, timeLimit: GameEndReason.TimeLimit };

export interface RoomUiState {
  readonly gameState: GameAccount;
  readonly players: PlayerAccount[];
  readonly properties: PropertyAccount[];
}

function activeTurnSeat(turn: GameplayTurnState): number {
  return turn.phase === "notStarted" || turn.phase === "finished" ? 0 : turn.currentSeatIndex;
}

function gameplayPlayers(state: GameplayPublicState): PlayerAccount[] {
  const currentSeat = activeTurnSeat(state.turn);
  return state.seats.flatMap((seat) => {
    if (seat === null) return [];
    const isCurrent = seat.seatIndex === currentSeat;
    const propertyPosition = "propertyPosition" in state.turn ? state.turn.propertyPosition : null;
    return [{
      address: seat.playerId,
      wallet: seat.playerId,
      playerColor: PLAYER_COLORS[seat.seatIndex] ?? PLAYER_COLORS[0],
      game: state.gameId,
      cashBalance: seat.cash,
      position: seat.position,
      inJail: seat.inJail,
      jailTurns: seat.jailTurns,
      doublesCount: seat.consecutiveDoubles,
      isBankrupt: seat.status === "eliminated",
      propertiesOwned: [...seat.ownedPropertyPositions],
      getOutOfJailCards: seat.getOutOfJailCards,
      netWorth: seat.cash,
      lastRentCollected: "0",
      festivalBoostTurns: 0,
      hasRolledDice: isCurrent && state.turn.phase !== "awaitingRoll",
      lastDiceRoll: state.lastDice === null ? [] : [state.lastDice.dieOne, state.lastDice.dieTwo],
      needsPropertyAction: isCurrent && state.turn.phase === "awaitingPropertyDecision",
      pendingPropertyPosition: isCurrent ? propertyPosition : null,
      needsChanceCard: isCurrent && state.turn.phase === "awaitingCardDraw" && state.turn.deck === "chance",
      needsCommunityChestCard: isCurrent && state.turn.phase === "awaitingCardDraw" && state.turn.deck === "communityChest",
      needsBankruptcyCheck: isCurrent && state.turn.phase === "awaitingBankruptcy",
      needsSpecialSpaceAction: isCurrent && state.turn.phase === "awaitingTaxPayment",
      pendingSpecialSpacePosition: isCurrent && state.turn.phase === "awaitingTaxPayment"
        ? state.turn.taxKind === "mev" ? 4 : 38
        : null,
      cardDrawnAt: null,
    }];
  });
}

function waitingPlayers(state: PublicGameState): PlayerAccount[] {
  return state.seats.flatMap((seat) => {
    if (seat === null) return [];
    return [{
      address: seat.playerId,
      wallet: seat.playerId,
      playerColor: PLAYER_COLORS[seat.seatIndex] ?? PLAYER_COLORS[0],
      game: state.gameId,
      cashBalance: seat.cash,
      position: seat.position,
      inJail: seat.inJail,
      jailTurns: 0,
      doublesCount: 0,
      isBankrupt: seat.status === "eliminated",
      propertiesOwned: [],
      getOutOfJailCards: 0,
      netWorth: seat.cash,
      lastRentCollected: "0",
      festivalBoostTurns: 0,
      hasRolledDice: false,
      lastDiceRoll: [],
      needsPropertyAction: false,
      pendingPropertyPosition: null,
      needsChanceCard: false,
      needsCommunityChestCard: false,
      needsBankruptcyCheck: false,
      needsSpecialSpaceAction: false,
      pendingSpecialSpacePosition: null,
      cardDrawnAt: null,
    }];
  });
}

function tradeType(type: GameplayPublicState["activeTrades"][number]["tradeType"]): TradeType {
  return TRADE_TYPES[type];
}

function trades(state: GameplayPublicState): TradeInfo[] {
  return state.activeTrades.map((trade) => ({
    id: trade.tradeId,
    proposer: trade.proposerId,
    receiver: trade.receiverId,
    tradeType: tradeType(trade.tradeType),
    proposerMoney: trade.offeredCash,
    receiverMoney: trade.requestedCash,
    proposerProperty: trade.offeredPropertyPosition,
    receiverProperty: trade.requestedPropertyPosition,
    status: TRADE_STATUS_PENDING,
    createdAt: trade.createdAtMs,
    expiresAt: trade.expiresAtMs,
  }));
}

function properties(state: RoomPublicState): PropertyAccount[] {
  const ownership = "rulesetId" in state
    ? state.board.map((space) => ({
        owner: "ownerId" in space ? space.ownerId : null,
        houses: "houses" in space ? space.houses : 0,
        hasHotel: "hasHotel" in space ? space.hasHotel : false,
        isMortgaged: "mortgaged" in space ? space.mortgaged : false,
      }))
    : Array.from({ length: 40 }, () => ({ owner: null, houses: 0, hasHotel: false, isMortgaged: false }));
  return ownership.map((property, position) => mapProperty(property, position, state.gameId));
}

function mapProperty(property: PropertyInfo, position: number, gameId: string): PropertyAccount {
  const space = boardData[position];
  if (space === undefined || space.position !== position) throw new Error("Canonical board data is invalid");
  let propertyType = 3;
  let colorGroup: ColorGroup = "brown";
  let price = 0;
  let rentBase = 0;
  let rentWithColorGroup = 0;
  let rentWithHouses = [0, 0, 0, 0];
  let rentWithHotel = 0;
  let houseCost = 0;
  let mortgageValue = 0;
  if (space.type === "property") {
    propertyType = 0;
    colorGroup = space.colorGroup;
    price = space.price;
    rentBase = space.baseRent;
    rentWithColorGroup = space.rentWithColorGroup;
    rentWithHouses = [space.rentWith1House, space.rentWith2Houses, space.rentWith3Houses, space.rentWith4Houses];
    rentWithHotel = space.rentWithHotel;
    houseCost = space.houseCost;
    mortgageValue = space.mortgageValue;
  } else if (space.type === "railroad") {
    propertyType = 1;
    price = space.price;
    rentBase = space.railroadRent[0];
    mortgageValue = space.mortgageValue;
  } else if (space.type === "utility") {
    propertyType = 2;
    price = space.price;
    rentBase = space.utilityMultiplier[0];
    mortgageValue = space.mortgageValue;
  } else if (space.type === "chance") propertyType = 4;
  else if (space.type === "community-chest") propertyType = 5;
  else if (space.type === "tax") propertyType = 6;
  return {
    address: `${gameId}_property_${position}`,
    position,
    owner: property.owner,
    price,
    colorGroup,
    propertyType,
    houses: property.houses,
    hasHotel: property.hasHotel,
    isMortgaged: property.isMortgaged,
    rentBase,
    rentWithColorGroup,
    rentWithHouses,
    rentWithHotel,
    houseCost,
    mortgageValue,
    lastRentPaid: "0",
  };
}

function gameStatus(state: RoomPublicState): GameStatus {
  if ("rulesetId" in state) return state.terminal === null ? GAME_STATUS.inProgress : GAME_STATUS.finished;
  if (state.lifecycle === "waitingForPlayers") return GAME_STATUS.waiting;
  if (state.lifecycle === "inProgress") return GAME_STATUS.inProgress;
  return GAME_STATUS.finished;
}

function endReason(state: RoomPublicState): GameEndReason | null {
  if (!("rulesetId" in state) || state.terminal === null) return null;
  return state.terminal.reason === "timeLimit" ? GAME_END_REASONS.timeLimit : GAME_END_REASONS.bankruptcy;
}

export function adaptRoomState(state: RoomPublicState): RoomUiState {
  const gameplay = "rulesetId" in state ? state : null;
  const lifecycle = gameplay === null ? state as PublicGameState : null;
  const players = lifecycle === null ? gameplayPlayers(gameplay!) : waitingPlayers(lifecycle);
  const occupiedIds = players.map((player) => player.wallet);
  const currentTurn = lifecycle !== null
    ? lifecycle.turn.phase === "awaitingRoll" ? lifecycle.turn.currentSeatIndex : 0
    : activeTurnSeat((gameplay as GameplayPublicState).turn);
  const terminal = gameplay?.terminal ?? null;
  const adaptedProperties = properties(state);
  return {
    players,
    properties: adaptedProperties,
    gameState: {
      address: state.gameId,
      gameId: state.gameId,
      configId: gameplay?.rulesetId ?? "server-policy",
      creator: "creatorId" in state ? state.creatorId : occupiedIds[0] ?? "unknown",
      bump: 0,
      maxPlayers: "maximumPlayers" in state ? state.maximumPlayers : 4,
      currentPlayers: players.length,
      currentTurn,
      players: occupiedIds,
      playerEliminated: players.map((player) => player.isBankrupt),
      totalPlayers: players.length,
      activePlayers: players.filter((player) => !player.isBankrupt).length,
      gameStatus: gameStatus(state),
      bankBalance: "bankCash" in state ? state.bankCash : "0",
      freeParkingPool: "0",
      housesRemaining: "housesRemaining" in state ? state.housesRemaining : 0,
      hotelsRemaining: "hotelsRemaining" in state ? state.hotelsRemaining : 0,
      winner: terminal?.winnerId ?? null,
      entryFee: 0,
      tokenMint: null,
      tokenVault: null,
      totalPrizePool: 0,
      endConditionMet: terminal !== null,
      prizeClaimed: terminal?.settlementEntitlement.status === "settled",
      endReason: endReason(state),
      activeTrades: gameplay === null ? [] : trades(gameplay),
      nextTradeId: gameplay?.activeTrades.length ?? 0,
      properties: adaptedProperties.map((property) => ({
        owner: property.owner,
        houses: property.houses,
        hasHotel: property.hasHotel,
        isMortgaged: property.isMortgaged,
      })),
      createdAt: "createdAtMs" in state ? state.createdAtMs : 0,
      startedAt: "startedAtMs" in state ? state.startedAtMs : null,
      endedAt: terminal?.endedAtMs ?? ("cancelledAtMs" in state ? state.cancelledAtMs : null),
      gameEndTime: "gameEndAtMs" in state ? state.gameEndAtMs : null,
      timeLimit: null,
      turnStartedAt: state.turn.phase === "notStarted" || state.turn.phase === "finished"
        ? 0
        : state.turn.startedAtMs,
    },
  };
}
