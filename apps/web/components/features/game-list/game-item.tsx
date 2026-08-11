"use client";

import type { SessionView } from "@pootown/game-contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatAddress, formatTimeAgo } from "@/lib/utils";

interface GameItemProps {
  readonly game: SessionView;
  readonly joining: boolean;
  readonly onJoinGame: (game: SessionView) => void;
}

function lifecycleBadge(game: SessionView) {
  if (game.lifecycle === "open") {
    return <Badge className="bg-green-500 text-white">WAITING FOR PLAYERS</Badge>;
  }
  if (game.lifecycle === "active" || game.lifecycle === "recoveryRequired") {
    return <Badge variant="neutral" className="bg-gray-500 text-white">IN PLAY</Badge>;
  }
  if (game.lifecycle === "settled") {
    return <Badge variant="neutral" className="bg-red-500 text-white">FINISHED</Badge>;
  }
  return <Badge variant="neutral">{game.lifecycle.toUpperCase()}</Badge>;
}

function formatCoin(value: string): string {
  return new Intl.NumberFormat("en-US").format(BigInt(value));
}

export function GameItem({ game, joining, onJoinGame }: GameItemProps) {
  return (
    <Card className="bg-chart-3">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex -space-x-2" aria-label={`${game.currentPlayers} joined players`}>
              {Array.from({ length: game.maximumPlayers }, (_, seat) => (
                <div
                  key={seat}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-white text-sm font-bold sm:h-12 sm:w-12 ${seat < game.currentPlayers ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}
                >
                  {seat < game.currentPlayers ? seat + 1 : "?"}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="break-all text-base font-semibold text-foreground sm:text-lg">
                {game.entryCoin === "0" ? "FREE" : `${formatCoin(game.entryCoin)} ACCOUNT COIN`}
              </span>
              {lifecycleBadge(game)}
            </div>
          </div>
          {game.lifecycle === "open" && game.currentPlayers < game.maximumPlayers && (
            <Button onClick={() => onJoinGame(game)} loading={joining}>
              Join
            </Button>
          )}
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex flex-row gap-2 xs:items-center xs:gap-4">
              <span className="font-medium">Players: {game.currentPlayers}/{game.maximumPlayers}</span>
              <span className="text-muted-foreground">Game ID: {formatAddress(game.gameId)}</span>
            </div>
            <div>Created: {formatTimeAgo(new Date(game.createdAtMs))}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
