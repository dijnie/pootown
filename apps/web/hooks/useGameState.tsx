import { useRpcContext } from "@/components/providers/rpc-provider";
import { GameState, GameStatus, PlayerState } from "@/lib/sdk/generated";
import { sdk } from "@/lib/sdk/sdk";
import {
  GameAccount,
  mapGameStateToAccount,
  mapPlayerStateToAccount,
  mapPropertyInfoToAccount,
  PlayerAccount,
  PropertyAccount,
} from "@/types/schema";
import { address, Address } from "@solana/kit";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

interface UseGameStateConfig {
  enabled?: boolean;
  subscribeToUpdates?: boolean;
}

interface UseGameStateResult {
  gameData: GameAccount | null | undefined;
  players: PlayerAccount[];
  properties: PropertyAccount[];
  error: any;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<void>;
  playerCount: number;
  isSubscribed: boolean;
}

interface CachedData {
  gameData: GameAccount | null;
  players: PlayerAccount[];
  properties: PropertyAccount[];
}

export function useGameState(
  gameAddress: Address | null | undefined,
  config: UseGameStateConfig = {}
): UseGameStateResult {
  const { enabled = true, subscribeToUpdates = true } = config;

  // Subscription management refs
  const gameSubscriptionRef = useRef<(() => void) | null>(null);
  const playerSubscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const isSubscribedRef = useRef(false);
  const currentGameAddressRef = useRef<string | null>(null);
  const currentPlayerAddressesRef = useRef<string[]>([]);

  // Track critical state for full refetch decisions
  const lastCriticalStateRef = useRef<{
    gameStatus: GameStatus | null;
    currentTurn: number;
    currentPlayers: number;
  }>({
    gameStatus: null,
    currentTurn: 0,
    currentPlayers: 0,
  });

  const [localData, setLocalData] = useState<CachedData | null>(null);

  const { rpc, erRpc, rpcSubscriptions, erRpcSubscriptions } = useRpcContext();

  const cacheKey =
    enabled && gameAddress ? ["game-state", gameAddress.toString()] : null;

  const {
    data: swrData,
    error,
    isLoading,
    mutate,
  } = useSWR(
    cacheKey,
    async () => {
      if (!gameAddress) {
        return { gameData: null, players: [], properties: [] };
      }

      try {
        // Step 1: Fetch game account data
        let gameState = await sdk.getGameAccount(erRpc, gameAddress);
        if (
          !gameState ||
          gameState?.data.gameStatus !== GameStatus.InProgress
        ) {
          try {
            const erState = await sdk.getGameAccount(rpc, gameAddress);
            console.log("[DEBUG] no er, gameState by SOLANA", gameState);
            gameState = erState || gameState;
          } catch (_error) {
            // Fallback to regular RPC if enhanced RPC fails
          }
        }

        if (!gameState) {
          return { gameData: null, players: [], properties: [] };
        }

        const gameData: GameAccount = mapGameStateToAccount(
          gameState.data,
          gameState.address
        );

        lastCriticalStateRef.current = {
          gameStatus: gameData.gameStatus,
          currentTurn: gameData.currentTurn,
          currentPlayers: gameData.currentPlayers,
        };

        // Step 2: Get player addresses from game data
        const isInProgress = gameData.gameStatus === GameStatus.InProgress;

        const playerAddresses = gameData.players || [];

        if (playerAddresses.length === 0) {
          const result = { gameData, players: [], properties: [] };
          setLocalData(result);

          return result;
        }

        // Step 3: Fetch all player accounts
        const primaryRpc = isInProgress ? erRpc : rpc;
        const fallbackRpc = isInProgress ? rpc : erRpc;

        const playerStateAccounts = await sdk.getPlayerAccounts(
          gameAddress,
          playerAddresses.map((addr) => address(addr)),
          primaryRpc,
          fallbackRpc
        );

        const playerAccounts = playerStateAccounts.map((playerStateAccount) =>
          mapPlayerStateToAccount(
            playerStateAccount.data,
            playerStateAccount.address
          )
        );

        const players = playerAccounts.filter(
          (player): player is PlayerAccount => player !== null
        );

        // Step 4: Map properties from GameState.properties using the new approach
        const propertyPositions = players
          .map((player) => Array.from(player.propertiesOwned))
          .flat();

        const properties: PropertyAccount[] = propertyPositions.map(
          (position) => {
            const propertyInfo = gameData.properties[position];

            return mapPropertyInfoToAccount(
              propertyInfo,
              position,
              gameAddress.toString()
            );
          }
        );

        const result = { gameData, players, properties };
        setLocalData(result);

        return result;
      } catch (error) {
        console.error("Error fetching game state:", error);
        return { gameData: null, players: [], properties: [] };
      }
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      keepPreviousData: true,
    }
  );

  const data = localData || swrData;

  const updateDataOptimistically = useCallback(
    (
      updatedGameData?: GameAccount,
      updatedPlayerData?: Map<string, PlayerAccount>
    ) => {
      setLocalData((currentData) => {
        console.log(
          "updateDataOptimistically",
          currentData?.gameData?.gameId,
          updatedPlayerData?.size
        );
        if (!currentData) return currentData;

        // Check if anything actually changed before creating new objects
        let gameChanged = false;
        let playersChanged = false;

        let newGameData = currentData.gameData;
        let newPlayers = currentData.players;
        let newProperties = currentData.properties;

        // Update game data if provided
        if (updatedGameData) {
          const currentGameStr = JSON.stringify(currentData.gameData);
          const updatedGameStr = JSON.stringify(updatedGameData);

          if (currentGameStr !== updatedGameStr) {
            newGameData = updatedGameData;
            gameChanged = true;
          }
        }

        // Update specific players if provided
        if (updatedPlayerData && updatedPlayerData.size > 0) {
          const playersCopy = [...currentData.players];
          updatedPlayerData.forEach((updatedPlayer, playerAddress) => {
            const playerIndex = playersCopy.findIndex(
              (p) => p.address === playerAddress
            );

            if (playerIndex !== -1) {
              const currentPlayerStr = JSON.stringify(playersCopy[playerIndex]);
              const updatedPlayerStr = JSON.stringify(updatedPlayer);

              if (currentPlayerStr !== updatedPlayerStr) {
                playersCopy[playerIndex] = updatedPlayer;
                playersChanged = true;
              }
            }
          });

          if (playersChanged) {
            newPlayers = playersCopy;
          }
        }

        // Only recalculate properties if game or players changed
        if (gameChanged || playersChanged) {
          const propertyPositions = newPlayers
            .map((player) => Array.from(player.propertiesOwned))
            .flat();

          newProperties = propertyPositions.map((position) => {
            const propertyInfo = newGameData!.properties[position];
            return mapPropertyInfoToAccount(
              propertyInfo,
              position,
              newGameData!.address
            );
          });
        }

        // Return same reference if nothing changed (prevents unnecessary re-renders)
        if (!gameChanged && !playersChanged) {
          return currentData;
        }

        return {
          gameData: newGameData,
          players: newPlayers,
          properties: newProperties,
        };
      });
    },
    []
  );

  // Check if update requires full refetch (critical state changed)
  const needsFullRefetch = useCallback(
    (updatedGameData: GameAccount): boolean => {
      const lastCritical = lastCriticalStateRef.current;

      const criticalChanged =
        updatedGameData.gameStatus !== lastCritical.gameStatus ||
        updatedGameData.currentTurn !== lastCritical.currentTurn ||
        updatedGameData.currentPlayers !== lastCritical.currentPlayers;

      if (criticalChanged) {
        lastCriticalStateRef.current = {
          gameStatus: updatedGameData.gameStatus,
          currentTurn: updatedGameData.currentTurn,
          currentPlayers: updatedGameData.currentPlayers,
        };
      }

      return criticalChanged;
    },
    []
  );

  // Handle game account update from WebSocket
  const handleGameAccountUpdate = useCallback(
    async (gameAddress: Address, gameState: GameState) => {
      if (!gameState || !gameAddress) return;

      try {
        console.log("Game account updated via WebSocket");

        const updatedGameData = mapGameStateToAccount(gameState, gameAddress);

        // Check if full refetch needed for critical changes
        const needsRefetch = needsFullRefetch(updatedGameData);

        if (needsRefetch) {
          console.log("Critical game change detected, performing full refetch");
          await mutate();
        } else {
          // Apply optimistic update to local state only
          updateDataOptimistically(updatedGameData, undefined);
        }
      } catch (error) {
        console.error("Error handling game account update:", error);
        // On error, do a full refetch
        await mutate();
      }
    },
    [gameAddress, needsFullRefetch, updateDataOptimistically, mutate]
  );

  // Handle player account update from WebSocket
  const handlePlayerAccountUpdate = useCallback(
    async (playerState: PlayerState, playerAddress: string) => {
      if (!playerState) return;

      try {
        console.log(`Player ${playerAddress} updated via WebSocket`);

        const updatedPlayer = mapPlayerStateToAccount(
          playerState,
          address(playerAddress)
        );

        // Apply optimistic update to local state only
        const updatedPlayers = new Map<string, PlayerAccount>();
        updatedPlayers.set(playerAddress, updatedPlayer);
        updateDataOptimistically(undefined, updatedPlayers);
      } catch (error) {
        console.error("Error handling player account update:", error);
        // On error, just log it - don't refetch for single player errors
      }
    },
    [updateDataOptimistically]
  );

  const cleanupSubscriptions = useCallback(() => {
    if (gameSubscriptionRef.current) {
      gameSubscriptionRef.current();
      gameSubscriptionRef.current = null;
    }

    playerSubscriptionsRef.current.forEach((unsubscribe) => {
      unsubscribe();
    });
    playerSubscriptionsRef.current.clear();

    isSubscribedRef.current = false;
  }, []);

  const setupSubscriptions = useCallback(async () => {
    if (!gameAddress || !data?.gameData || !subscribeToUpdates || !enabled) {
      return;
    }

    try {
      console.log(`Setting up subscriptions for game ${gameAddress}`);
      const isInProgress = data.gameData.gameStatus === GameStatus.InProgress;

      const gameUnsubscribe = await sdk.subscribeToGameAccount(
        isInProgress ? erRpc : rpc,
        isInProgress ? erRpcSubscriptions : rpcSubscriptions,
        gameAddress,
        async (gameState) => {
          if (!gameState) return;

          console.log("Game account updated, refreshing data...");
          handleGameAccountUpdate(gameAddress, gameState);
          // Trigger a full refetch when game state changes
          // await mutate();
        }
      );

      gameSubscriptionRef.current = gameUnsubscribe || null;

      const playerAddresses = data.gameData.players || [];

      for (const playerAddress of playerAddresses) {
        const playerKey = playerAddress.toString();

        const playerUnsubscribe = await sdk.subscribePlayerStateAccount(
          isInProgress ? erRpc : rpc,
          isInProgress ? erRpcSubscriptions : rpcSubscriptions,
          gameAddress,
          address(playerAddress),
          async (playerState, playerStateAddress) => {
            if (!playerState) return;

            console.log(`Player ${playerAddress} updated, refreshing data...`);
            await handlePlayerAccountUpdate(
              playerState,
              playerStateAddress.toString()
            );
            // Trigger a full refetch when any player state changes
            // await mutate();
          }
        );

        if (playerUnsubscribe) {
          playerSubscriptionsRef.current.set(playerKey, playerUnsubscribe);
        }
      }

      isSubscribedRef.current = true;
      currentGameAddressRef.current = gameAddress.toString();
      currentPlayerAddressesRef.current = playerAddresses.map((addr) =>
        addr.toString()
      );
    } catch (error) {
      console.error("Error setting up subscriptions:", error);
    }
  }, [
    gameAddress,
    data?.gameData,
    subscribeToUpdates,
    enabled,
    handleGameAccountUpdate,
    handlePlayerAccountUpdate,
  ]);

  // Main subscription effect
  useEffect(() => {
    cleanupSubscriptions();

    // Only subscribe if we have data and subscriptions are enabled
    if (!subscribeToUpdates || !data?.gameData || !enabled || !gameAddress) {
      return;
    }

    setupSubscriptions();

    return () => {
      cleanupSubscriptions();
    };
  }, [
    data?.gameData,
    gameAddress?.toString(),
    subscribeToUpdates,
    enabled,
    setupSubscriptions,
    cleanupSubscriptions,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
    };
  }, [cleanupSubscriptions]);

  useEffect(() => {
    const currentAddress = gameAddress?.toString() || null;
    if (
      currentGameAddressRef.current !== null &&
      currentGameAddressRef.current !== currentAddress
    ) {
      cleanupSubscriptions();
    }
  }, [gameAddress?.toString(), cleanupSubscriptions]);

  // Handle player list changes
  useEffect(() => {
    if (!data?.gameData?.players) return;

    const newPlayerAddresses = data.gameData.players.map((addr) =>
      addr.toString()
    );
    const currentAddresses = currentPlayerAddressesRef.current;

    const hasChanged =
      newPlayerAddresses.length !== currentAddresses.length ||
      newPlayerAddresses.some((addr) => !currentAddresses.includes(addr));

    if (hasChanged && isSubscribedRef.current) {
      console.log("Player list changed, updating subscriptions...");
      cleanupSubscriptions();
      setupSubscriptions();
    }
  }, [data?.gameData?.players, cleanupSubscriptions, setupSubscriptions]);

  useEffect(() => {
    setLocalData(null);
  }, [gameAddress?.toString()]);

  const refetch = useCallback(async (): Promise<void> => {
    setLocalData(null);
    await mutate();
  }, [mutate]);

  return {
    gameData: data?.gameData || null,
    players: data?.players || [],
    properties: data?.properties || [],
    error,
    isLoading,
    isError: !!error,
    refetch,
    playerCount: data?.players?.length || 0,
    isSubscribed: isSubscribedRef.current,
  };
}
