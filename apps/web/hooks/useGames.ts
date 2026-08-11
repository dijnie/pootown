"use client";

import type { SessionView } from "@pootown/game-contracts";
import useSWR from "swr";

import { useApi } from "@/components/providers/api-provider";

interface UseGamesConfig {
  enabled?: boolean;
  onError?: (error: Error) => void;
  onSuccess?: (data: number) => void;
}

interface UseGamesResult {
  data: SessionView[] | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<SessionView[] | undefined>;
}

export function useGames(config: UseGamesConfig = {}): UseGamesResult {
  const { enabled = true } = config;
  const { sessions } = useApi();
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? ["game-sessions", 100] : null,
    async () => (await sessions.list({ limit: 100 })).items,
    {
      onError: config.onError,
      onSuccess: (games) => config.onSuccess?.(games.length),
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      shouldRetryOnError: false,
    },
  );

  return {
    data,
    error,
    isLoading,
    isError: error !== undefined,
    refetch: mutate,
  };
}
