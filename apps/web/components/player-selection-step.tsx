"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { PlayerAccount } from "@/types/schema";
import { Card, CardContent } from "./ui/card";
import { formatAddress } from "@/lib/utils";
import { playSound, SOUND_CONFIG } from "@/lib/soundUtil";

interface PlayerSelectionStepProps {
  players: PlayerAccount[];
  onPlayerSelect: (player: PlayerAccount) => void;
}

interface PlayerSelectionStepProps {
  players: PlayerAccount[];
  onPlayerSelect: (player: PlayerAccount) => void;
}

export function PlayerSelectionStep({
  players,
  onPlayerSelect,
}: PlayerSelectionStepProps) {
  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-muted-foreground mb-1">
          No other players available
        </div>
        <div className="text-xs text-muted-foreground">
          Wait for more players to join the game
        </div>
      </div>
    );
  }

  // Neobrutalism colors for different users
  const playerColors = [
    { bg: 'bg-[#88AAEE]', icon: 'bg-[#3366CC]' },
    { bg: 'bg-[#FF6B6B]', icon: 'bg-[#CC0000]' },
    { bg: 'bg-[#4ECDC4]', icon: 'bg-[#0E9F8F]' },
    { bg: 'bg-[#A98CFF]', icon: 'bg-[#7B3FF2]' },
    { bg: 'bg-[#FFD93D]', icon: 'bg-[#F4B000]' },
    { bg: 'bg-[#FF87CA]', icon: 'bg-[#E63980]' },
    { bg: 'bg-[#95E1D3]', icon: 'bg-[#38B2A3]' },
    { bg: 'bg-[#FFA07A]', icon: 'bg-[#FF6347]' },
  ];

  return (
    <div className="py-2">
      {players.map((player) => (
        <Card key={player.wallet}>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage
                  walletAddress={player.wallet}
                  alt={`${player.wallet} token`}
                  className="w-full h-full object-cover"
                />
                <AvatarFallback className="bg-emerald-600 text-white font-bold">
                  {player.wallet.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {formatAddress(player.wallet)}
                </div>
                <div className="flex flex-col text-xs mt-0.5 space-y-0.5">
                  <div className="font-medium">${player.cashBalance}</div>
                </div>
              </div>
            </div>

            <Button
              variant="default"
              disabled={player.isBankrupt}
              size="sm"
              onClick={() => !player.isBankrupt && onPlayerSelect(player)}
            >
              {player.isBankrupt ? "Bankrupt" : "Select"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
