import { useRpcContext } from "@/components/providers/rpc-provider";
import { GameStatus } from "@/lib/sdk/generated";
import { sdk } from "@/lib/sdk/sdk";
import { GameEvent } from "@/lib/sdk/types";
import { GameAccount } from "@/types/schema";
import { Address } from "@solana/kit";
import { useCallback, useEffect, useRef } from "react";

interface UseGameEventsConfig {
  enabled?: boolean;
  gameData?: GameAccount | null;
  onEvent?: (event: GameEvent) => void;
}

interface UseGameEventsResult {
  isSubscribed: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => void;
}

export function useGameEvents(
  gameAddress: Address | null | undefined,
  config: UseGameEventsConfig = {}
): UseGameEventsResult {
  const { enabled = true, gameData, onEvent } = config;

  // Subscription management refs
  const eventSubscriptionRef = useRef<(() => void) | null>(null);
  const isSubscribedRef = useRef(false);
  const currentGameAddressRef = useRef<string | null>(null);

  const { rpcSubscriptions, erRpcSubscriptions } = useRpcContext();

  const cleanupSubscription = useCallback(() => {
    if (eventSubscriptionRef.current) {
      eventSubscriptionRef.current();
      eventSubscriptionRef.current = null;
    }
    isSubscribedRef.current = false;
  }, []);

  const subscribe = useCallback(async () => {
    if (!gameAddress || !enabled || !gameData) {
      return;
    }

    try {
      console.log(`Setting up event subscription for game ${gameAddress}`);
      const isInProgress = gameData.gameStatus === GameStatus.InProgress;

      const eventUnsubscribe = await sdk.subscribeToEvents(
        isInProgress ? erRpcSubscriptions : rpcSubscriptions,
        async (event) => {
          console.log(`Event ${event.type} received`);
          if (
            event.data.game &&
            event.data.game.toString() === gameAddress.toString()
          ) {
            onEvent?.(event);
          }
        }
      );

      eventSubscriptionRef.current = eventUnsubscribe || null;
      isSubscribedRef.current = true;
      currentGameAddressRef.current = gameAddress.toString();
    } catch (error) {
      console.error("Error setting up event subscription:", error);
    }
  }, [
    gameAddress,
    enabled,
    gameData,
    onEvent,
    erRpcSubscriptions,
    rpcSubscriptions,
  ]);

  const unsubscribe = useCallback(() => {
    cleanupSubscription();
  }, [cleanupSubscription]);

  // Auto-subscribe when conditions are met
  useEffect(() => {
    if (!enabled || !gameAddress || !gameData) {
      cleanupSubscription();
      return;
    }

    // Check if we need to resubscribe (game address changed)
    const currentAddress = gameAddress.toString();
    if (currentGameAddressRef.current !== currentAddress) {
      cleanupSubscription();
    }

    // Subscribe if not already subscribed
    if (!isSubscribedRef.current) {
      subscribe();
    }

    return () => {
      cleanupSubscription();
    };
  }, [
    gameAddress?.toString(),
    gameData,
    enabled,
    subscribe,
    cleanupSubscription,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscription();
    };
  }, [cleanupSubscription]);

  return {
    isSubscribed: isSubscribedRef.current,
    subscribe,
    unsubscribe,
  };
}
