"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatAddress, formatPrice } from "@/lib/utils";
import { useGameContext } from "@/components/providers/game-provider";
import { useWallet } from "@/hooks/use-wallet";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserAvatar } from "@/components/user-avatar";
import { PlayerAccount } from "@/types/schema";

interface BalanceChangeAnimationProps {
  change: number;
  onComplete: () => void;
}

function BalanceChangeAnimation({
  change,
  onComplete,
}: BalanceChangeAnimationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (change === 0) return null;

  const isPositive = change > 0;
  const sign = isPositive ? "+" : "";
  const colorClass = isPositive ? "text-green-600" : "text-red-600";

  return (
    <motion.div
      initial={{
        opacity: 1,
        y: 0,
        scale: 1,
      }}
      animate={{
        opacity: [1, 1, 1, 0],
        y: [0, 20, 25, 30],
        scale: [1, 1.1, 1, 0.9],
      }}
      transition={{
        duration: 2.5,
        times: [0, 0.3, 0.8, 1],
        ease: "easeOut",
      }}
      className={cn(
        "absolute left-0 top-1/2 mt-1 text-xs font-bold z-10 pointer-events-none",
        colorClass
      )}
    >
      {sign}
      {formatPrice(Math.abs(change), { maxDecimals: 0, minDecimals: 0 })}
    </motion.div>
  );
}

interface PlayerItemProps {
  player: PlayerAccount;
  index: number;
  isCurrentTurn: boolean;
  isYou: boolean;
  isWinner: boolean;
}

function PlayerItem({
  player,
  isCurrentTurn,
  isYou,
  isWinner,
}: PlayerItemProps) {
  const [previousBalance, setPreviousBalance] = useState<number | null>(null);
  const [balanceChange, setBalanceChange] = useState<number>(0);
  const [animationKey, setAnimationKey] = useState<number>(0);
  const currentBalance = Number(player.cashBalance);

  useEffect(() => {
    if (previousBalance !== null && previousBalance !== currentBalance) {
      const change = currentBalance - previousBalance;
      setBalanceChange(change);
      setAnimationKey((prev) => prev + 1);
    }
    setPreviousBalance(currentBalance);
  }, [currentBalance, previousBalance]);

  const handleAnimationComplete = () => {
    setBalanceChange(0);
  };

  return (
    <Card
      className={cn("py-3 relative")}
      style={
        isCurrentTurn
          ? {
              backgroundColor: player.playerColor,
            }
          : {}
      }
    >
      <CardContent className="px-3">
        <div className="flex items-center gap-3 justify-stretch">
          <div className="relative">
            <UserAvatar walletAddress={player.wallet} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium truncate">
                {formatAddress(player.wallet)}
                {isYou && <span className="text-xs text-main"> (You)</span>}
              </p>
            </div>
            <div className="relative">
              <motion.p
                className="text-sm"
                key={`balance-${animationKey}`}
                initial={{ scale: 1 }}
                animate={{
                  scale: balanceChange !== 0 ? [1, 1.05, 1] : 1,
                }}
                transition={{
                  duration: 0.3,
                  times: [0, 0.5, 1],
                }}
              >
                {formatPrice(currentBalance)}
              </motion.p>
              <AnimatePresence mode="wait">
                {balanceChange !== 0 && (
                  <BalanceChangeAnimation
                    key={`change-${animationKey}`}
                    change={balanceChange}
                    onComplete={handleAnimationComplete}
                  />
                )}
              </AnimatePresence>
            </div>

            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1 mt-1">
              {player.inJail && (
                <Badge variant="default" className="text-xs">
                  Jail
                </Badge>
              )}
              {player.isBankrupt && (
                <Badge className="text-xs bg-red-100 text-red-800">
                  Bankrupt
                </Badge>
              )}
              {isWinner && (
                <Badge className="text-xs bg-green-100 text-green-800">
                  Winner
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlayerLoadingItem() {
  return (
    <Card className="animate-pulse">
      <CardContent className="px-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-300 rounded w-3/4"></div>
            <div className="h-3 bg-gray-300 rounded w-1/2"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PlayerList() {
  const { wallet } = useWallet();
  const { gameState, players, gameLoading } = useGameContext();

  if (gameLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Players</h2>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((id) => (
            // @ts-expect-error
            <PlayerLoadingItem key={id} />
          ))}
        </div>
      </div>
    );
  }

  if (!gameState || !players.length) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Players</h2>
        <p className="text-muted-foreground">No players found</p>
      </div>
    );
  }

  const currentPlayerIndex = gameState.currentTurn;

  return (
    <Card className="bg-white">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Players</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {players.map((player, index) => {
          const isCurrentTurn = index === currentPlayerIndex;
          return (
            <PlayerItem
              key={player.wallet}
              player={player}
              index={index}
              isCurrentTurn={isCurrentTurn}
              isYou={player.wallet === wallet?.address}
              isWinner={gameState.winner === player.wallet}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
