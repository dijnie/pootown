"use client";

import { Award, Medal, Trophy } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { formatAccountCoin, type PlayerStats } from "./leaderboard";

interface LeaderboardTableProps {
  players: PlayerStats[];
  onPlayerClick?: (player: PlayerStats) => void;
}

function rankIcon(rank: number) {
  if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>;
}

export function LeaderboardTable({ players, onPlayerClick }: LeaderboardTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Top Players
          <Badge variant="neutral" className="ml-auto">All Time</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {players.map((player, index) => (
            <button
              type="button"
              key={player.id}
              onClick={() => onPlayerClick?.(player)}
              className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all hover:shadow-md ${
                index < 3
                  ? "bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200"
                  : "bg-secondary-background border-border"
              }`}
            >
              <div className="flex items-center justify-center w-12">{rankIcon(player.rank)}</div>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={player.avatar} />
                  <AvatarFallback>{player.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{player.username}</h3>
                  <p className="text-sm text-muted-foreground">{player.wins} wins · {player.losses} losses</p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="font-semibold text-foreground">{player.winRate.toFixed(1)}%</p>
                  <p className="text-muted-foreground">Win Rate</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">{player.totalGames}</p>
                  <p className="text-muted-foreground">Games</p>
                </div>
              </div>
              <div className="text-right min-w-0 max-w-32 sm:max-w-56">
                <p className="text-xl sm:text-2xl font-bold text-foreground break-all">
                  {formatAccountCoin(player.accountCoinWon)}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">Account Coin Won</p>
              </div>
            </button>
          ))}
          {!players.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">No completed games yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
