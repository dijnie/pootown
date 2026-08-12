"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import env from "@/configs/env";
import {
  fetchTopPlayers,
  type LeaderboardPagination,
  type TopPlayerItem,
} from "@/services/leaderboard";
import { createPollingLifecycle } from "@/services/polling-lifecycle";

interface UseRealtimeLeaderboardOptions {
  enabled?: boolean;
  limit?: number;
  page?: number;
  pollingInterval?: number;
}

interface UseRealtimeLeaderboardReturn {
  players: TopPlayerItem[];
  pagination: LeaderboardPagination | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isConnected: boolean;
  refresh: () => Promise<void>;
}

export function useRealtimeLeaderboard({
  enabled = true,
  limit = 20,
  page = 1,
  pollingInterval,
}: UseRealtimeLeaderboardOptions = {}): UseRealtimeLeaderboardReturn {
  const [players, setPlayers] = useState<TopPlayerItem[]>([]);
  const [pagination, setPagination] = useState<LeaderboardPagination | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const lifecycleRef = useRef<ReturnType<typeof createPollingLifecycle> | null>(
    null
  );
  const lifecycleTokenRef = useRef(0);
  const requestGenerationRef = useRef(0);
  if (lifecycleRef.current === null)
    lifecycleRef.current = createPollingLifecycle(() => document.hidden);

  const pollIntervalMs =
    pollingInterval ?? env.NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS ?? 60_000;
  const pollOffsetMs = env.NEXT_PUBLIC_LEADERBOARD_POLL_OFFSET_MS ?? 5_000;

  const fetchData = useCallback(
    async (isInitial = false, lifecycle = lifecycleTokenRef.current) => {
      const polling = lifecycleRef.current;
      if (!enabled || polling === null || !polling.isActive(lifecycle)) return;
      const generation = ++requestGenerationRef.current;
      try {
        if (isInitial) setLoading(true);
        setError(null);
        const response = await fetchTopPlayers({ limit, page });
        if (
          !polling.isActive(lifecycle) ||
          generation !== requestGenerationRef.current
        )
          return;
        setPlayers(response.data.data);
        setPagination(response.data.pagination);
        setLastUpdated(new Date());
        setIsConnected(true);
      } catch (caught) {
        if (
          !polling.isActive(lifecycle) ||
          generation !== requestGenerationRef.current
        )
          return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load leaderboard"
        );
        setIsConnected(false);
      } finally {
        if (isInitial && polling.isActive(lifecycle)) setLoading(false);
      }
    },
    [enabled, limit, page]
  );

  const refresh = useCallback(
    () => fetchData(true, lifecycleTokenRef.current),
    [fetchData]
  );

  useEffect(() => {
    const polling = lifecycleRef.current;
    if (polling === null) return;
    const activePolling = polling;
    function scheduleNext(lifecycle: number) {
      if (!enabled || pollIntervalMs <= 0 || !activePolling.isActive(lifecycle))
        return;
      const remainder = Date.now() % pollIntervalMs;
      const delay =
        (pollIntervalMs - remainder + pollOffsetMs) % pollIntervalMs ||
        pollIntervalMs;
      activePolling.schedule(lifecycle, delay, () => {
        void fetchData(false, lifecycle).then(() => scheduleNext(lifecycle));
      });
    }
    const lifecycle = activePolling.begin();
    lifecycleTokenRef.current = lifecycle;
    if (enabled && document.hidden) {
      setLoading(false);
      setIsConnected(false);
    } else if (enabled) {
      void fetchData(true, lifecycle).then(() => scheduleNext(lifecycle));
    }
    const handleVisibilityChange = () => {
      if (document.hidden) {
        activePolling.pause();
        requestGenerationRef.current += 1;
        setIsConnected(false);
        setLoading(false);
        return;
      }
      void fetchData(false, lifecycle).then(() => scheduleNext(lifecycle));
    };
    if (enabled)
      document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      activePolling.invalidate(lifecycle);
      requestGenerationRef.current += 1;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, fetchData, pollIntervalMs, pollOffsetMs]);

  return {
    error,
    isConnected,
    lastUpdated,
    loading,
    pagination,
    players,
    refresh,
  };
}
