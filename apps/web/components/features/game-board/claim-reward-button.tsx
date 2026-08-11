"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameContext } from "@/components/providers/game-provider";
import { formatAddress } from "@/lib/utils";
import { GameStatus } from "@/types/schema";

export function ClaimRewardButton() {
  const { gameState, ownPlayerId } = useGameContext();
  if (gameState?.gameStatus !== GameStatus.Finished || gameState.winner === null) return null;
  const isWinner = gameState.winner === ownPlayerId;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-center text-xl font-black uppercase text-black">
          {isWinner ? "🏆 You won!" : "Game finished"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-center">
        <p className="font-semibold text-black/80">Winner: {formatAddress(gameState.winner)}</p>
        <p className="text-sm font-bold text-black/70">
          {gameState.prizeClaimed ? "Account-coin settlement completed." : "Account-coin settlement is processing automatically."}
        </p>
      </CardContent>
    </Card>
  );
}
