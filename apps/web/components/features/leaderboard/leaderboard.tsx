"use client";

import { useMemo, useState } from "react";
import { LeaderboardTable } from "./leaderboard-table";
import { LeaderboardStats } from "./leaderboard-stats";
import { LeaderboardFilters } from "./leaderboard-filters";
import { PlayerProfileModal } from "./player-profile-modal";
import { useRealtimeLeaderboard } from "@/hooks/use-realtime-leaderboard";
import { type RankingBy, type TimeRange, type TopPlayerItem } from "@/services/leaderboard";
import { formatAddress } from "@/lib/utils";
import { getRandomAvatarByAddress } from "@/lib/avatar-utils";
import env from "@/configs/env";

export type LeaderboardTimeframe = "all" | "week" | "month";
export type LeaderboardMetric = "wins" | "earnings" | "games_played";

export interface PlayerStats {
  id: string;
  username: string;
  avatar?: string;
  rank: number;
  wins: number;
  losses: number;
  totalGames: number;
  totalEarnings: number; // in SOL
  winRate: number; // percentage
  averageGameTime: number; // in minutes
  longestWinStreak: number;
  currentWinStreak: number;
  favoriteProperty?: string;
  lastActive: number; // timestamp
}

function metricToRankingBy(metric: LeaderboardMetric): RankingBy {
  switch (metric) {
    case "wins":
      return "mostWins";
    case "earnings":
      return "highestEarnings";
    case "games_played":
      return "mostActive";
    default:
      return "combined";
  }
}

function timeframeToTimeRange(timeframe: LeaderboardTimeframe): TimeRange {
  switch (timeframe) {
    case "week":
      return "week";
    case "month":
      return "month";
    case "all":
      return "all";
    default:
      return "all";
  }
}

function mapTopPlayerToStats(item: TopPlayerItem): PlayerStats {
  const username = item.playerName || formatAddress(item.walletAddress);
  const avatar = getRandomAvatarByAddress(item.walletAddress);
  const lastActive = new Date(item.lastActiveDate).getTime();

  return {
    id: item.playerId,
    username,
    avatar,
    rank: item.rank ?? 0,
    wins: item.totalGamesWon,
    losses: item.totalGamesLost,
    totalGames: item.totalGamesPlayed,
    totalEarnings: item.totalEarnings,
    winRate: item.winRate,
    averageGameTime: Math.round(item.averageGameDuration ?? 0),
    longestWinStreak: 0,
    currentWinStreak: 0,
    favoriteProperty: undefined,
    lastActive,
  };
}

export function Leaderboard() {
  const [timeframe, setTimeframe] = useState<LeaderboardTimeframe>("all");
  const [metric, setMetric] = useState<LeaderboardMetric>("wins");
  const [selectedPlayer, setSelectedPlayer] = useState<TopPlayerItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const rankingBy = useMemo(() => metricToRankingBy(metric), [metric]);
  const timeRange = useMemo(() => timeframeToTimeRange(timeframe), [timeframe]);

  const {
    players: rawPlayers,
    analytics,
    loading,
    error,
  } = useRealtimeLeaderboard({
    rankingBy,
    timeRange,
    enabled: true,
    pollingInterval: env.NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS,
  });

  const players = useMemo(() => rawPlayers.map(mapTopPlayerToStats), [rawPlayers]);

  const handlePlayerClick = (playerStats: PlayerStats) => {
    const originalPlayer = rawPlayers.find(p => p.playerId === playerStats.id);
    if (originalPlayer) {
      setSelectedPlayer(originalPlayer);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPlayer(null);
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Leaderboard</h1>
        <p className="text-muted-foreground">
          Top players and their achievements in Panda Monopoly
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <LeaderboardStats analytics={analytics} />
      </div>

      <div className="mb-6">
        <LeaderboardFilters
          timeframe={timeframe}
          metric={metric}
          onTimeframeChange={setTimeframe}
          onMetricChange={setMetric}
        />
      </div>

      {error && (
        <div className="text-red-500 text-sm mb-4">{error}</div>
      )}
      {loading && (
        <div className="text-muted-foreground text-sm mb-4">Loading leaderboard...</div>
      )}

      <LeaderboardTable
        players={players}
        metric={metric}
        timeframe={timeframe}
        onPlayerClick={handlePlayerClick}
      />

      <PlayerProfileModal
        player={selectedPlayer}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}
