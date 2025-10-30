// import { GameAccount, PlayerAccount, PropertyAccount } from "@/types/schema";
// import { address, Address, none, some } from "@solana/kit";
// import { useCallback, useMemo } from "react";
// import { GameStatus } from "@/lib/sdk/generated/types/gameStatus";
// import { ColorGroup } from "@/lib/sdk/generated/types/colorGroup";
// import { PropertyType } from "@/lib/sdk/generated/types/propertyType";
// import { boardData } from "@/configs/board-data";
// import { useGameSimulation } from "./useGameSimulation";

// interface UseGameStateConfig {
//   enabled?: boolean;
//   subscribeToUpdates?: boolean;
//   onCardDrawEvent?: (event: any) => void;
// }

// interface UseGameStateResult {
//   gameData: GameAccount | null | undefined;
//   players: PlayerAccount[];
//   properties: PropertyAccount[];
//   error: any;
//   isLoading: boolean;
//   isError: boolean;
//   refetch: () => Promise<void>;
//   playerCount: number;
//   isSubscribed: boolean;
// }

// // Helper function to get property type from board data
// function getPropertyTypeFromBoardData(position: number): PropertyType {
//   const space = boardData[position];

//   if (!space) return PropertyType.Property;

//   switch (space.type) {
//     case "property":
//       return PropertyType.Property;
//     case "railroad":
//       return PropertyType.Railroad;
//     case "utility":
//       return PropertyType.Utility;
//     case "corner":
//       return PropertyType.Corner;
//     case "chance":
//       return PropertyType.Chance;
//     case "community-chest":
//       return PropertyType.CommunityChest;
//     case "tax":
//       return PropertyType.Tax;
//     default:
//       return PropertyType.Property;
//   }
// }

// // Helper function to get color group from board data
// function getColorGroupFromBoardData(position: number): ColorGroup {
//   const space = boardData[position];

//   if (!space || space.type !== "property") {
//     if (space?.type === "railroad") return ColorGroup.Railroad;
//     if (space?.type === "utility") return ColorGroup.Utility;
//     return ColorGroup.Special;
//   }

//   const colorMap: Record<string, ColorGroup> = {
//     brown: ColorGroup.Brown,
//     lightblue: ColorGroup.LightBlue,
//     pink: ColorGroup.Pink,
//     orange: ColorGroup.Orange,
//     red: ColorGroup.Red,
//     yellow: ColorGroup.Yellow,
//     green: ColorGroup.Green,
//     darkblue: ColorGroup.DarkBlue,
//   };

//   return colorMap[space.colorGroup] || ColorGroup.Special;
// }

// export function useFakeGameStateSimulation(
//   gameAddress: Address | null | undefined,
//   config: UseGameStateConfig = {}
// ): UseGameStateResult {
//   const { enabled = true } = config;

//   // Use the game simulation hook
//   const {
//     gameData: gameState,
//     players,
//     properties,
//   } = useGameSimulation(gameAddress, config);

//   // Convert simulation data to the expected format
//   const gameData: GameAccount | null = useMemo(() => {
//     if (!gameState) return null;

//     return {
//       discriminator: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
//       gameId: BigInt(gameState.gameId),
//       configId: address("11111111111111111111111111111111"),
//       authority:
//         gameState.players[0] || address("11111111111111111111111111111111"),
//       bump: 255,
//       maxPlayers: gameState.maxPlayers,
//       currentPlayers: gameState.currentPlayers,
//       currentTurn: gameState.currentTurn,
//       players: gameState.players,
//       createdAt: BigInt(gameState.createdAt),
//       gameStatus: gameState.gameStatus,
//       bankBalance: BigInt(gameState.bankBalance),
//       freeParkingPool: BigInt(gameState.freeParkingPool),
//       housesRemaining: gameState.housesRemaining,
//       hotelsRemaining: gameState.hotelsRemaining,
//       timeLimit: none(),
//       winner: gameState.winner ? some(gameState.winner) : none(),
//       turnStartedAt: BigInt(gameState.turnStartedAt),
//       address:
//         gameAddress || address("GameGameGameGameGameGameGameGameGameGame"),
//     };
//   }, [gameState, gameAddress]);

