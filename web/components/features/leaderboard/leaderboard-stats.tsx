"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Trophy, TrendingUp, Clock } from "lucide-react";
import type { GameAnalytics } from "@/services/leaderboard";

interface LeaderboardStatsProps {
  analytics: GameAnalytics | null;
}

export function LeaderboardStats({ analytics }: LeaderboardStatsProps) {
  const totalPlayers = analytics?.totalPlayers ?? 0;
  const totalGames = analytics?.totalGames ?? 0;
  const totalEarnings = analytics?.combinedPlayerEarnings ?? 0;
  const averagePlayersPerGame = analytics?.averagePlayersPerGame ?? 0;
  const averageGameDuration = analytics?.averageGameDuration ?? 0;

  const stats = [
    {
      title: "Total Players",
      value: totalPlayers.toLocaleString(),
      icon: Users,
      description: "Active players",
      color: "text-blue-500",
    },
    {
      title: "Games Played",
      value: totalGames.toLocaleString(),
      icon: Trophy,
      description: `${averagePlayersPerGame.toFixed(1)} avg players/game`,
      color: "text-green-500",
    },
    {
      title: "Total Earnings",
      value: `${totalEarnings.toFixed(2)} SOL`,
      icon: TrendingUp,
      description: "Combined player earnings",
      color: "text-yellow-500",
    },
    {
      title: "Avg Game Time",
      value: `${Math.round(averageGameDuration)}m`,
      icon: Clock,
      description: "Average duration of completed games",
      color: "text-purple-500",
    },
  ];

  return (
    <>
      {stats.map((stat, index) => (
        <Card key={index} className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              {stat.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground mb-1">
              {stat.value}
            </div>
            <p className="text-xs text-muted-foreground">
              {stat.description}
            </p>
          </CardContent>
          <div className={`absolute top-0 right-0 w-1 h-full ${stat.color.replace('text-', 'bg-')}`} />
        </Card>
      ))}
    </>
  );
}