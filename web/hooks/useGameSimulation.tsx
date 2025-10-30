// import { useCallback, useMemo, useRef, useState } from "react";
// import { Address } from "@solana/kit";
// import { GameAccount, PlayerAccount, PropertyAccount } from "@/types/schema";
// import {
//   MonopolyGameSimulation,
//   GameLogEntry,
//   DiceRoll,
//   PropertyActionResult,
//   CardDrawResult,
// } from "@/lib/game-simulation";
// import { useFakeGameState } from "./useFakeGameState";

// interface UseGameSimulationConfig {
//   enabled?: boolean;
//   subscribeToUpdates?: boolean;
//   onCardDrawEvent?: (event: any) => void;
// }

// interface UseGameSimulationResult {
//   // Game state
//   gameData: GameAccount | null | undefined;
//   players: PlayerAccount[];
//   properties: PropertyAccount[];
//   gameLogs: GameLogEntry[];
//   error: any;
//   isLoading: boolean;
//   isError: boolean;
//   refetch: () => Promise<void>;
//   playerCount: number;
//   isSubscribed: boolean;

//   // Game actions
//   rollDice: () => { success: boolean; diceRoll?: DiceRoll; message: string };
//   buyProperty: (playerWallet: Address) => PropertyActionResult;
//   declineProperty: (playerWallet: Address) => PropertyActionResult;
//   drawChanceCard: (playerWallet: Address) => CardDrawResult;
//   drawCommunityChestCard: (playerWallet: Address) => CardDrawResult;
//   payJailFine: (playerWallet: Address) => {
//     success: boolean;
//     diceRoll?: DiceRoll;
//     message: string;
//   };
//   useGetOutOfJailCard: (playerWallet: Address) => {
//     success: boolean;
//     message: string;
//   };
//   endTurn: () => { success: boolean; message: string; nextPlayer?: Address };
//   declareBankruptcy: (playerWallet: Address) => {
//     success: boolean;
//     message: string;
//   };
//   buildHouse: (
//     playerWallet: Address,
//     position: number
//   ) => { success: boolean; message: string };
//   buildHotel: (
//     playerWallet: Address,
//     position: number
//   ) => { success: boolean; message: string };

//   // Utility methods
//   getCurrentPlayer: () => PlayerAccount | null;
//   getPlayer: (wallet: Address) => PlayerAccount | null;
//   getProperty: (position: number) => PropertyAccount | null;
//   canEndTurn: () => boolean;
//   hasPendingActions: (playerWallet: Address) => boolean;
// }

// export function useGameSimulation(
//   gameAddress: Address | null | undefined,
//   config: UseGameSimulationConfig = {}
// ): UseGameSimulationResult {
//   const { enabled = true } = config;

//   // Get initial fake game state
//   const fakeGameState = useFakeGameState(gameAddress, { enabled });

//   // Initialize simulation
//   const simulationRef = useRef<MonopolyGameSimulation | null>(null);
//   const [forceUpdate, setForceUpdate] = useState(0);

//   // Initialize simulation when fake data is available
//   useMemo(() => {
//     if (enabled && fakeGameState.gameData && fakeGameState.players.length > 0) {
//       simulationRef.current = new MonopolyGameSimulation(
//         fakeGameState.gameData,
//         fakeGameState.players,
//         fakeGameState.properties
//       );
//     }
//   }, [
//     enabled,
//     fakeGameState.gameData,
//     fakeGameState.players,
//     fakeGameState.properties,
//   ]);

//   // Force re-render after state changes
//   const triggerUpdate = useCallback(() => {
//     setForceUpdate((prev) => prev + 1);
//   }, []);

//   // Get current state from simulation
//   const currentState = useMemo(() => {
//     if (!simulationRef.current) {
//       return {
//         gameData: fakeGameState.gameData,
//         players: fakeGameState.players,
//         properties: fakeGameState.properties,
//         gameLogs: [] as GameLogEntry[],
//       };
//     }

//     return {
//       gameData: simulationRef.current.getGameState(),
//       players: simulationRef.current.getPlayers(),
//       properties: simulationRef.current.getProperties(),
//       gameLogs: simulationRef.current.getGameLogs(),
//     };
//   }, [fakeGameState, forceUpdate]);

//   // Game action wrappers that trigger updates
//   const rollDice = useCallback(() => {
//     if (!simulationRef.current) {
//       return { success: false, message: "Simulation not initialized" };
//     }

//     const result = simulationRef.current.rollDice();
//     triggerUpdate();
//     return result;
//   }, [triggerUpdate]);

//   const buyProperty = useCallback(
//     (playerWallet: Address) => {
//       if (!simulationRef.current) {
//         return { success: false, message: "Simulation not initialized" };
//       }

//       const result = simulationRef.current.buyProperty(playerWallet);
//       triggerUpdate();
//       return result;
//     },
//     [triggerUpdate]
//   );

//   const declineProperty = useCallback(
//     (playerWallet: Address) => {
//       if (!simulationRef.current) {
//         return { success: false, message: "Simulation not initialized" };
//       }

//       const result = simulationRef.current.declineProperty(playerWallet);
//       triggerUpdate();
//       return result;
//     },
//     [triggerUpdate]
//   );

//   const drawChanceCard = useCallback(
//     (playerWallet: Address) => {
//       if (!simulationRef.current) {
//         return {
//           cardId: -1,
//           effectType: "money" as any,
//           amount: 0,
//           message: "Simulation not initialized",
//           executed: false,
//         };
//       }

