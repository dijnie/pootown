import { TaxSpace } from "@/configs/board-data";
import type { PropertyAccount } from "@/types/schema";

type GameLogType =
  | "BuildingSold"
  | "ChanceCardDrawn"
  | "CommunityChestCardDrawn"
  | "GameCancelled"
  | "GameEndConditionMet"
  | "GameEnded"
  | "GameStarted"
  | "HotelBuilt"
  | "HouseBuilt"
  | "PlayerBankrupt"
  | "PlayerJoined"
  | "PlayerLeft"
  | "PlayerPassedGo"
  | "PrizeClaimed"
  | "PropertyDeclined"
  | "PropertyMortgaged"
  | "PropertyPurchased"
  | "PropertyUnmortgaged"
  | "RentPaid"
  | "SpecialSpaceAction"
  | "TaxPaid"
  | "TradeAccepted"
  | "TradeCancelled"
  | "TradeCreated"
  | "TradeRejected"
  | "TradesCleanedUp";

export interface BaseSpaceProps {
  position: number;
  rotate?: "left" | "top" | "right";
  onClick?: (position: number) => void;
  onChainProperty?: PropertyAccount | null;
}

export type TaxSpaceProps = BaseSpaceProps & TaxSpace;

export interface CornerSpaceProps extends BaseSpaceProps {
  name: string;
  type: "go" | "jail" | "free-parking" | "go-to-jail";
  instructions?: string;
}

export interface CardData {
  id: number;
  title: string;
  description: string;
  action: string;
  value: number;
}

export interface GameLogEntry {
  id: string;
  gameId: string;
  timestamp: number;
  type: GameLogType;
  signature: string;
  // type:
  //   | "move"
  //   | "purchase"
  //   | "rent"
  //   | "card"
  //   | "jail"
  //   | "bankruptcy"
  //   | "turn"
  //   | "dice"
  //   | "building"
  //   | "trade"
  //   | "game"
  //   | "skip"
  //   | "join"
  //   | "leave";
  playerId: string;
  playerName?: string;
  // Removed message field - now generated dynamically
  details?: {
    // Property-related
    propertyName?: string;
    position?: number;
    price?: number | string;
    houseCount?: number;

    // payRent
    owner?: string;

    // Card-related
    cardType?: "chance" | "community-chest";
    cardTitle?: string;
    cardDescription?: string;
    cardIndex?: number;
    effectType?: number;
    amount?: number | string;

    // Trade-related
    tradeId?: string;
    action?: string;
    targetPlayer?: string;
    // targetPlayerName?: string;
    offeredProperties?: number | null;
    requestedProperties?: number | null;
    offeredMoney?: number | string;
    requestedMoney?: number | string;
    // clear trades:
    remainingTrades?: number;

    // Movement-related
    fromPosition?: number;
    toPosition?: number;
    diceRoll?: [number, number];
    doublesCount?: number;
    passedGo?: boolean;

    // Jail-related
    jailReason?: "doubles" | "go_to_jail" | "card";
    fineAmount?: number;

    // Building-related
    buildingType?: "house" | "hotel";

    // Tax-related
    taxType?: string;

    // bankruptcy
    liquidationValue?: number | string;
    cashTransferred?: number | string;

    // special spaces
    spaceType?: number;

    // end game
    winner?: string | null;
    winnerNetWorth?: number | string;

    // claim prize
    prizeAmount?: number;

    // other
    error?: string;
  };
}
