"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface GameResultModalProps {
  isWinner: boolean;
  playerName: string;
  playerWallet: string;
  finalBalance: number;
  properties: number;
  turns: number;
  onPlayAgain: () => void;
  onGoHome: () => void;
}

export default function GameResultModal({
  isWinner,
  playerName,
  playerWallet,
  finalBalance,
  properties,
  turns,
  onPlayAgain,
  onGoHome,
}: GameResultModalProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", duration: 0.6 }}
        className={`relative max-w-2xl w-full border-8 border-black shadow-[20px_20px_0_#000] ${
          isWinner ? "bg-[#14f195]" : "bg-[#ff0080]"
        }`}
      >
        {/* Decorative Corner Elements */}
        <div className="absolute -top-6 -left-6 w-16 h-16 bg-[#ffed00] border-6 border-black rotate-12 shadow-[8px_8px_0_#000]" />
        <div className="absolute -top-6 -right-6 w-16 h-16 bg-[#9945ff] border-6 border-black -rotate-12 shadow-[8px_8px_0_#000]" />
        <div className="absolute -bottom-6 -left-6 w-16 h-16 bg-[#ff0080] border-6 border-black -rotate-12 shadow-[8px_8px_0_#000]" />
        <div className="absolute -bottom-6 -right-6 w-16 h-16 bg-[#14f195] border-6 border-black rotate-12 shadow-[8px_8px_0_#000]" />

        <div className="relative p-8 md:p-12">
          {/* Result Title */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-8"
          >
            <div className="inline-block bg-white border-6 border-black shadow-[12px_12px_0_#000] px-8 py-4 mb-6 -rotate-2">
              <h1 className="text-5xl md:text-7xl font-black uppercase text-black [text-shadow:4px_4px_0_rgba(0,0,0,0.2)]">
                {isWinner ? "🎉 VICTORY! 🎉" : "💔 GAME OVER 💔"}
              </h1>
            </div>
            <p className="text-2xl md:text-3xl font-black uppercase text-black">
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
            <div className="flex items-center gap-4 mb-4">
              <Avatar className="w-20 h-20 border-6 border-black shadow-[6px_6px_0_#000]">
                <AvatarImage walletAddress={playerWallet} />
                <AvatarFallback
                  walletAddress={playerWallet}
                  className="bg-[#9945ff] text-white text-2xl font-black"
                >
                  {playerName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-2xl font-black uppercase text-black">
                  {playerName}
                </h2>
                <p className="text-sm font-bold text-gray-600">
                  {playerWallet.slice(0, 8)}...{playerWallet.slice(-6)}
                </p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-[#ffed00] border-4 border-black shadow-[6px_6px_0_#000] p-4 text-center">
                <div className="text-3xl font-black text-black mb-1">
                  {finalBalance.toFixed(2)}
                </div>
                <div className="text-xs font-bold uppercase text-black">
                  $ Balance
                </div>
              </div>
              <div className="bg-[#9945ff] border-4 border-black shadow-[6px_6px_0_#000] p-4 text-center">
                <div className="text-3xl font-black text-white mb-1">
                  {properties}
                </div>
                <div className="text-xs font-bold uppercase text-white">
                  Properties
                </div>
              </div>
              <div className="bg-[#ff0080] border-4 border-black shadow-[6px_6px_0_#000] p-4 text-center">
                <div className="text-3xl font-black text-white mb-1">
                  {turns}
                </div>
                <div className="text-xs font-bold uppercase text-white">
                  Turns
                </div>
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <button
              onClick={onPlayAgain}
              className="flex-1 bg-[#9945ff] text-white border-6 border-black shadow-[8px_8px_0_#000] px-8 py-5 text-xl font-black uppercase transition-all duration-300 hover:bg-[#14f195] hover:text-black hover:shadow-[12px_12px_0_#000] hover:-translate-y-2 active:shadow-[4px_4px_0_#000] active:translate-y-0"
            >
              🎲 PLAY AGAIN
            </button>
            <button
              onClick={onGoHome}
              className="flex-1 bg-white text-black border-6 border-black shadow-[8px_8px_0_#000] px-8 py-5 text-xl font-black uppercase transition-all duration-300 hover:bg-[#ffed00] hover:shadow-[12px_12px_0_#000] hover:-translate-y-2 active:shadow-[4px_4px_0_#000] active:translate-y-0"
            >
              🏠 GO HOME
            </button>
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
          onClick={() => setIsVisible(false)}
          className="absolute -top-4 -right-4 w-12 h-12 bg-[#ff0080] border-6 border-black shadow-[6px_6px_0_#000] flex items-center justify-center text-2xl font-black text-white hover:bg-[#ffed00] hover:text-black hover:rotate-90 transition-all duration-300"
        >
          ✕
        </button>
      </motion.div>
    </div>
  );
}
