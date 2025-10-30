// import { GameAccount, PlayerAccount, PropertyAccount } from "@/types/schema";
// import { address, Address, none } from "@solana/kit";
// import { useCallback, useMemo } from "react";
// import { GameStatus } from "@/lib/sdk/generated/types/gameStatus";
// import { ColorGroup } from "@/lib/sdk/generated/types/colorGroup";
// import { PropertyType } from "@/lib/sdk/generated/types/propertyType";
// import { boardData } from "@/configs/board-data";

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

// // Mock wallet addresses for players
// const MOCK_PLAYER_WALLETS = [
//   "11111111111111111111111111111111" as Address,
//   "22222222222222222222222222222222" as Address,
//   "33333333333333333333333333333333" as Address,
//   "44444444444444444444444444444444" as Address,
// ];

// // Mock game address
// const MOCK_GAME_ADDRESS = "GameGameGameGameGameGameGameGameGameGame" as Address;

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

// export function useFakeGameState(
//   gameAddress: Address | null | undefined,
//   config: UseGameStateConfig = {}
// ): UseGameStateResult {
//   const { enabled = true } = config;

//   // Mock game data
//   // @ts-expect-error
//   const mockGameData: GameAccount = useMemo(
//     () => ({
//       discriminator: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
//       gameId: BigInt(1234567890),
//       configId: address("11111111111111111111111111111111"),
//       authority: MOCK_PLAYER_WALLETS[0],
//       bump: 123,
//       maxPlayers: 4,
//       currentPlayers: 3,
//       currentTurn: 0,
//       players: MOCK_PLAYER_WALLETS.slice(0, 3),
//       gameStatus: GameStatus.InProgress,
//       bankBalance: BigInt(1000000),
//       createdAt: BigInt(1000000),
//       freeParkingPool: BigInt(1000000),
//       housesRemaining: 32,
//       hotelsRemaining: 12,
//       timeLimit: none(),
//       turnStartedAt: BigInt(1000000),
//       winner: none(),
//       address: gameAddress || MOCK_GAME_ADDRESS,
//     }),
//     [gameAddress]
//   );

//   // Mock player data
//   // @ts-expect-error
//   const mockPlayers: PlayerAccount[] = useMemo(
//     () => [
//       {
//         discriminator: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
//         wallet: MOCK_PLAYER_WALLETS[0],
//         game: gameAddress || MOCK_GAME_ADDRESS,
//         cashBalance: 1500,
//         position: 0,
//         inJail: false,
//         jailTurns: 0,
//         doublesCount: 0,
//         propertiesOwned: new Set([1, 3, 6, 8, 9]),
//         getOutOfJailFreeCards: 0,
//         isBankrupt: false,
//         lastRentPaid: BigInt(0),
//         address: "player1address1111111111111111111111" as Address,
//       },
//       {
//         discriminator: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
//         wallet: MOCK_PLAYER_WALLETS[1],
//         game: gameAddress || MOCK_GAME_ADDRESS,
//         cashBalance: 1200,
//         position: 15,
//         inJail: false,
//         jailTurns: 0,
//         propertiesOwned: new Set([11, 13, 14, 16, 18]),
//         getOutOfJailFreeCards: 1,
//         isBankrupt: false,
//         lastRentPaid: BigInt(0),
//         address: "player2address2222222222222222222222" as Address,
//       },
//       {
//         discriminator: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
//         wallet: MOCK_PLAYER_WALLETS[2],
//         game: gameAddress || MOCK_GAME_ADDRESS,
//         cashBalance: 800,
//         position: 24,
//         inJail: true,
//         jailTurns: 2,
//         propertiesOwned: new Set([21, 23, 24, 26, 27]),
//         getOutOfJailFreeCards: 0,
//         isBankrupt: false,
//         lastRentPaid: BigInt(0),
//         address: "player3address3333333333333333333333" as Address,
//       },
//     ],
//     [gameAddress]
//   );

//   // Mock property data - create properties for all owned positions
//   // @ts-expect-error
//   const mockProperties: PropertyAccount[] = useMemo(() => {
//     const allOwnedPositions = new Set<number>();
//     mockPlayers.forEach((player) => {
//       player.propertiesOwned.forEach((pos) => allOwnedPositions.add(pos));
//     });

//     return Array.from(allOwnedPositions).map((position) => {
//       const space = boardData[position];
//       const owner = mockPlayers.find((player) =>
//         // @ts-expect-error
//         player.propertiesOwned.has(position)
//       );

//       return {
//         discriminator: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
//         position,
//         owner: owner?.wallet || null,
//         price: space?.type === "property" ? space.price : 200,
//         colorGroup: getColorGroupFromBoardData(position),
//         propertyType: getPropertyTypeFromBoardData(position),
//         houses: position === 1 || position === 3 ? 2 : 0, // Add some houses to brown properties
//         hasHotel: false,
//         isMortgaged: position === 26, // Mortgage one property
//         rentBase: space?.type === "property" ? space.baseRent : 25,
//         rentWithColorGroup:
//           space?.type === "property" ? space.baseRent * 2 : 50,
//         rentWithHouses:
//           space?.type === "property" ? space.baseRent : [25, 50, 100, 200],
//         rentWithHotel: space?.type === "property" ? space.baseRent || 500 : 500,
//         houseCost: space?.type === "property" ? space.houseCost : 50,
//         mortgageValue:
//           space?.type === "property" ? Math.floor(space.price / 2) : 100,
//         lastRentPaid: BigInt(0),
//         address: `property${position}address111111111111111111` as Address,
//       };
//     });
//   }, [mockPlayers]);

//   const refetch = useCallback(async (): Promise<void> => {
//     // Mock refetch - in a real implementation this would trigger a data refresh
//     console.log("Mock refetch called");
//   }, []);

//   return {
//     gameData: enabled ? mockGameData : null,
//     players: enabled ? mockPlayers : [],
//     properties: enabled ? mockProperties : [],
//     error: null,
//     isLoading: false,
//     isError: false,
//     refetch,
//     playerCount: enabled ? mockPlayers.length : 0,
//     isSubscribed: false, // Mock subscriptions as disabled
//   };
// }
