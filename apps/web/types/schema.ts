import type { ColorGroup } from "@/configs/board-data";

export enum GameStatus {
  WaitingForPlayers,
  InProgress,
  Finished,
}

export enum TradeStatus {
  Pending,
  Accepted,
  Rejected,
  Cancelled,
  Expired,
}

export enum TradeType {
  MoneyOnly,
  PropertyOnly,
  MoneyForProperty,
  PropertyForMoney,
}

export enum GameEndReason {
  BankruptcyVictory,
  TimeLimit,
}

export enum BuildingType {
  House,
  Hotel,
}

export enum PropertyType {
  Street,
  Railroad,
  Utility,
  Corner,
  Chance,
  CommunityChest,
  Tax,
}

export interface GameAccount {
  gameId: number | string;
  rulesetId: string;
  creator: string;
  maxPlayers: number;
  currentPlayers: number;
  currentTurn: number;
  players: string[];
  playerEliminated: boolean[];
  totalPlayers: number;
  activePlayers: number;
  gameStatus: GameStatus;
  bankBalance: string;
  freeParkingPool: string;
  housesRemaining: number;
  hotelsRemaining: number;
  winner: string | null;
  settlementCompleted: boolean;
  endReason: GameEndReason | null;
  activeTrades: TradeInfo[];
  nextTradeId: number;
  properties: PropertyInfo[];
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  gameEndTime: number | null;
  timeLimit: number | null;
  turnStartedAt: number;
}

export interface PlayerAccount {
  playerId: string;
  playerColor: string;
  gameId: string;
  cashBalance: string;
  position: number;
  inJail: boolean;
  jailTurns: number;
  doublesCount: number;
  isBankrupt: boolean;
  propertiesOwned: number[];
  getOutOfJailCards: number;
  netWorth: string;
  lastRentCollected: string;
  festivalBoostTurns: number;
  hasRolledDice: boolean;
  lastDiceRoll: number[];
  needsPropertyAction: boolean;
  pendingPropertyPosition: number | null;
  needsChanceCard: boolean;
  needsCommunityChestCard: boolean;
  needsBankruptcyCheck: boolean;
  needsSpecialSpaceAction: boolean;
  pendingSpecialSpacePosition: number | null;
  cardDrawnAt: number | null;
}

export interface PropertyAccount {
  propertyId: string;
  position: number;
  owner: string | null;
  price: number;
  colorGroup: ColorGroup;
  propertyType: PropertyType;
  houses: number;
  hasHotel: boolean;
  isMortgaged: boolean;
  rentBase: number;
  rentWithColorGroup: number;
  rentWithHouses: number[];
  rentWithHotel: number;
  houseCost: number;
  mortgageValue: number;
  lastRentPaid: string;
}

export interface TradeOffer {
  money: string;
  property: number | null;
}

export type TradeInfo = {
  id: number | string;
  proposer: string;
  receiver: string;
  tradeType: TradeType;
  proposerMoney: number | string;
  receiverMoney: number | string;
  proposerProperty: number | null;
  receiverProperty: number | null;
  status: TradeStatus;
  createdAt: number | string;
  expiresAt: number | string;
};

export type PropertyInfo = {
  owner: string | null;
  houses: number;
  hasHotel: boolean;
  isMortgaged: boolean;
};
