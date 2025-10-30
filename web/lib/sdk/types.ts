import {
  Rpc,
  Address,
  TransactionSigner,
  Instruction,
  GetAccountInfoApi,
  SolanaRpcApi,
} from "@solana/kit";
import {
  BuildingType,
  ChanceCardDrawn,
  CommunityChestCardDrawn,
  TradeType,
  GameStarted,
  PlayerJoined,
  HotelBuilt,
  SpecialSpaceAction,
  HouseBuilt,
  BuildingSold,
  PropertyPurchased,
  RentPaid,
  PropertyMortgaged,
  PropertyUnmortgaged,
  PlayerPassedGo,
  GameEnded,
  TradeCreated,
  TradeAccepted,
  TradeRejected,
  TradeCancelled,
  TradesCleanedUp,
  PlayerBankrupt,
  TaxPaid,
  GameEndConditionMet,
  PlayerLeft,
  GameCancelled,
  PropertyDeclined,
  PrizeClaimed,
} from "./generated";

export interface CreatePlatformParams {
  rpc: Rpc<GetAccountInfoApi>;
  creator: TransactionSigner;
  platformId: Address;
}

export interface CreateGameParams {
  rpc: Rpc<SolanaRpcApi>;
  creator: TransactionSigner;
  platformId: Address;
  entryFee: number;
}

export interface CancelGameParams {
  rpc: Rpc<SolanaRpcApi>;
  creator: TransactionSigner;
  gameAddress: Address;
  isFreeGame: boolean;
  players: Address[];
}

export interface CreateGameIxs {
  instructions: Instruction[];
  gameAccountAddress: Address;
}

export interface JoinGameParams {
  rpc: Rpc<SolanaRpcApi>;
  player: TransactionSigner;
  gameAddress: Address;
}

export interface JoinGameIxs {
  instructions: Instruction[];
  playerStateAddress: Address;
}

export interface LeaveGameParams {
  rpc: Rpc<SolanaRpcApi>;
  player: TransactionSigner;
  gameAddress: Address;
}

export interface StartGameParams {
  rpc: Rpc<SolanaRpcApi>;
  authority: TransactionSigner;
  gameAddress: Address;
  players: Address[];
}

export interface RollDiceParams {
  player: TransactionSigner;
  gameAddress: Address;
  useVrf: boolean;
  diceRoll: number[] | null;
}

export interface EndTurnParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
}

export interface PayJailFineParams {
  player: TransactionSigner;
  gameAddress: Address;
}

export interface UseGetOutOfJailCardParams {
  player: TransactionSigner;
  gameAddress: Address;
}

// Property-related instruction parameters
export interface BuyPropertyParams {
  player: TransactionSigner;
  gameAddress: Address;
  position: number;
}

export interface DeclinePropertyParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
  position: number;
}

export interface MortgagePropertyParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
  position: number;
}

export interface UnmortgagePropertyParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
  position: number;
}

export interface PayRentParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
  position: number;
  propertyOwner: Address;
}

// Building-related instruction parameters
export interface BuildHouseParams {
  player: TransactionSigner;
  gameAddress: Address;
  position: number;
}

export interface BuildHotelParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
  position: number;
}

export interface SellBuildingParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
  position: number;
  buildingType: BuildingType;
}

// Special space instruction parameters
export interface CollectGoParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
}

export interface CollectFreeParkingParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
}

export interface GoToJailParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
}

export interface AttendFestivalParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
}

export interface DrawChanceCardParams {
  player: TransactionSigner;
  gameAddress: Address;
  useVrf: boolean;
  index?: number;
}

export interface DrawChanceCardVrfParams {
  player: TransactionSigner;
  gameAddress: Address;
  index?: number;
}

export interface DrawCommunityChestCardParams {
  player: TransactionSigner;
  gameAddress: Address;
  useVrf: boolean;
  index?: number;
}

// Tax instruction parameters
export interface PayMevTaxParams {
  player: TransactionSigner;
  gameAddress: Address;
}

