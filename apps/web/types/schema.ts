import { ColorGroup, boardData } from "@/configs/board-data";
import { PLAYER_COLORS } from "@/configs/constants";
import {
  GameState,
  PlayerState,
  // PropertyState,
  GameStatus,
  // PropertyType,
  TradeStatus,
  TradeType,
  TradeInfo as GeneratedTradeInfo,
  GameEndReason,
} from "@/lib/sdk/generated";
// import { ColorGroup as GeneratedColorGroup } from "@/lib/sdk/generated";
import {
  isSome,
  type Address,
  type Option,
  type ReadonlyUint8Array,
} from "@solana/kit";

export enum PropertyType {
  Street,
  Railroad,
  Utility,
  Corner,
  Chance,
  CommunityChest,
  Tax,
}

export enum GeneratedColorGroup {
  Brown,
  LightBlue,
  Pink,
  Orange,
  Red,
  Yellow,
  Green,
  DarkBlue,
  Railroad,
  Utility,
  Special,
}

export interface GameAccount {
  address: string;
  gameId: number | string;
  configId: string;
  creator: string;
  bump: number;
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

  entryFee: number;
  tokenMint: string | null;
  tokenVault: string | null;
  totalPrizePool: number;

  endConditionMet: boolean;
  prizeClaimed: boolean;

  endReason: GameEndReason | null;

  activeTrades: TradeInfo[];
  nextTradeId: number;

  properties: PropertyInfo[];

  // times
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  gameEndTime: number | null;
  timeLimit: number | null;
  turnStartedAt: number;
}

