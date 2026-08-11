"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, TrendingUp, TrendingDown } from "lucide-react";
import { PlayerStats, LeaderboardMetric, LeaderboardTimeframe } from "./leaderboard";

interface LeaderboardTableProps {
  players: PlayerStats[];
  metric: LeaderboardMetric;
  timeframe: LeaderboardTimeframe;
  onPlayerClick?: (player: PlayerStats) => void;
}

export function LeaderboardTable({ players, metric, timeframe, onPlayerClick }: LeaderboardTableProps) {
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  const getMetricValue = (player: PlayerStats, metric: LeaderboardMetric) => {
    switch (metric) {
      case "wins":
        return player.wins;
      case "earnings":
        return `${player.totalEarnings.toFixed(2)} SOL`;
      case "games_played":
        return player.totalGames;
      default:
        return player.wins;
    }
  };

  const getMetricLabel = (metric: LeaderboardMetric) => {
    switch (metric) {
      case "wins":
        return "Wins";
      case "earnings":
        return "Total Earnings";
      case "games_played":
        return "Games Played";
      default:
        return "Wins";
    }
  };

  const formatLastActive = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else {
      return "Just now";
    }
  };

  const getWinStreakBadge = (currentStreak: number) => {
    if (currentStreak === 0) return null;
    
    return (
      <Badge variant="default" className="bg-green-500 text-white text-xs">
        🔥 {currentStreak}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Top Players - {getMetricLabel(metric)}
          <Badge variant="neutral" className="ml-auto">
            {timeframe === "all" ? "All Time" : timeframe === "week" ? "This Week" : "This Month"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {players.map((player, index) => (
            <div
              key={player.id}
              onClick={() => onPlayerClick?.(player)}
              className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all hover:shadow-md cursor-pointer ${
                index < 3 ? "bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200" : "bg-secondary-background border-border"
              }`}
            >
              {/* Rank */}
              <div className="flex items-center justify-center w-12">
                {getRankIcon(player.rank)}
              </div>

              {/* Player Info */}
              <div className="flex items-center gap-3 flex-1">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={player.avatar} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold">
                    {player.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{player.username}</h3>
                    {getWinStreakBadge(player.currentWinStreak)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Last active: {formatLastActive(player.lastActive)}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="font-semibold text-foreground">{player.winRate.toFixed(1)}%</p>
                  <p className="text-muted-foreground">Win Rate</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">{player.totalGames}</p>
                  <p className="text-muted-foreground">Games</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">{player.averageGameTime}m</p>
                  <p className="text-muted-foreground">Avg Time</p>
                </div>
              </div>

              {/* Primary Metric */}
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">
                  {getMetricValue(player, metric)}
                </p>
                <p className="text-sm text-muted-foreground">{getMetricLabel(metric)}</p>
              </div>

              {/* Trend Indicator */}
              <div className="w-8 flex justify-center">
                {player.currentWinStreak > 0 ? (
                  <TrendingUp className="w-5 h-5 text-green-500" />
                ) : player.currentWinStreak === 0 && player.longestWinStreak > 2 ? (
                  <TrendingDown className="w-5 h-5 text-red-500" />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}