export interface PayPriorityFeeTaxParams {
  rpc: Rpc<GetAccountInfoApi>;
  player: TransactionSigner;
  gameAddress: Address;
}

// trading
export interface CreateTradeParams {
  proposer: TransactionSigner;
  receiver: Address;
  gameAddress: Address;
  tradeType: TradeType;
  proposerMoney: number;
  receiverMoney: number;
  proposerProperty?: number;
  receiverProperty?: number;
}

export interface AcceptTradeParams {
  accepter: TransactionSigner;
  gameAddress: Address;
  proposer: Address;
  tradeId: number;
}

export interface RejectTradeParams {
  rejecter: TransactionSigner;
  gameAddress: Address;
  tradeId: number;
}

export interface CancelTradeParams {
  canceller: TransactionSigner;
  gameAddress: Address;
  tradeId: number;
}

export interface DeclareBankruptcyParams {
  player: TransactionSigner;
  gameAddress: Address;
  propertiesOwned: number[];
}

export interface EndGameParams {
  caller: TransactionSigner;
  gameAddress: Address;
  players: Address[];
}

export interface ClaimRewardParams {
  // rpc: TransactionSigner;
  winner: TransactionSigner;
  gameAddress: Address;
}

// Complete GameEvent union type with all events from events.rs
export type GameEvent =
  | {
      type: "PlayerLeft";
      signature: string;
      data: PlayerLeft;
    }
  | {
      type: "GameCancelled";
      signature: string;
      data: GameCancelled;
    }
  | {
      type: "ChanceCardDrawn";
      signature: string;
      data: ChanceCardDrawn;
    }
  | {
      type: "CommunityChestCardDrawn";
      signature: string;
      data: CommunityChestCardDrawn;
    }
  | {
      type: "PlayerPassedGo";
      signature: string;
      data: PlayerPassedGo;
    }
  | {
      type: "GameEnded";
      signature: string;
      data: GameEnded;
    }
  | {
      type: "TradeCreated";
      signature: string;
      data: TradeCreated;
    }
  | {
      type: "TradeAccepted";
      signature: string;
      data: TradeAccepted;
    }
  | {
      type: "TradeRejected";
      signature: string;
      data: TradeRejected;
    }
  | {
      type: "TradeCancelled";
      signature: string;
      data: TradeCancelled;
    }
  | {
      type: "TradesCleanedUp";
      signature: string;
      data: TradesCleanedUp;
    }
  | {
      type: "PropertyPurchased";
      signature: string;
      data: PropertyPurchased;
    }
  | {
      type: "PropertyDeclined";
      signature: string;
      data: PropertyDeclined;
    }
  | {
      type: "RentPaid";
      signature: string;
      data: RentPaid;
    }
  | {
      type: "HouseBuilt";
      signature: string;
      data: HouseBuilt;
    }
  | {
      type: "HotelBuilt";
      signature: string;
      data: HotelBuilt;
    }
  | {
      type: "BuildingSold";
      signature: string;
      data: BuildingSold;
    }
  | {
      type: "PropertyMortgaged";
      signature: string;
      data: PropertyMortgaged;
    }
  | {
      type: "PropertyUnmortgaged";
      signature: string;
      data: PropertyUnmortgaged;
    }
  | {
      type: "PlayerJoined";
      signature: string;
      data: PlayerJoined;
    }
  | {
      type: "GameStarted";
      signature: string;
      data: GameStarted;
    }
  | {
      type: "SpecialSpaceAction";
      signature: string;
      data: SpecialSpaceAction;
    }
  | {
      type: "PlayerBankrupt";
      signature: string;
      data: PlayerBankrupt;
    }
  | {
      type: "TaxPaid";
      signature: string;
      data: TaxPaid;
    }
  | {
      type: "GameEndConditionMet";
      signature: string;
      data: GameEndConditionMet;
    }
  | {
      type: "PrizeClaimed";
      signature: string;
      data: PrizeClaimed;
    };
