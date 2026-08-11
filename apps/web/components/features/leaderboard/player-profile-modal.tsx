"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, Copy, Target, Trophy } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getRandomAvatarByAddress } from "@/lib/avatar-utils";
import type { TopPlayerItem } from "@/services/leaderboard";

import { formatAccountCoin, formatPlayerId } from "./leaderboard";

interface PlayerProfileModalProps {
  player: TopPlayerItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PlayerProfileModal({ player, isOpen, onClose }: PlayerProfileModalProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
  }, []);

  if (player === null) return null;

  const username = player.displayName ?? formatPlayerId(player.playerId);
  const avatar = getRandomAvatarByAddress(player.playerId);
  const losses = Math.max(0, player.gamesPlayed - player.gamesWon);
  const winRate = player.gamesPlayed === 0 ? 0 : (player.gamesWon / player.gamesPlayed) * 100;

  const copyPlayerId = async () => {
    try {
      await navigator.clipboard.writeText(player.playerId);
      setCopied(true);
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto sm:p-6 p-4 space-y-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="w-12 h-12">
              <AvatarImage src={avatar} alt={username} />
              <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold truncate">{username}</h2>
                <Badge variant="neutral" className="shrink-0">Rank #{player.rank}</Badge>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate" title={player.playerId}>Player ID: {formatPlayerId(player.playerId)}</span>
                <Button variant="neutral" size="sm" onClick={() => void copyPlayerId()} className="h-6 w-6 p-0" aria-label="Copy player ID">
                  <Copy className="w-3 h-3" />
                </Button>
                {copied && <span className="text-green-500">Copied!</span>}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex gap-2"><Trophy className="w-4 h-4 text-yellow-500" />Win Rate</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{winRate.toFixed(1)}%</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex gap-2"><Coins className="w-4 h-4 text-green-500" />Account Coin Won</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold break-all">{formatAccountCoin(player.accountCoinWon)}</div>
              <p className="text-xs text-muted-foreground mt-1">Non-withdrawable account coin</p>
            </CardContent>
          </Card>
          <Card className="sm:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex gap-2"><Target className="w-4 h-4 text-blue-500" />Completed Games</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div><div className="text-2xl font-bold">{player.gamesPlayed}</div><p className="text-xs text-muted-foreground">Played</p></div>
              <div><div className="text-2xl font-bold">{player.gamesWon}</div><p className="text-xs text-muted-foreground">Won</p></div>
              <div><div className="text-2xl font-bold">{losses}</div><p className="text-xs text-muted-foreground">Lost</p></div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
