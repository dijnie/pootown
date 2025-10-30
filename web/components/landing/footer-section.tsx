"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AnimatedGridBackground from "./animated-grid-background";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export default function FooterSection() {
  const [gameCode, setGameCode] = useState("");

  const handleJoinGame = () => {
    if (gameCode.trim()) {
      alert(`Joining game with code: ${gameCode}`);
    }
  };

  return (
    <footer className="relative bg-white/90 border-t-8 border-black py-20 md:py-28 pb-20 md:pb-24">
      <AnimatedGridBackground />

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        {/* Main CTA Section */}
        <div className="grid md:grid-cols-2 gap-8 mb-20">
          {/* Join Game Card */}
          <div className="bg-[#14f195] border-6 border-black shadow-[14px_14px_0_#000] p-8 md:p-10 hover:shadow-[20px_20px_0_#000] hover:-translate-y-2 transition-all duration-500 group">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="w-16 h-16 border-4 border-black shadow-[4px_4px_0_#000] group-hover:scale-110 transition-transform duration-300">
                <AvatarImage walletAddress="JoinGame1111111111111111111111111111111" />
                <AvatarFallback
                  walletAddress="JoinGame1111111111111111111111111111111"
                  className="bg-white text-black text-xl font-black"
                >
                  JG
                </AvatarFallback>
              </Avatar>
              <h3 className="text-white text-3xl md:text-4xl font-black uppercase [text-shadow:4px_4px_0_#000]">
                Join Game
              </h3>
            </div>
            <p className="text-black text-lg font-bold mb-6">
              Enter game code to join an existing match
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Input
                type="text"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value)}
                placeholder="ENTER CODE..."
                className="flex-1 bg-white text-black border-4 border-black shadow-[6px_6px_0_#000] px-6 py-6 text-xl font-bold uppercase placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[10px_10px_0_#000] focus-visible:-translate-y-1 transition-all duration-300"
                onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
              />
              <Button
                onClick={handleJoinGame}
                className="bg-[#9945ff] text-white border-4 border-black shadow-[8px_8px_0_#000] px-8 py-6 text-xl font-black uppercase hover:bg-[#ffed00] hover:text-black hover:shadow-[12px_12px_0_#000] hover:-translate-y-1 active:scale-95 transition-all duration-300"
              >
                JOIN
              </Button>
            </div>
          </div>

          {/* Create Game Card */}
          <div className="bg-[#ff0080] border-6 border-black shadow-[14px_14px_0_#000] p-8 md:p-10 hover:shadow-[20px_20px_0_#000] hover:-translate-y-2 transition-all duration-500 group">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="w-16 h-16 border-4 border-black shadow-[4px_4px_0_#000] group-hover:scale-110 transition-transform duration-300">
                <AvatarImage walletAddress="StartGame111111111111111111111111111111" />
                <AvatarFallback
                  walletAddress="StartGame111111111111111111111111111111"
                  className="bg-white text-black text-xl font-black"
                >
                  SG
                </AvatarFallback>
              </Avatar>
              <h3 className="text-white text-3xl md:text-4xl font-black uppercase [text-shadow:4px_4px_0_#000]">
                Start Game
              </h3>
            </div>
            <p className="text-white text-lg font-bold mb-6">
              Create a new game and invite your friends
            </p>

            <Button className="w-full bg-[#ffed00] text-black border-4 border-black shadow-[8px_8px_0_#000] px-8 py-6 text-xl font-black uppercase hover:bg-white hover:shadow-[12px_12px_0_#000] hover:-translate-y-1 active:scale-95 transition-all duration-300">
              CREATE GAME
            </Button>
          </div>
        </div>

        {/* Devnet Banner */}
        <div className="bg-[#9945ff] text-white border-6 border-black shadow-[12px_12px_0_#000] px-8 py-6 mb-16 hover:shadow-[18px_18px_0_#000] hover:-translate-y-2 transition-all duration-500 cursor-pointer group">
          <div className="flex items-center justify-center gap-4">
            <Avatar className="w-12 h-12 border-4 border-black shadow-[4px_4px_0_#000] group-hover:scale-110 transition-transform duration-300">
              <AvatarImage walletAddress="Devnet11111111111111111111111111111111" />
              <AvatarFallback
                walletAddress="Devnet11111111111111111111111111111111"
                className="bg-[#ffed00] text-black text-lg font-black"
              >
                DE
              </AvatarFallback>
            </Avatar>
            <p className="text-xl md:text-2xl font-black uppercase [text-shadow:3px_3px_0_#000]">
              RUNNING ON DEVNET - FREE TO PLAY
            </p>
          </div>
        </div>

        {/* Footer Links & Info */}
        <div className="grid md:grid-cols-3 gap-8 md:gap-12 mb-12">
          {/* About */}
          <div>
            <h4 className="text-2xl font-black uppercase mb-4 text-black [text-shadow:2px_2px_0_#14f195]">
              About
            </h4>
            <p className="text-black text-base font-bold leading-relaxed">
              Panda Monopoly is a fully on-chain multiplayer board game built on
              Solana blockchain with real-time gameplay.
            </p>
          </div>

          {/* Tech Stack */}
          <div>
            <h4 className="text-2xl font-black uppercase mb-4 text-black [text-shadow:2px_2px_0_#ff0080]">
              Built With
            </h4>
            <ul className="space-y-2 text-black text-base font-bold">
              <li className="hover:text-[#9945ff] transition-colors cursor-pointer">
                → Solana Blockchain
              </li>
              <li className="hover:text-[#9945ff] transition-colors cursor-pointer">
                → MagicBlock Engine
              </li>
              <li className="hover:text-[#9945ff] transition-colors cursor-pointer">
                → Real-time Indexer
              </li>
              <li className="hover:text-[#9945ff] transition-colors cursor-pointer">
                → Next.js + React
              </li>
            </ul>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-2xl font-black uppercase mb-4 text-black [text-shadow:2px_2px_0_#ffed00]">
              Links
            </h4>
            <ul className="space-y-2 text-black text-base font-bold">
              <li className="hover:text-[#ff0080] transition-colors cursor-pointer">
                → Documentation
              </li>
              <li className="hover:text-[#ff0080] transition-colors cursor-pointer">
                → GitHub Repo
              </li>
              <li className="hover:text-[#ff0080] transition-colors cursor-pointer">
                → Discord Community
              </li>
              <li className="hover:text-[#ff0080] transition-colors cursor-pointer">
                → Twitter/X
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar - Black Background */}
      <div className="absolute bottom-0 left-0 right-0 bg-black py-4 md:py-6">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-center items-center gap-2 text-center">
          <p className="text-white text-sm md:text-base font-normal">
            PANDA MONOPOLY © 2025
          </p>
          {/* <a 
                        href="https://github.com/WeShipHQ/panda-monopoly" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-white font-bold underline hover:text-[#14f195] transition-colors duration-300"
                    >
                        Github
                    </a> */}
          <span className="text-white text-sm md:text-base font-normal">.</span>
        </div>
      </div>
    </footer>
  );
}
