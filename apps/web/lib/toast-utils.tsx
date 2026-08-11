import React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { formatAddress } from "./utils";
import { surpriseCards, treasureCards } from "@/configs/board-data";
import { Address } from "@solana/kit";
import { GameEndReason } from "./sdk/generated";
import { UserAvatar } from "@/components/user-avatar";
import Link from "next/link";

interface RentPaymentToastProps {
  rentAmount: number;
  ownerAddress: string;
  propertyName: string;
}

interface RentPaymentFallbackToastProps {
  ownerAddress: string;
  propertyName: string;
}

interface TaxPaidToastProps {
  isCurrentPlayer: boolean;
  playerAddress: string;
  taxType: number;
  amount: bigint;
  position: number;
}

interface PlayerPassedGoToastProps {
  salaryCollected: bigint;
}

interface PlayerJoinedToastProps {
  playerAddress: string;
  playerIndex: number;
  totalPlayers: number;
}

interface GameStartedToastProps {
  totalPlayers: number;
  firstPlayer: string;
}

interface ChanceCardDrawnToastProps {
  playerAddress: string;
  cardIndex: number;
  isCurrentPlayer: boolean;
}

interface CommunityChestCardDrawnToastProps {
  playerAddress: string;
  cardIndex: number;
  isCurrentPlayer: boolean;
}

interface GoToJailToastProps {
  playerAddress: string;
  isCurrentPlayer: boolean;
}

export const showRentPaymentToast = ({
  rentAmount,
  ownerAddress,
  propertyName,
}: RentPaymentToastProps) => {
  toast.info(
    <div className="flex flex-col gap-1.5">
      <div className="text-sm">
        You paid{" "}
        <span
          className="font-bold px-2 py-0.5 rounded-md text-white"
          style={{ backgroundColor: "var(--chart-1)" }}
        >
          ${rentAmount}
        </span>{" "}
        rent to{" "}
        <span
          className="font-bold px-2 py-0.5 rounded-md text-white"
          style={{ backgroundColor: "var(--chart-2)" }}
        >
          {formatAddress(ownerAddress)}
        </span>
      </div>
      <div className="text-xs">
        for{" "}
        <span
          className="font-bold px-2 py-0.5 rounded-md text-white"
          style={{ backgroundColor: "var(--chart-3)" }}
        >
          {propertyName}
        </span>
      </div>
    </div>
  );
};

export const showRentPaymentFallbackToast = ({
  ownerAddress,
  propertyName,
}: RentPaymentFallbackToastProps) => {
  toast.info(
    <div className="flex flex-col gap-1.5">
      <div className="text-sm">
        You paid rent to{" "}
        <span
          className="font-bold px-2 py-0.5 rounded-md text-white"
          style={{ backgroundColor: "var(--chart-2)" }}
        >
          {formatAddress(ownerAddress)}
        </span>
      </div>
      <div className="text-xs">
        for{" "}
        <span
          className="font-bold px-2 py-0.5 rounded-md text-white"
          style={{ backgroundColor: "var(--chart-3)" }}
        >
          {propertyName}
        </span>
      </div>
    </div>
  );
};

export const showRentPaymentErrorToast = () => {
  toast.error(
    <div className="flex items-center gap-2">
      {/* <span>❌</span> */}
      <span className="font-semibold">
        Failed to pay rent. Please try again.
      </span>
    </div>
  );
};

export const showTaxPaidToast = ({
  isCurrentPlayer,
  playerAddress,
  taxType,
  amount,
}: TaxPaidToastProps) => {
  const taxTypeName =
    taxType === 1 ? "MEV Tax" : taxType === 2 ? "Priority Fee Tax" : "Tax";

  toast.warning(
    <div className="flex flex-col">
      <div className="text-sm">
        {isCurrentPlayer ? "You" : formatAddress(playerAddress)} paid{" "}
        <span
          className="font-bold px-2 py-0.5 rounded-md text-white"
          style={{ backgroundColor: "var(--chart-2)" }}
        >
          ${amount.toString()}
        </span>{" "}
        in{" "}
        <span
          className="font-bold px-2 py-0.5 rounded-md text-white"
          style={{ backgroundColor: "var(--chart-4)" }}
        >
          {taxTypeName}
        </span>
      </div>
    </div>
  );
};