//   // Convert simulation players to the expected format
//   const playersData: PlayerAccount[] = useMemo(() => {
//     return players.map((player) => ({
//       discriminator: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
//       wallet: player.wallet,
//       game: gameAddress || address("GameGameGameGameGameGameGameGameGameGame"),
//       cashBalance: BigInt(player.cashBalance),
//       position: player.position,
//       inJail: player.inJail,
//       jailTurns: player.jailTurns,
//       doublesCount: player.doublesCount,
//       isBankrupt: player.isBankrupt,
//       propertiesOwned: player.propertiesOwned,
//       getOutOfJailCards: player.getOutOfJailCards,
//       netWorth: BigInt(player.netWorth),
//       lastRentCollected: BigInt(player.lastRentCollected),
//       festivalBoostTurns: 0,
//       hasRolledDice: player.hasRolledDice,
//       lastDiceRoll: player.lastDiceRoll ? some(player.lastDiceRoll) : none(),
//       needsPropertyAction: player.needsPropertyAction,
//       pendingPropertyPosition:
//         player.pendingPropertyPosition !== null
//           ? some(player.pendingPropertyPosition)
//           : none(),
//       needsChanceCard: player.needsChanceCard,
//       needsCommunityChestCard: player.needsCommunityChestCard,
//       needsBankruptcyCheck: player.needsBankruptcyCheck,
//       needsSpecialSpaceAction: player.needsSpecialSpaceAction,
//       pendingSpecialSpacePosition:
//         player.pendingSpecialSpacePosition !== null
//           ? some(player.pendingSpecialSpacePosition)
//           : none(),
//       cardDrawnAt: none(),
//       address: player.wallet,
//     }));
//   }, [players, gameAddress]);

//   // Convert simulation properties to the expected format
//   const propertiesData: PropertyAccount[] = useMemo(() => {
//     return properties.map((property) => ({
//       discriminator: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
//       position: property.position,
//       owner: property.owner ? some(property.owner) : none(),
//       price: BigInt(property.price),
//       colorGroup: getColorGroupFromBoardData(property.position),
//       propertyType: getPropertyTypeFromBoardData(property.position),
//       houses: property.houses,
//       hasHotel: property.hasHotel,
//       isMortgaged: property.isMortgaged,
//       rentBase: BigInt(property.rentBase),
//       rentWithColorGroup: BigInt(property.rentWithColorGroup),
//       rentWith1House: BigInt(property.rentWith1House),
//       rentWith2Houses: BigInt(property.rentWith2Houses),
//       rentWith3Houses: BigInt(property.rentWith3Houses),
//       rentWith4Houses: BigInt(property.rentWith4Houses),
//       rentWithHotel: BigInt(property.rentWithHotel),
//       houseCost: BigInt(property.houseCost),
//       hotelCost: BigInt(property.hotelCost),
//       mortgageValue: BigInt(property.mortgageValue),
//       address: address(
//         `Property${property.position
//           .toString()
//           .padStart(2, "0")}Property${property.position
//           .toString()
//           .padStart(2, "0")}Property${property.position
//           .toString()
//           .padStart(2, "0")}`
//       ),
//     }));
//   }, [properties]);

//   const refetch = useCallback(async (): Promise<void> => {
//     // In simulation mode, this is a no-op since state is managed locally
//     console.log("Refetch called in simulation mode");
//   }, []);

//   return {
//     gameData,
//     players: playersData,
//     properties: propertiesData,
//     error: null,
//     isLoading: false,
//     isError: false,
//     refetch,
//     playerCount: playersData.length,
//     isSubscribed: true,
//   };
// }
