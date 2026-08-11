import { useRpcContext } from "@/components/providers/rpc-provider";
import { DELEGATION_PROGRAM_ID } from "@/configs/constants";
import {
  GameStatus,
  PANDA_MONOPOLY_PROGRAM_ADDRESS,
} from "@/lib/sdk/generated";
import { sdk } from "@/lib/sdk/sdk";
import { GameEvent } from "@/lib/sdk/types";
import {
  GameAccount,
  mapGameStateToAccount,
  mapPlayerStateToAccount,
  mapPropertyInfoToAccount,
  PlayerAccount,
  PropertyAccount,
} from "@/types/schema";
import { address, Address } from "@solana/kit";
import { useCallback, useEffect, useRef } from "react";
import useSWR, { KeyedMutator } from "swr";

interface UseGameStateConfig {
  enabled?: boolean;
  subscribeToUpdates?: boolean;
  onCardDrawEvent?: (event: GameEvent) => void;
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

interface RpcLocation {
  useER: boolean;
  lastChecked: number;
}

interface PendingUpdate {
  type: "game" | "player";
  address: string;
  timestamp: number;
}

const LOCATION_CACHE_DURATION = 30000; // 30 seconds
const UPDATE_DEBOUNCE_MS = 150; // Debounce multiple updates within 150ms

export function useGameStateV2(
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

  // Smart RPC routing cache
  const rpcLocationRef = useRef<RpcLocation | null>(null);

  // Debouncing refs
  const pendingUpdatesRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track last fetched data for differential updates
  const lastGameDataRef = useRef<string | null>(null);
  const lastPlayerDataRef = useRef<Map<string, string>>(new Map());

  const { rpc, erRpc, rpcSubscriptions, erRpcSubscriptions } = useRpcContext();

  const cacheKey =
    enabled && gameAddress ? ["game-state", gameAddress.toString()] : null;

  // Determine which RPC to use based on game status and cache
  const determineRpcLocation = useCallback(
    (gameStatus: GameStatus): { rpc: any; rpcSub: any; useER: boolean } => {
      const now = Date.now();

      // Use cached location if still valid
      if (
        rpcLocationRef.current &&
        now - rpcLocationRef.current.lastChecked < LOCATION_CACHE_DURATION
      ) {
        const useER = rpcLocationRef.current.useER;
        return {
          rpc: useER ? erRpc : rpc,
          rpcSub: useER ? erRpcSubscriptions : rpcSubscriptions,
          useER,
        };
      }

      // Determine based on game status
      const useER = gameStatus === GameStatus.InProgress;

      // Update cache
      rpcLocationRef.current = {
        useER,
        lastChecked: now,
      };

      return {
        rpc: useER ? erRpc : rpc,
        rpcSub: useER ? erRpcSubscriptions : rpcSubscriptions,
        useER,
      };
    },
    [rpc, erRpc, rpcSubscriptions, erRpcSubscriptions]
  );

  // Fetch game account with smart fallback
  const fetchGameAccount = useCallback(
    async (gameAddr: Address) => {
      try {
        // Try ER first
        const gameStateER = await sdk.getGameAccount(erRpc, gameAddr);

        // If found in ER and it's the right program, use it
        if (
          gameStateER &&
          gameStateER.programAddress !== PANDA_MONOPOLY_PROGRAM_ADDRESS
        ) {
          return gameStateER;
        }

        // Fallback to Solana RPC
        const gameStateSolana = await sdk.getGameAccount(rpc, gameAddr);
        return gameStateSolana || gameStateER;
      } catch (error) {
        console.error("Error fetching game account:", error);
        return null;
      }
    },
    [rpc, erRpc]
  );

  // Fetch player account with smart routing
  const fetchPlayerAccount = useCallback(
    async (gameAddr: Address, playerAddr: Address, useER: boolean) => {
      try {
        const primaryRpc = useER ? erRpc : rpc;
        const fallbackRpc = useER ? rpc : erRpc;

        // Try primary RPC
        let playerAccount = await sdk.getPlayerAccount(
          primaryRpc,
          gameAddr,
          playerAddr
        );

        // Fallback only on null/undefined
        if (!playerAccount) {
          playerAccount = await sdk.getPlayerAccount(
            fallbackRpc,
            gameAddr,
            playerAddr
          );
        }

        return playerAccount;
      } catch (error) {
        console.error(
          `Error fetching player account for ${playerAddr}:`,
          error
        );
        return null;
      }
    },
    [rpc, erRpc]
  );

  // Main fetcher with optimizations
  const { data, error, isLoading, mutate } = useSWR(
    cacheKey,
    async () => {
      console.log("fetch game state", gameAddress);
      if (!gameAddress) {
        return { gameData: null, players: [], properties: [] };
      }

      try {
        // Step 1: Fetch game account
        const gameState = await fetchGameAccount(gameAddress);

        if (!gameState) {
          return { gameData: null, players: [], properties: [] };
        }

        const gameData: GameAccount = mapGameStateToAccount(
          gameState.data,
          gameState.address
        );

        // Determine RPC location based on game status
        const { useER } = determineRpcLocation(gameData.gameStatus);

        // Step 2: Get player addresses
        const playerAddresses = gameData.players || [];

        if (playerAddresses.length === 0) {
          return { gameData, players: [], properties: [] };
        }

        // Step 3: Fetch all player accounts with smart routing
        const playerPromises = playerAddresses.map(
          async (playerAddress: string) => {
            const playerAccount = await fetchPlayerAccount(
              gameAddress,
              address(playerAddress),
              useER
            );

            if (!playerAccount) {
              return null;
            }

            return mapPlayerStateToAccount(
              playerAccount.data,
              playerAccount.address
            );
          }
        );

        const playerAccounts = await Promise.all(playerPromises);
        const players = playerAccounts.filter(
          (player): player is PlayerAccount => player !== null
        );

        // Step 4: Map properties
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

        return { gameData, players, properties };
      } catch (error) {
        console.error("Error fetching game state:", error);
        return { gameData: null, players: [], properties: [] };
      }
    },
    {
      revalidateOnFocus: false, // Disable auto-revalidation when subscribed
      revalidateOnReconnect: false, // Disable reconnect revalidation
      shouldRetryOnError: false,
      refreshInterval: 0, // No polling - rely on subscriptions
      keepPreviousData: true,
    }
  );

  // Granular update function - updates only changed data
  const updateGameDataOptimistically = useCallback(
    (
      updatedGameData?: GameAccount,
      updatedPlayerData?: Map<string, PlayerAccount>
    ) => {
      mutate((currentData) => {
        if (!currentData) return currentData;

        const newData = { ...currentData };

        // Update game data if provided and changed
        if (updatedGameData) {
          const gameDataStr = JSON.stringify(updatedGameData);
          if (lastGameDataRef.current !== gameDataStr) {
            newData.gameData = updatedGameData;
            lastGameDataRef.current = gameDataStr;

            // Recalculate properties only if game data changed
            const propertyPositions = (newData.players || [])
              .map((player) => Array.from(player.propertiesOwned))
              .flat();

            newData.properties = propertyPositions.map((position) => {
              const propertyInfo = updatedGameData.properties[position];
              return mapPropertyInfoToAccount(
                propertyInfo,
                position,
                updatedGameData.address
              );
            });
          }
        }

        // Update specific players if provided
        if (updatedPlayerData && updatedPlayerData.size > 0) {
          const newPlayers = [...(currentData.players || [])];
          let playersChanged = false;

          updatedPlayerData.forEach((updatedPlayer, playerAddress) => {
            const playerDataStr = JSON.stringify(updatedPlayer);
            const lastPlayerData = lastPlayerDataRef.current.get(playerAddress);

            // Only update if data actually changed
            if (lastPlayerData !== playerDataStr) {
              const playerIndex = newPlayers.findIndex(
                (p) => p.address === playerAddress
              );

              if (playerIndex !== -1) {
                newPlayers[playerIndex] = updatedPlayer;
                lastPlayerDataRef.current.set(playerAddress, playerDataStr);
                playersChanged = true;
              }
            }
          });

          if (playersChanged) {
            newData.players = newPlayers;

            // Recalculate properties if player ownership might have changed
            const propertyPositions = newPlayers
              .map((player) => Array.from(player.propertiesOwned))
              .flat();

            newData.properties = propertyPositions.map((position) => {
              const propertyInfo = (newData.gameData || currentData.gameData)!
                .properties[position];
              return mapPropertyInfoToAccount(
                propertyInfo,
                position,
                (newData.gameData || currentData.gameData)!.address
              );
            });
          }
        }

        return newData;
      }, false); // false = don't revalidate
    },
    [mutate]
  );

  // Debounced refetch handler
  const handlePendingUpdates = useCallback(async () => {
    if (pendingUpdatesRef.current.size === 0 || !data?.gameData) {
      return;
    }

    const updates = Array.from(pendingUpdatesRef.current);
    pendingUpdatesRef.current.clear();

    console.log(`Processing ${updates.length} pending updates`);

    const hasGameUpdate = updates.includes("game");
    const playerUpdates = updates.filter((u) => u.startsWith("player-"));

    try {
      const { useER } = determineRpcLocation(data.gameData.gameStatus);

      let updatedGameData: GameAccount | undefined;
      const updatedPlayers = new Map<string, PlayerAccount>();

      // Fetch updated game data if needed
      if (hasGameUpdate && gameAddress) {
        const gameState = await fetchGameAccount(gameAddress);
        if (gameState) {
          updatedGameData = mapGameStateToAccount(
            gameState.data,
            gameState.address
          );
        }
      }

      // Fetch updated player data
      if (playerUpdates.length > 0 && gameAddress) {
        const playerFetchPromises = playerUpdates.map(async (update) => {
          const playerAddress = update.replace("player-", "");
          const playerAccount = await fetchPlayerAccount(
            gameAddress,
            address(playerAddress),
            useER
          );

          if (playerAccount) {
            const mappedPlayer = mapPlayerStateToAccount(
              playerAccount.data,
              playerAccount.address
            );
            return { address: playerAddress, player: mappedPlayer };
          }
          return null;
        });

        const results = await Promise.all(playerFetchPromises);
        results.forEach((result) => {
          if (result) {
            updatedPlayers.set(result.address, result.player);
          }
        });
      }

      // Apply granular updates
      updateGameDataOptimistically(updatedGameData, updatedPlayers);

      // Full refetch only on critical changes (game status, turn change, player count)
      if (
        updatedGameData &&
        (updatedGameData.gameStatus !== data.gameData.gameStatus ||
          updatedGameData.currentTurn !== data.gameData.currentTurn ||
          updatedGameData.currentPlayers !== data.gameData.currentPlayers)
      ) {
        console.log("Critical game change detected, performing full refetch");
        await mutate();
      }
    } catch (error) {
      console.error("Error processing pending updates:", error);
      // On error, do a full refetch
      await mutate();
    }
  }, [
    data?.gameData,
    gameAddress,
    determineRpcLocation,
    fetchGameAccount,
    fetchPlayerAccount,
    updateGameDataOptimistically,
    mutate,
  ]);

  // Queue an update with debouncing
  const queueUpdate = useCallback(
    (updateKey: string) => {
      pendingUpdatesRef.current.add(updateKey);

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer
      debounceTimerRef.current = setTimeout(() => {
        handlePendingUpdates();
        debounceTimerRef.current = null;
      }, UPDATE_DEBOUNCE_MS);
    },
    [handlePendingUpdates]
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

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingUpdatesRef.current.clear();
  }, []);