export const showPlayerPassedGoToast = ({
  salaryCollected,
}: PlayerPassedGoToastProps) => {
  toast.success(
    <div className="flex flex-col gap-1.5">
      <div className="text-sm">
        🎉 You passed GO and collected{" "}
        <span
          className="font-bold px-2 py-0.5 rounded-md text-white"
          style={{ backgroundColor: "var(--chart-1)" }}
        >
          ${salaryCollected.toString()}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">Keep going! 💰</div>
    </div>
  );
};

export const showPlayerJoinedToast = ({
  playerAddress,
}: // playerIndex,
// totalPlayers,
PlayerJoinedToastProps) => {
  toast.info(
    <div className="flex flex-col">
      <div className="text-sm">
        <span
          className="font-bold px-2 py-0.5 rounded-md text-white"
          style={{ backgroundColor: "var(--chart-2)" }}
        >
          {formatAddress(playerAddress)}
        </span>{" "}
        joined the game!
      </div>
    </div>
  );
};

export const showGameStartedToast = ({
  firstPlayer,
}: GameStartedToastProps) => {
  toast.success(
    <div className="flex flex-col gap-1.5">
      <div className="text-sm font-semibold">🎮 Game Started!</div>
      <div className="text-xs text-muted-foreground">
        First player: {formatAddress(firstPlayer)}
      </div>
    </div>
  );
};

export const showChanceCardDrawnToast = ({
  playerAddress,
  cardIndex,
  isCurrentPlayer,
}: ChanceCardDrawnToastProps) => {
  const card = surpriseCards[cardIndex];
  const playerName = isCurrentPlayer ? "You" : formatAddress(playerAddress);

  if (!card) {
    toast.info(`${playerName} drew a Pump.fun Surprise card`);
    return;
  }

  toast.info(
    <div className="flex flex-col gap-1.5">
      <div className="text-sm font-semibold">
        🎲 {playerName} drew: {card.title}
      </div>
      <div className="text-xs text-muted-foreground">{card.description}</div>
    </div>,
    {
      duration: 5000,
    }
  );
};

export const showCommunityChestCardDrawnToast = ({
  playerAddress,
  cardIndex,
  isCurrentPlayer,
}: CommunityChestCardDrawnToastProps) => {
  const card = treasureCards[cardIndex];
  const playerName = isCurrentPlayer ? "You" : formatAddress(playerAddress);

  if (!card) {
    toast.info(`${playerName} drew an Airdrop Chest card`);
    return;
  }

  toast.info(
    <div className="flex flex-col gap-1.5">
      <div className="text-sm font-semibold">
        📦 {playerName} drew: {card.title}
      </div>
      <div className="text-xs text-muted-foreground">{card.description}</div>
    </div>,
    {
      duration: 5000,
    }
  );
};

export const showGoToJailToast = ({
  playerAddress,
  isCurrentPlayer,
}: GoToJailToastProps) => {
  const playerName = isCurrentPlayer ? "You" : formatAddress(playerAddress);

  toast.error(
    <div className="flex flex-col gap-1.5">
      <div className="text-sm">
        🚔 {playerName} {isCurrentPlayer ? "went" : "went"} to jail!
      </div>
      <div className="text-xs text-muted-foreground">
        {isCurrentPlayer
          ? "Better luck next time!"
          : "Ouch! That's gotta hurt."}
      </div>
    </div>
  );
};

interface PropertyPurchasedToastProps {
  propertyName: string;
  price: bigint;
  isCurrentPlayer: boolean;
  playerAddress?: string;
}

