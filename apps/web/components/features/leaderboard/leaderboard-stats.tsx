"use client";

import { Coins, Gamepad2, Trophy, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { formatAccountCoin, type PlayerStats } from "./leaderboard";

interface LeaderboardStatsProps {
  players: PlayerStats[];
  totalRankedPlayers: number;
}

export function LeaderboardStats({ players, totalRankedPlayers }: LeaderboardStatsProps) {
  const pageGames = players.reduce((total, player) => total + player.totalGames, 0);
  const pageWins = players.reduce((total, player) => total + player.wins, 0);
  const pageCoin = players.reduce((total, player) => total + BigInt(player.accountCoinWon), BigInt(0));
  const stats = [
    { title: "Ranked Players", value: totalRankedPlayers.toLocaleString(), description: "All completed results", icon: Users, color: "text-blue-500" },
    { title: "Page Games", value: pageGames.toLocaleString(), description: "Games shown on this page", icon: Gamepad2, color: "text-green-500" },
    { title: "Page Wins", value: pageWins.toLocaleString(), description: "Wins shown on this page", icon: Trophy, color: "text-yellow-500" },
    { title: "Page Coin Won", value: formatAccountCoin(pageCoin.toString()), description: "Non-withdrawable account coin", icon: Coins, color: "text-purple-500" },
  ];

  return stats.map((stat) => (
    <Card key={stat.title} className="relative overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <stat.icon className={`w-4 h-4 ${stat.color}`} />
          {stat.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground mb-1 break-all">{stat.value}</div>
        <p className="text-xs text-muted-foreground">{stat.description}</p>
      </CardContent>
      <div className={`absolute top-0 right-0 w-1 h-full ${stat.color.replace("text-", "bg-")}`} />
    </Card>
  ));
}