export interface PlayerAccount {
  address: string;
  wallet: string;
  playerColor: string;
  game: string;
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
  address: string;
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
  id: number;
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

function optionToNullable<T>(option: Option<T>): T | null {
  return isSome(option) ? option.value : null;
}

function bigintToString(value: bigint): string {
  return value.toString();
}

function bigintToNumber(value: bigint): number {
  return Number(value);
}

function uint8ArrayToNumbers(uint8Array: ReadonlyUint8Array): number[] {
  return Array.from(uint8Array);
}

function addressToString(address: Address): string {
  return address.toString();
}

export function mapGameStateToAccount(
  gameState: GameState,
  address: Address
): GameAccount {
  return {
    address: addressToString(address),
    gameId: bigintToString(gameState.gameId),
    configId: addressToString(gameState.configId),
    creator: addressToString(gameState.creator),
    bump: gameState.bump,
    maxPlayers: gameState.maxPlayers,
    currentPlayers: gameState.currentPlayers,
    currentTurn: gameState.currentTurn,
    players: gameState.players.map(addressToString),
    playerEliminated: gameState.playerEliminated,
    totalPlayers: gameState.totalPlayers,
    activePlayers: gameState.activePlayers,
    gameStatus: gameState.gameStatus,
    bankBalance: bigintToString(gameState.bankBalance),
    freeParkingPool: bigintToString(gameState.freeParkingPool),
    housesRemaining: gameState.housesRemaining,
    hotelsRemaining: gameState.hotelsRemaining,
    winner: optionToNullable(gameState.winner)
      ? addressToString(optionToNullable(gameState.winner)!)
      : null,

    entryFee: bigintToNumber(gameState.entryFee),
    tokenMint: optionToNullable(gameState.tokenMint),
    tokenVault: optionToNullable(gameState.tokenVault),
    totalPrizePool: bigintToNumber(gameState.totalPrizePool),

    endConditionMet: gameState.endConditionMet,
    prizeClaimed: gameState.prizeClaimed,

    endReason: optionToNullable(gameState.endReason),

    activeTrades: gameState.activeTrades.map(mapTradeInfoToAccount),
    nextTradeId: gameState.nextTradeId,

    properties: gameState.properties.map((prop) => ({
      owner: optionToNullable(prop.owner),
      houses: prop.houses,
      hasHotel: prop.hasHotel,
      isMortgaged: prop.isMortgaged,
    })),

    // time
    createdAt: bigintToNumber(gameState.createdAt),
    startedAt: optionToNullable(gameState.startedAt)
      ? bigintToNumber(optionToNullable(gameState.startedAt)!)
      : null,
    endedAt: optionToNullable(gameState.endedAt)
      ? bigintToNumber(optionToNullable(gameState.endedAt)!)
      : null,
    turnStartedAt: bigintToNumber(gameState.turnStartedAt),
    timeLimit: Number(gameState.timeLimit),
    gameEndTime: optionToNullable(gameState.gameEndTime)
      ? bigintToNumber(optionToNullable(gameState.gameEndTime)!)
      : null,
  };
}

export function mapPlayerStateToAccount(
  playerState: PlayerState,
  address: Address,
  index?: number
): PlayerAccount {
  return {
    address: addressToString(address),
    playerColor: PLAYER_COLORS[index ?? 0],
    wallet: addressToString(playerState.wallet),
    game: addressToString(playerState.game),
    cashBalance: bigintToString(playerState.cashBalance),
    position: playerState.position,
    inJail: playerState.inJail,
    jailTurns: playerState.jailTurns,
    doublesCount: playerState.doublesCount,
    isBankrupt: playerState.isBankrupt,
    propertiesOwned: uint8ArrayToNumbers(playerState.propertiesOwned),
    getOutOfJailCards: playerState.getOutOfJailCards,
    netWorth: bigintToString(playerState.netWorth),
    lastRentCollected: bigintToString(playerState.lastRentCollected),
    festivalBoostTurns: playerState.festivalBoostTurns,
    hasRolledDice: playerState.hasRolledDice,
    lastDiceRoll: uint8ArrayToNumbers(playerState.lastDiceRoll),
    needsPropertyAction: playerState.needsPropertyAction,
    pendingPropertyPosition: optionToNullable(
      playerState.pendingPropertyPosition
    ),
    needsChanceCard: playerState.needsChanceCard,
    needsCommunityChestCard: playerState.needsCommunityChestCard,
    needsBankruptcyCheck: playerState.needsBankruptcyCheck,
    needsSpecialSpaceAction: playerState.needsSpecialSpaceAction,
    pendingSpecialSpacePosition: optionToNullable(
      playerState.pendingSpecialSpacePosition
    ),
    cardDrawnAt: optionToNullable(playerState.cardDrawnAt)
      ? bigintToNumber(optionToNullable(playerState.cardDrawnAt)!)
      : null,
  };
}

function mapGeneratedColorGroupToFrontend(
  colorGroup: GeneratedColorGroup
): ColorGroup {
  switch (colorGroup) {
    case GeneratedColorGroup.Brown:
      return "brown";
    case GeneratedColorGroup.LightBlue:
      return "lightBlue";
    case GeneratedColorGroup.Pink:
      return "pink";
    case GeneratedColorGroup.Orange:
      return "orange";
    case GeneratedColorGroup.Red:
      return "red";
    case GeneratedColorGroup.Yellow:
      return "yellow";
    case GeneratedColorGroup.Green:
      return "green";
    case GeneratedColorGroup.DarkBlue:
      return "darkBlue";
    // Note: Railroad, Utility, and Special don't have direct mappings in frontend ColorGroup
    // You may need to handle these cases based on your business logic
    case GeneratedColorGroup.Railroad:
    case GeneratedColorGroup.Utility:
    case GeneratedColorGroup.Special:
    default:
      // Fallback to brown for unmapped cases
      return "brown";
  }
}

// export function mapPropertyStateToAccount(
//   propertyState: PropertyState,
//   address: Address
// ): PropertyAccount {
//   return {
//     address: addressToString(address),
//     position: propertyState.position,
//     owner: optionToNullable(propertyState.owner)
//       ? addressToString(optionToNullable(propertyState.owner)!)
//       : null,
//     price: propertyState.price,
//     colorGroup: mapGeneratedColorGroupToFrontend(propertyState.colorGroup),
//     propertyType: propertyState.propertyType,
//     houses: propertyState.houses,
//     hasHotel: propertyState.hasHotel,
//     isMortgaged: propertyState.isMortgaged,
//     rentBase: propertyState.rentBase,
//     rentWithColorGroup: propertyState.rentWithColorGroup,
//     rentWithHouses: propertyState.rentWithHouses,
//     rentWithHotel: propertyState.rentWithHotel,
//     houseCost: propertyState.houseCost,
//     mortgageValue: propertyState.mortgageValue,
//     lastRentPaid: bigintToString(propertyState.lastRentPaid),
//   };
// }

export function mapTradeInfoToAccount(
  tradeInfo: GeneratedTradeInfo
): TradeInfo {
  return {
    ...tradeInfo,
    proposer: addressToString(tradeInfo.proposer),
    receiver: addressToString(tradeInfo.receiver),
    proposerMoney: bigintToString(tradeInfo.proposerMoney),
    receiverMoney: bigintToString(tradeInfo.receiverMoney),
    proposerProperty: optionToNullable(tradeInfo.proposerProperty),
    receiverProperty: optionToNullable(tradeInfo.receiverProperty),
    createdAt: bigintToNumber(tradeInfo.createdAt),
    expiresAt: bigintToNumber(tradeInfo.expiresAt),
  };
}

export function mapPropertyInfoToAccount(
  propertyInfo: PropertyInfo,
  position: number,
  gameAddress: string
): PropertyAccount {
  const boardSpace = boardData.find((space) => space.position === position);

  if (!boardSpace) {
    throw new Error(`Board space not found for position ${position}`);
  }

  const syntheticAddress = `${gameAddress}_property_${position}`;

  // Map property type from board data
  let propertyType: PropertyType;
  let colorGroup: ColorGroup = "brown"; // default
  let price = 0;
  let rentBase = 0;
  let rentWithColorGroup = 0;
  let rentWithHouses: number[] = [0, 0, 0, 0];
  let rentWithHotel = 0;
  let houseCost = 0;
  let mortgageValue = 0;

  switch (boardSpace.type) {
    case "property":
      propertyType = PropertyType.Street;
      colorGroup = boardSpace.colorGroup;
      price = boardSpace.price;
      rentBase = boardSpace.baseRent;
      rentWithColorGroup = boardSpace.rentWithColorGroup;
      rentWithHouses = [
        boardSpace.rentWith1House,
        boardSpace.rentWith2Houses,
        boardSpace.rentWith3Houses,
        boardSpace.rentWith4Houses,
      ];
      rentWithHotel = boardSpace.rentWithHotel;
      houseCost = boardSpace.houseCost;
      mortgageValue = boardSpace.mortgageValue;
      break;
    case "railroad":
      propertyType = PropertyType.Railroad;
      price = boardSpace.price;
      rentBase = boardSpace.railroadRent[0]; // rent for owning 1 railroad
      mortgageValue = boardSpace.mortgageValue;
      break;
    case "utility":
      propertyType = PropertyType.Utility;
      price = boardSpace.price;
      rentBase = boardSpace.utilityMultiplier[0]; // multiplier for owning 1 utility
      mortgageValue = boardSpace.mortgageValue;
      break;
    case "corner":
      propertyType = PropertyType.Corner;
      break;
    case "chance":
      propertyType = PropertyType.Chance;
      break;
    case "community-chest":
      propertyType = PropertyType.CommunityChest;
      break;
    case "tax":
      propertyType = PropertyType.Tax;
      break;
    default:
      propertyType = PropertyType.Corner;
  }

  return {
    address: syntheticAddress,
    position,
    owner: propertyInfo.owner,
    price,
    colorGroup,
    propertyType,
    houses: propertyInfo.houses,
    hasHotel: propertyInfo.hasHotel,
    isMortgaged: propertyInfo.isMortgaged,
    rentBase,
    rentWithColorGroup,
    rentWithHouses,
    rentWithHotel,
    houseCost,
    mortgageValue,
    lastRentPaid: "0", // Default since we don't track this in PropertyInfo anymore
  };
}