export const showPropertyPurchasedToast = ({
  propertyName,
  price,
  isCurrentPlayer,
  playerAddress,
}: PropertyPurchasedToastProps) => {
  if (isCurrentPlayer) {
    // Show "You bought XXX" for current player
    toast.success(
      <div className="flex flex-col gap-1.5">
        <div className="text-sm">
          🏠 You bought{" "}
          <span
            className="font-bold px-2 py-0.5 rounded-md text-white"
            style={{ backgroundColor: "var(--chart-3)" }}
          >
            {propertyName}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          for{" "}
          <span
            className="font-bold px-1 py-0.5 rounded text-white"
            style={{ backgroundColor: "var(--chart-1)" }}
          >
            ${price.toString()}
          </span>
        </div>
      </div>
    );
  } else {
    // Show "0x00 just bought YYY" for other players
    toast.info(
      <div className="flex flex-col gap-1.5">
        <div className="text-sm">
          <span
            className="font-bold px-2 py-0.5 rounded-md text-white"
            style={{ backgroundColor: "var(--chart-2)" }}
          >
            {formatAddress(playerAddress || "")}
          </span>{" "}
          just bought{" "}
          <span
            className="font-bold px-2 py-0.5 rounded-md text-white"
            style={{ backgroundColor: "var(--chart-3)" }}
          >
            {propertyName}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          for{" "}
          <span
            className="font-bold px-1 py-0.5 rounded text-white"
            style={{ backgroundColor: "var(--chart-1)" }}
          >
            ${price.toString()}
          </span>
        </div>
      </div>
    );
  }
};

interface GameEndedToastProps {
  winner: Address | string | null;
  reason: GameEndReason;
  winnerNetWorth: number | null;
  currentPlayerAddress: string | null;
}

