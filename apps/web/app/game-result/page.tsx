"use client";

import { useState } from "react";
import GameResultModal from "@/components/game/game-result-modal";

export default function GameResultPage() {
  const [showWinner, setShowWinner] = useState(false);
  const [showLoser, setShowLoser] = useState(false);

  return (
    <div className="min-h-screen bg-[#fffef0] flex items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-black uppercase text-black mb-4 [text-shadow:8px_8px_0_#ff0080]">
            GAME RESULT DEMO
          </h1>
          <p className="text-xl font-bold text-gray-700">
            Click buttons below to preview Winner/Loser screens
          </p>
        </div>

        {/* Demo Buttons */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Winner Button */}
          <div className="bg-[#14f195] border-6 border-black shadow-[12px_12px_0_#000] p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-3xl font-black uppercase text-black mb-2">
                WINNER SCREEN
              </h2>
              <p className="text-sm font-bold text-black/70">
                Show victory celebration
              </p>
            </div>
            <button
              onClick={() => setShowWinner(true)}
              className="w-full bg-[#9945ff] text-white border-5 border-black shadow-[8px_8px_0_#000] px-6 py-4 text-xl font-black uppercase transition-all duration-300 hover:bg-[#ffed00] hover:text-black hover:shadow-[12px_12px_0_#000] hover:-translate-y-2 active:shadow-[4px_4px_0_#000] active:translate-y-0"
            >
              SHOW WINNER
            </button>
          </div>

          {/* Loser Button */}
          <div className="bg-[#ff0080] border-6 border-black shadow-[12px_12px_0_#000] p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">💔</div>
              <h2 className="text-3xl font-black uppercase text-white mb-2">
                LOSER SCREEN
              </h2>
              <p className="text-sm font-bold text-white/70">
                Show game over screen
              </p>
            </div>
            <button
              onClick={() => setShowLoser(true)}
              className="w-full bg-white text-black border-5 border-black shadow-[8px_8px_0_#000] px-6 py-4 text-xl font-black uppercase transition-all duration-300 hover:bg-[#ffed00] hover:shadow-[12px_12px_0_#000] hover:-translate-y-2 active:shadow-[4px_4px_0_#000] active:translate-y-0"
            >
              SHOW LOSER
            </button>
          </div>
        </div>

        {/* Sample Data Info */}
        <div className="mt-12 bg-white border-6 border-black shadow-[12px_12px_0_#000] p-6">
          <h3 className="text-2xl font-black uppercase text-black mb-4">
            📊 SAMPLE DATA
          </h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm font-bold">
            <div>
              <span className="text-gray-600">Player Name:</span>{" "}
              <span className="text-black">Panda Master</span>
            </div>
            <div>
              <span className="text-gray-600">Wallet:</span>{" "}
              <span className="text-black">7xKXt...zVzb4q</span>
            </div>
            <div>
              <span className="text-gray-600">Final Balance:</span>{" "}
              <span className="text-black">15.75 $</span>
            </div>
            <div>
              <span className="text-gray-600">Properties:</span>{" "}
              <span className="text-black">8</span>
            </div>
            <div>
              <span className="text-gray-600">Turns:</span>{" "}
              <span className="text-black">42</span>
            </div>
          </div>
        </div>
      </div>

      {/* Winner Modal */}
      {showWinner && (
        <GameResultModal
          isWinner={true}
          playerName="Panda Master"
          playerWallet="7xKXtWb8X5SKYfhxDHxYqP1jHWi3zVzb4q"
          finalBalance={15.75}
          properties={8}
          turns={42}
          onPlayAgain={() => {
            setShowWinner(false);
            alert("Play Again clicked!");
          }}
          onGoHome={() => {
            setShowWinner(false);
            alert("Go Home clicked!");
          }}
        />
      )}

      {/* Loser Modal */}
      {showLoser && (
        <GameResultModal
          isWinner={false}
          playerName="Panda Rookie"
          playerWallet="3bZxS9FhNk2vP8qM7wR4tL6uY9jK1hV5d"
          finalBalance={0.25}
          properties={2}
          turns={28}
          onPlayAgain={() => {
            setShowLoser(false);
            alert("Play Again clicked!");
          }}
          onGoHome={() => {
            setShowLoser(false);
            alert("Go Home clicked!");
          }}
        />
      )}
    </div>
  );
}
