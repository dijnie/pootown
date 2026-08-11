"use client";

import { useMemo, useState } from "react";

import env from "@/configs/env";
import { useRealtimeLeaderboard } from "@/hooks/use-realtime-leaderboard";
import { getRandomAvatarByAddress } from "@/lib/avatar-utils";
import type { TopPlayerItem } from "@/services/leaderboard";

import { LeaderboardStats } from "./leaderboard-stats";
import { LeaderboardTable } from "./leaderboard-table";
import { PlayerProfileModal } from "./player-profile-modal";

export interface PlayerStats {
  id: string;
  username: string;
  avatar: string;
  rank: number;
  wins: number;
  losses: number;
  totalGames: number;
  accountCoinWon: string;
  winRate: number;
}

export function formatPlayerId(playerId: string): string {
  if (playerId.length <= 14) return playerId;
  return `${playerId.slice(0, 7)}...${playerId.slice(-5)}`;
}

export function formatAccountCoin(value: string): string {
  return BigInt(value).toLocaleString("en-US");
}

export function mapTopPlayerToStats(item: TopPlayerItem): PlayerStats {
  const losses = Math.max(0, item.gamesPlayed - item.gamesWon);
  return {
    accountCoinWon: item.accountCoinWon,
    avatar: getRandomAvatarByAddress(item.playerId),
    id: item.playerId,
    losses,
    rank: item.rank,
    totalGames: item.gamesPlayed,
    username: item.displayName ?? formatPlayerId(item.playerId),
    winRate: item.gamesPlayed === 0 ? 0 : (item.gamesWon / item.gamesPlayed) * 100,
    wins: item.gamesWon,
  };
}

export function Leaderboard() {
  const [selectedPlayer, setSelectedPlayer] = useState<TopPlayerItem | null>(null);
  const { error, loading, pagination, players: rawPlayers } = useRealtimeLeaderboard({
    enabled: true,
    pollingInterval: env.NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS,
  });
  const players = useMemo(() => rawPlayers.map(mapTopPlayerToStats), [rawPlayers]);

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Leaderboard</h1>
        <p className="text-muted-foreground">All-time results from completed Panda Monopoly games</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <LeaderboardStats players={players} totalRankedPlayers={pagination?.total ?? 0} />
      </div>

      {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
      {loading && <div className="text-muted-foreground text-sm mb-4">Loading leaderboard...</div>}

      <LeaderboardTable
        players={players}
        onPlayerClick={(player) => {
          setSelectedPlayer(rawPlayers.find((candidate) => candidate.playerId === player.id) ?? null);
        }}
      />

      <PlayerProfileModal
        player={selectedPlayer}
        isOpen={selectedPlayer !== null}
        onClose={() => setSelectedPlayer(null)}
      />
    </div>
  );
}
