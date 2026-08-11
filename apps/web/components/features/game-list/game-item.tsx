"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Eye } from "lucide-react";
import { GameAccount } from "@/types/schema";
import { GameStatus } from "@/lib/sdk/generated";
import {
  formatAddress,
  formatNumber,
  formatPrice,
  formatTimeAgo,
  lamportsToSol,
} from "@/lib/utils";

interface GameItemProps {
  game: GameAccount;
  onJoinGame: (game: GameAccount) => void;
  onSpectateGame: (gameId: string) => void;
  joining: boolean;
  isWalletConnected: boolean;
}

export function GameItem({
  game,
  onJoinGame,
  onSpectateGame,
  joining,
  isWalletConnected,
}: GameItemProps) {
  const getGameStatusBadge = (status: GameStatus) => {
    switch (status) {
      case GameStatus.WaitingForPlayers:
        return (
          <Badge variant="default" className="bg-green-500 text-white">
            WAITING FOR PLAYERS
          </Badge>
        );
      case GameStatus.InProgress:
        return (
          <Badge variant="neutral" className="bg-gray-500 text-white">
            IN-PLAY
          </Badge>
        );
      case GameStatus.Finished:
        return (
          <Badge variant="neutral" className="bg-red-500 text-white">
            FINISHED
          </Badge>
        );
      default:
        return <Badge variant="neutral">UNKNOWN</Badge>;
    }
  };

  const getPlayerAvatars = (players: string[], maxPlayers: number) => {
    const avatars = [];

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      avatars.push(
        <Avatar
          key={player}
          className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-white"
        >
          <AvatarImage walletAddress={player} />
          <AvatarFallback
            walletAddress={player}
            className="bg-blue-500 text-white text-xs sm:text-sm"
          >
            {player.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      );
    }

    for (let i = players.length; i < maxPlayers; i++) {
      avatars.push(
        <Avatar
          key={`empty-${i}`}
          className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-gray-300 bg-gray-100"
        >
          <AvatarFallback className="bg-gray-200 text-gray-400 text-xs sm:text-sm">
            ?
          </AvatarFallback>
        </Avatar>
      );
    }

    return avatars;
  };

  return (
    <Card className="bg-chart-3">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {getPlayerAvatars(game.players, game.maxPlayers)}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-semibold text-foreground">
                  {game.entryFee > 0
                    ? `◎ ${formatNumber(lamportsToSol(Number(game.entryFee)))}`
                    : "FREE"}
                </span>
              </div>

              {/* Game status */}
              {getGameStatusBadge(game.gameStatus)}
            </div>
          </div>

          {/* Right side - Action buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {game.gameStatus === GameStatus.WaitingForPlayers &&
              isWalletConnected && (
                <Button
                  onClick={() => onJoinGame(game)}
                  // className="bg-green-500 hover:bg-green-600 text-white px-4 sm:px-6 flex-1 sm:flex-none"
                  loading={joining}
                >
                  Join
                </Button>
              )}

            <Button
              variant="neutral"
              size="icon"
              onClick={() => onSpectateGame(game.address)}
              className="w-10 h-10 flex-shrink-0"
            >
              <Eye className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 text-sm">
            <div className="flex flex-row xs:items-center gap-2 xs:gap-4">
              <span className="font-medium">
                Players: {game.currentPlayers}/{game.maxPlayers}
              </span>
              <span className="text-muted-foreground">
                Game ID: {formatAddress(game.address)}
              </span>
              {/* {game.timeLimit && (
                <span className="text-muted-foreground">
                  Time Limit: {Number(game.timeLimit) / 60}min
                </span>
              )} */}
            </div>
            <div>
              Created: {formatTimeAgo(new Date(Number(game.createdAt) * 1000))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
