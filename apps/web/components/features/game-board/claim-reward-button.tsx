"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameContext } from "@/components/providers/game-provider";
import { useWallet } from "@/hooks/use-wallet";
import { toast } from "sonner";
import { GameStatus } from "@/lib/sdk/generated";

export function ClaimRewardButton() {
  const [isLoading, setIsLoading] = useState(false);
  const { gameState, claimReward } = useGameContext();
  const { wallet } = useWallet();

  const shouldShowClaimButton =
    gameState &&
    gameState.gameStatus === GameStatus.Finished &&
    gameState.winner &&
    gameState.entryFee > 0 &&
    !gameState.prizeClaimed &&
    wallet?.address &&
    gameState.winner === wallet.address;

  const shouldShowClaimedStatus =
    gameState &&
    gameState.gameStatus === GameStatus.Finished &&
    gameState.winner &&
    gameState.entryFee > 0 &&
    gameState.prizeClaimed &&
    wallet?.address &&
    gameState.winner === wallet.address;

  const handleClaimReward = async () => {
    if (!gameState || !wallet?.address) {
      toast.error("Wallet not connected");
      return;
    }

    setIsLoading(true);
    try {
      await claimReward();
      toast.success("Reward claimed successfully! 🎉");
    } catch (error) {
      console.error("Failed to claim reward:", error);
      toast.error("Failed to claim reward. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!shouldShowClaimButton && !shouldShowClaimedStatus) {
    return null;
  }

  return (
    <Card className="">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-black uppercase text-black text-center">
          🏆 Victory Reward 🏆
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {shouldShowClaimButton && (
          <>
            <div className="text-center space-y-2">
              <p className="text-lg font-bold text-black">
                Congratulations! You won the game!
              </p>
              <p className="text-sm font-semibold text-black/80">
                Prize Pool: {Number(gameState.totalPrizePool || 0) / 10 ** 9}{" "}
                SOL
              </p>
            </div>
            <Button
              onClick={handleClaimReward}
              disabled={isLoading}
              className="w-full bg-[#ffed00] text-black border-4 border-black shadow-[6px_6px_0_#000] font-black uppercase text-lg py-6 hover:bg-[#ff0080] hover:text-white hover:shadow-[8px_8px_0_#000] hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Claiming..." : "🎁 Claim Reward"}
            </Button>
          </>
        )}

        {shouldShowClaimedStatus && (
          <div className="text-center space-y-2">
            <div className="bg-white border-4 border-black shadow-[6px_6px_0_#000] p-4 rounded-lg">
              <p className="text-2xl font-black uppercase text-[#14f195] mb-2">
                ✅ Prize Claimed!
              </p>
              <p className="text-sm font-bold text-black/70">
                You have successfully claimed your victory reward!
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
