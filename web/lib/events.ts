import {
  Option,
  type Address,
} from '@solana/kit';
import { GameEndReason, TradeType } from './sdk/generated';

export type BuildingSold = {
  game: Address;
  player: Address;
  propertyPosition: number;
  buildingType: string;
  salePrice: bigint;
  timestamp: bigint;
};

export type ChanceCardDrawn = {
  player: Address;
  game: Address;
  cardIndex: number;
  effectType: number;
  amount: number;
  timestamp: bigint;
};

export type CommunityChestCardDrawn = {
  player: Address;
  game: Address;
  cardIndex: number;
  effectType: number;
  amount: number;
  timestamp: bigint;
};

export type GameCancelled = {
  game: Address;
  creator: Address;
  playersCount: number;
  refundAmount: bigint;
  timestamp: bigint;
};

export type GameEndConditionMet = {
  game: Address;
  reason: GameEndReason;
  timestamp: bigint;
};

export type GameEnded = {
  game: Address;
  winner: Option<Address>;
  reason: GameEndReason;
  winnerNetWorth: Option<bigint>;
  endedAt: bigint;
};


export type GameStarted = {
  game: Address;
  totalPlayers: number;
  firstPlayer: Address;
  timestamp: bigint;
};

export type HotelBuilt = {
  game: Address;
  player: Address;
  propertyPosition: number;
  cost: bigint;
  timestamp: bigint;
};

export type HouseBuilt = {
  game: Address;
  player: Address;
  propertyPosition: number;
  houseCount: number;
  cost: bigint;
  timestamp: bigint;
};

export type PlayerBankrupt = {
  game: Address;
  player: Address;
  liquidationValue: bigint;
  cashTransferred: bigint;
  timestamp: bigint;
};

export type PlayerJoined = {
  game: Address;
  player: Address;
  playerIndex: number;
  totalPlayers: number;
  timestamp: bigint;
};

export type PlayerLeft = {
  game: Address;
  player: Address;
  refundAmount: bigint;
  remainingPlayers: number;
  timestamp: bigint;
};

export type PlayerPassedGo = {
  game: Address;
  player: Address;
  salaryCollected: bigint;
  newPosition: number;
  timestamp: bigint;
};

export type PrizeClaimed = {
  game: Address;
  winner: Address;
  prizeAmount: bigint;
  claimedAt: bigint;
};


export type PropertyDeclined = {
  game: Address;
  player: Address;
  propertyPosition: number;
  price: bigint;
  timestamp: bigint;
};


export type PropertyMortgaged = {
  game: Address;
  player: Address;
  propertyPosition: number;
  mortgageValue: bigint;
  timestamp: bigint;
};

export type PropertyPurchased = {
  game: Address;
  player: Address;
  propertyPosition: number;
  price: bigint;
  timestamp: bigint;
};

export type PropertyUnmortgaged = {
  game: Address;
  player: Address;
  propertyPosition: number;
  unmortgageCost: bigint;
  timestamp: bigint;
};

export type RentPaid = {
  game: Address;
  payer: Address;
  owner: Address;
  propertyPosition: number;
  amount: bigint;
  timestamp: bigint;
};

export type SpecialSpaceAction = {
  game: Address;
  player: Address;
  spaceType: number;
  position: number;
  timestamp: bigint;
};

export type TaxPaid = {
  game: Address;
  player: Address;
  taxType: number;
  amount: bigint;
  position: number;
  timestamp: bigint;
};


export type TradeAccepted = {
  game: Address;
  tradeId: number;
  proposer: Address;
  receiver: Address;
  accepter: Address;
};

export type TradeCancelled = {
  game: Address;
  tradeId: number;
  proposer: Address;
  receiver: Address;
  canceller: Address;
};


export type TradeCreated = {
  game: Address;
  tradeId: number;
  proposer: Address;
  receiver: Address;
  tradeType: TradeType;
  proposerMoney: bigint;
  receiverMoney: bigint;
  proposerProperty: Option<number>;
  receiverProperty: Option<number>;
  expiresAt: bigint;
};

export type TradeRejected = {
  game: Address;
  tradeId: number;
  proposer: Address;
  receiver: Address;
  rejecter: Address;
};


export type TradesCleanedUp = {
  game: Address;
  tradesRemoved: number;
  remainingTrades: number;
};