  const setupSubscriptions = useCallback(async () => {
    if (!gameAddress || !data?.gameData || !subscribeToUpdates || !enabled) {
      return;
    }

    try {
      console.log(`Setting up subscriptions for game ${gameAddress}`);
      const { rpc: selectedRpc, rpcSub: selectedRpcSub } = determineRpcLocation(
        data.gameData.gameStatus
      );

      // Subscribe to game account changes
      const gameUnsubscribe = await sdk.subscribeToGameAccount(
        selectedRpc,
        selectedRpcSub,
        gameAddress,
        async (gameState) => {
          if (!gameState) return;
          console.log("Game account updated");
          queueUpdate("game");
        }
      );

      gameSubscriptionRef.current = gameUnsubscribe || null;

      // Subscribe to each player account
      const playerAddresses = data.gameData.players || [];

      for (const playerAddress of playerAddresses) {
        const playerKey = playerAddress.toString();

        const playerUnsubscribe = await sdk.subscribePlayerStateAccount(
          selectedRpc,
          selectedRpcSub,
          gameAddress,
          address(playerAddress),
          async (playerState) => {
            if (!playerState) return;
            console.log(`Player ${playerAddress} updated`);
            queueUpdate(`player-${playerAddress}`);
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
    determineRpcLocation,
    queueUpdate,
  ]);

  // Main subscription effect
  useEffect(() => {
    // Only setup if we have data and subscriptions are enabled
    if (!subscribeToUpdates || !data?.gameData || !enabled || !gameAddress) {
      cleanupSubscriptions();
      return;
    }

    // Check if we need to recreate subscriptions
    const currentAddress = gameAddress.toString();
    const needsSetup =
      !isSubscribedRef.current ||
      currentGameAddressRef.current !== currentAddress;

    if (needsSetup) {
      cleanupSubscriptions();
      setupSubscriptions();
    }

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

  // Handle player list changes
  useEffect(() => {
    if (!data?.gameData?.players || !isSubscribedRef.current) return;

    const newPlayerAddresses = data.gameData.players.map((addr) =>
      addr.toString()
    );
    const currentAddresses = currentPlayerAddressesRef.current;

    const hasChanged =
      newPlayerAddresses.length !== currentAddresses.length ||
      newPlayerAddresses.some((addr) => !currentAddresses.includes(addr));

    if (hasChanged) {
      console.log("Player list changed, updating subscriptions...");

      // Only cleanup and recreate player subscriptions, not game subscription
      playerSubscriptionsRef.current.forEach((unsubscribe) => {
        unsubscribe();
      });
      playerSubscriptionsRef.current.clear();

      currentPlayerAddressesRef.current = newPlayerAddresses;

      // Recreate subscriptions
      setupSubscriptions();
    }
  }, [data?.gameData?.players, setupSubscriptions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
    };
  }, [cleanupSubscriptions]);

  const refetch = useCallback(async (): Promise<void> => {
    // Clear cache to force fresh fetch
    rpcLocationRef.current = null;
    lastGameDataRef.current = null;
    lastPlayerDataRef.current.clear();
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