//       const result = simulationRef.current.drawChanceCard(playerWallet);
//       triggerUpdate();
//       return result;
//     },
//     [triggerUpdate]
//   );

//   const drawCommunityChestCard = useCallback(
//     (playerWallet: Address) => {
//       if (!simulationRef.current) {
//         return {
//           cardId: -1,
//           effectType: "money" as any,
//           amount: 0,
//           message: "Simulation not initialized",
//           executed: false,
//         };
//       }

//       const result = simulationRef.current.drawCommunityChestCard(playerWallet);
//       triggerUpdate();
//       return result;
//     },
//     [triggerUpdate]
//   );

//   const payJailFine = useCallback(
//     (playerWallet: Address) => {
//       if (!simulationRef.current) {
//         return { success: false, message: "Simulation not initialized" };
//       }

//       const result = simulationRef.current.payJailFine(playerWallet);
//       triggerUpdate();
//       return result;
//     },
//     [triggerUpdate]
//   );

//   const useGetOutOfJailCard = useCallback(
//     (playerWallet: Address) => {
//       if (!simulationRef.current) {
//         return { success: false, message: "Simulation not initialized" };
//       }

//       const result = simulationRef.current.useGetOutOfJailCard(playerWallet);
//       triggerUpdate();
//       return result;
//     },
//     [triggerUpdate]
//   );

//   const endTurn = useCallback(() => {
//     if (!simulationRef.current) {
//       return { success: false, message: "Simulation not initialized" };
//     }

//     const result = simulationRef.current.endTurn();
//     triggerUpdate();
//     return result;
//   }, [triggerUpdate]);

//   const declareBankruptcy = useCallback(
//     (playerWallet: Address) => {
//       if (!simulationRef.current) {
//         return { success: false, message: "Simulation not initialized" };
//       }

//       const result = simulationRef.current.declareBankruptcy(playerWallet);
//       triggerUpdate();
//       return result;
//     },
//     [triggerUpdate]
//   );

//   const buildHouse = useCallback(
//     (playerWallet: Address, position: number) => {
//       if (!simulationRef.current) {
//         return { success: false, message: "Simulation not initialized" };
//       }

//       const result = simulationRef.current.buildHouse(playerWallet, position);
//       triggerUpdate();
//       return result;
//     },
//     [triggerUpdate]
//   );

//   const buildHotel = useCallback(
//     (playerWallet: Address, position: number) => {
//       if (!simulationRef.current) {
//         return { success: false, message: "Simulation not initialized" };
//       }

//       const result = simulationRef.current.buildHotel(playerWallet, position);
//       triggerUpdate();
//       return result;
//     },
//     [triggerUpdate]
//   );

//   // Utility methods
//   const getCurrentPlayer = useCallback(() => {
//     if (!simulationRef.current) return null;

//     const players = simulationRef.current.getPlayers();
//     const gameState = simulationRef.current.getGameState();

//     if (gameState.currentTurn >= players.length) return null;
//     return players[gameState.currentTurn];
//   }, [forceUpdate]);

//   const getPlayer = useCallback(
//     (wallet: Address) => {
//       if (!simulationRef.current) return null;
//       return simulationRef.current.getPlayer(wallet);
//     },
//     [forceUpdate]
//   );

//   const getProperty = useCallback(
//     (position: number) => {
//       if (!simulationRef.current) return null;
//       return simulationRef.current.getProperty(position);
//     },
//     [forceUpdate]
//   );

//   const canEndTurn = useCallback(() => {
//     const currentPlayer = getCurrentPlayer();
//     if (!currentPlayer) return false;

//     // Check if player has rolled dice and has no pending actions
//     return (
//       currentPlayer.hasRolledDice && !hasPendingActions(currentPlayer.wallet)
//     );
//   }, [getCurrentPlayer]);

//   const hasPendingActions = useCallback(
//     (playerWallet: Address) => {
//       const player = getPlayer(playerWallet);
//       if (!player) return false;

//       return (
//         player.needsPropertyAction ||
//         player.needsChanceCard ||
//         player.needsCommunityChestCard ||
//         player.needsBankruptcyCheck ||
//         player.needsSpecialSpaceAction
//       );
//     },
//     [getPlayer]
//   );

//   const refetch = useCallback(async (): Promise<void> => {
//     await fakeGameState.refetch();
//     triggerUpdate();
//   }, [fakeGameState.refetch, triggerUpdate]);

//   return {
//     // Game state
//     gameData: currentState.gameData,
//     players: currentState.players,
//     properties: currentState.properties,
//     gameLogs: currentState.gameLogs,
//     error: fakeGameState.error,
//     isLoading: fakeGameState.isLoading,
//     isError: fakeGameState.isError,
//     refetch,
//     playerCount: currentState.players.length,
//     isSubscribed: fakeGameState.isSubscribed,

//     // Game actions
//     rollDice,
//     buyProperty,
//     declineProperty,
//     drawChanceCard,
//     drawCommunityChestCard,
//     payJailFine,
//     useGetOutOfJailCard,
//     endTurn,
//     declareBankruptcy,
//     buildHouse,
//     buildHotel,

//     // Utility methods
//     getCurrentPlayer,
//     getPlayer,
//     getProperty,
//     canEndTurn,
//     hasPendingActions,
//   };
// }
