"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchTopPlayers, fetchAnalytics, type RankingBy, type TimeRange, type TopPlayerItem, type GameAnalytics } from "@/services/leaderboard";
import env from "@/configs/env";

interface UseRealtimeLeaderboardOptions {
  rankingBy: RankingBy;
  timeRange: TimeRange;
  enabled?: boolean;
  pollingInterval?: number; 
}

interface UseRealtimeLeaderboardReturn {
  players: TopPlayerItem[];
  analytics: GameAnalytics | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isConnected: boolean;
  refresh: () => Promise<void>;
}

export function useRealtimeLeaderboard({
  rankingBy,
  timeRange,
  enabled = true,
  pollingInterval,
}: UseRealtimeLeaderboardOptions): UseRealtimeLeaderboardReturn {
  const [players, setPlayers] = useState<TopPlayerItem[]>([]);
  const [analytics, setAnalytics] = useState<GameAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const pollIntervalMs = typeof pollingInterval === "number"
    ? pollingInterval
    : (env.NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS ?? 60000);
  const pollOffsetMs = env.NEXT_PUBLIC_LEADERBOARD_POLL_OFFSET_MS ?? 5000; 
  const scheduleNext = useCallback(() => {
    if (!enabled || pollIntervalMs <= 0) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const now = Date.now();
    const remainder = now % pollIntervalMs;
    let delay = pollIntervalMs - remainder + pollOffsetMs;
    if (delay < 0) delay += pollIntervalMs;

    timerRef.current = setTimeout(async () => {
      await fetchData(false);
      scheduleNext();
    }, delay);
  }, [enabled, pollIntervalMs, pollOffsetMs]);

  const fetchData = useCallback(async (isInitial = false) => {
    if (!enabled) return;

    try {
      if (isInitial) {
        setLoading(true);
      }
      setError(null);

      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      const [playersResponse, analyticsResponse] = await Promise.all([
        fetchTopPlayers({ rankingBy, timeRange }),
        fetchAnalytics({ timeRange })
      ]);

      // Check if request was aborted
      if (abortControllerRef.current.signal.aborted) {
        return;
      }

      setPlayers(playersResponse.data.data);
      setAnalytics(analyticsResponse);
      setLastUpdated(new Date());
      setIsConnected(true);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Request was cancelled, ignore
      }
      console.error("Failed to fetch leaderboard data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
      setIsConnected(false);
    } finally {
      if (isInitial) {
        setLoading(false);
      }
    }
  }, [rankingBy, timeRange, enabled]);

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchData(true).then(() => scheduleNext());
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchData, enabled, scheduleNext]);

  // Align polling with page visibility
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setIsConnected(false);
      } else {
        setIsConnected(true);
        fetchData(false).then(() => scheduleNext());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, scheduleNext, fetchData]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    players,
    analytics,
    loading,
    error,
    lastUpdated,
    isConnected,
    refresh,
  };
}