export const showGameEndedToast = ({
  winner,
  reason,
  winnerNetWorth,
  currentPlayerAddress,
}: GameEndedToastProps) => {
  const getReasonText = (reason: GameEndReason): string => {
    switch (reason) {
      case GameEndReason.BankruptcyVictory:
        return "Bankruptcy Victory";
      case GameEndReason.TimeLimit:
        return "Time Limit Reached";
      case GameEndReason.Manual:
        return "Manual End";
      default:
        return "Game Ended";
    }
  };

  const isWinner =
    winner && currentPlayerAddress && winner === currentPlayerAddress;
  const hasWinner = winner !== null;

  toast(
    <>
      <div className="flex-col gap-3 p-2 w-full border border-red-500 hidden">
        {/* Header with game end styling */}
        <div className="flex items-center gap-2">
          <div
            className="px-3 py-1 border-2 border-black font-black text-sm uppercase"
            style={{
              backgroundColor: hasWinner
                ? isWinner
                  ? "#14f195"
                  : "#ff0080"
                : "#ffed00",
              color: "black",
              transform: "rotate(-1deg)",
            }}
          >
            {hasWinner
              ? isWinner
                ? "🎉 VICTORY!"
                : "💔 GAME OVER"
              : "🏁 GAME ENDED"}
          </div>
        </div>

        {/* Winner info */}
        {hasWinner && (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-bold">
              {isWinner ? (
                <span className="text-green-600">🏆 You are the champion!</span>
              ) : (
                <span>
                  🏆 Winner:{" "}
                  <span
                    className="font-bold px-2 py-0.5 rounded-md text-white text-xs"
                    style={{ backgroundColor: "var(--chart-1)" }}
                  >
                    {formatAddress(winner)}
                  </span>
                </span>
              )}
            </div>

            {winnerNetWorth && (
              <div className="text-xs text-muted-foreground">
                Final Net Worth:{" "}
                <span
                  className="font-bold px-1.5 py-0.5 rounded text-white"
                  style={{ backgroundColor: "var(--chart-2)" }}
                >
                  ${winnerNetWorth.toString()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Game end reason */}
        <div className="text-xs text-muted-foreground">
          Reason:{" "}
          <span
            className="font-bold px-1.5 py-0.5 rounded text-white"
            style={{ backgroundColor: "var(--chart-3)" }}
          >
            {getReasonText(reason)}
          </span>
        </div>

        {/* Call to action */}
        <div className="text-xs font-medium text-center pt-1 border-t border-gray-200">
          {isWinner ? "🎊 Congratulations! 🎊" : "Thanks for playing! 🎮"}
        </div>
      </div>

      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", duration: 0.6 }}
        className={`relative w-full border-2 border-black shadow-[20px_20px_0_#000] ${
          isWinner ? "bg-[#14f195]" : "bg-[#ff0080]"
        }`}
      >
        {/* Decorative Corner Elements */}
        <div className="absolute -top-6 -left-6 size-10 bg-[#ffed00] border-6 border-black rotate-12 shadow-[8px_8px_0_#000]" />
        <div className="absolute -top-6 -right-6 w-16 h-16 bg-[#9945ff] border-6 border-black -rotate-12 shadow-[8px_8px_0_#000]" />
        <div className="absolute -bottom-6 -left-6 w-16 h-16 bg-[#ff0080] border-6 border-black -rotate-12 shadow-[8px_8px_0_#000]" />
        <div className="absolute -bottom-6 -right-6 w-16 h-16 bg-[#14f195] border-6 border-black rotate-12 shadow-[8px_8px_0_#000]" />

        <div className="relative p-4">
          {/* Result Title */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-8"
          >
            <div className="inline-block bg-white border-2 border-black shadow-[12px_12px_0_#000] p-4 mb-4 -rotate-2">
              <h1 className="text-3xl font-black uppercase text-black [text-shadow:4px_4px_0_rgba(0,0,0,0.2)]">
                {isWinner ? "🎉 VICTORY! 🎉" : "💔 GAME OVER 💔"}
              </h1>
            </div>
            <p className="text-2xl font-black uppercase text-black">
              {isWinner
                ? "YOU'RE THE MONOPOLY CHAMPION!"
                : "BETTER LUCK NEXT TIME!"}
            </p>
          </motion.div>

          {/* Player Info */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white border-6 border-black shadow-[10px_10px_0_#000] p-6 mb-6"
          >
            <div className="flex flex-col items-center gap-4">
              {winner && <UserAvatar walletAddress={winner} size="lg" />}
              <p className="text-base font-bold">
                {winner?.slice(0, 8)}...{winner?.slice(-6)}
              </p>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link href="/lobby" className="flex-1">
              <button className="w-full bg-[#9945ff] text-white border-6 border-black shadow-[8px_8px_0_#000] px-8 py-5 text-xl font-black uppercase transition-all duration-300 hover:bg-[#14f195] hover:text-black hover:shadow-[12px_12px_0_#000] hover:-translate-y-2 active:shadow-[4px_4px_0_#000] active:translate-y-0">
                🎲 PLAY AGAIN
              </button>
            </Link>
            <Link href="/lobby" className="flex-1">
              <button className="w-full bg-white text-black border-6 border-black shadow-[8px_8px_0_#000] px-8 py-5 text-xl font-black uppercase transition-all duration-300 hover:bg-[#ffed00] hover:shadow-[12px_12px_0_#000] hover:-translate-y-2 active:shadow-[4px_4px_0_#000] active:translate-y-0">
                🏠 GO HOME
              </button>
            </Link>
          </motion.div>

          {/* Additional Winner Message */}
          {isWinner && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-6 text-center"
            >
              <div className="inline-block bg-black text-white border-6 border-black px-6 py-3 rotate-1">
                <p className="text-lg font-black uppercase">
                  🏆 LEGENDARY PANDA CHAMPION 🏆
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={() => toast.dismiss()}
          className="absolute -top-4 -right-4 w-12 h-12 bg-[#ff0080] border-6 border-black shadow-[6px_6px_0_#000] flex items-center justify-center text-2xl font-black text-white hover:bg-[#ffed00] hover:text-black hover:rotate-90 transition-all duration-300"
        >
          ✕
        </button>
      </motion.div>
    </>,
    {
      duration: Infinity,
      closeButton: false,
      position: "bottom-center",
      unstyled: true,
      classNames: {
        toast: "!border !border-red-500 !w-[600px] !translate-x-[-150px]",
        content: "w-full",
      },
      style: {
        // @ts-ignore
        "--width": "600px",
        width: "600px",
      },
    }
  );
};
