"use client";

import { useState, useEffect, useMemo } from "react";
import AnimatedGridBackground from "./animated-grid-background";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";

export default function HeroSection() {
  return (
    <div className="relative min-h-screen flex flex-col pt-[50px] bg-white/90 border-b-8 border-black">
      <AnimatedGridBackground />

      {/* Panda Character - Centered Vertically */}
      <div className="absolute top-1/2 -translate-y-1/2 right-[3%] lg:right-[5%] xl:right-[8%] z-20 hidden lg:block pointer-events-none">
        <img
          src="/images/panda-background-hero.png"
          alt="Panda Monopoly"
          className="w-[550px] h-[550px] xl:w-[680px] xl:h-[680px] object-contain"
        />
      </div>

      {/* Main hero content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 md:px-8 lg:px-12 xl:px-16 py-20 w-full lg:max-w-[48%] xl:max-w-[45%]">
        <div className="mb-7 animate-[slide-in-top_0.8s_ease-out] animate-fill-both">
          <div className="bg-[#ff0080] border-4 border-black shadow-[7px_7px_0_#000] px-6 py-3 inline-block hover:shadow-[11px_11px_0_#000] hover:-translate-y-1 hover:rotate-2 transition-all duration-300 cursor-pointer">
            <span className="text-white font-black text-sm md:text-lg uppercase tracking-wider">
              ⚡ BETA V1.0 - LIVE ON DEVNET
            </span>
          </div>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-[6.5rem] xl:text-[7.5rem] font-black uppercase leading-[0.85] mb-7 lg:mb-9">
          <span className="block text-black hover:text-[#ff0080] transition-colors duration-300 animate-[slide-in-left_0.8s_ease-out] animate-fill-both cursor-pointer">
            MONOPOLY
          </span>
          <span className="block text-black hover:text-[#9945ff] transition-colors duration-300 animate-[slide-in-left_0.9s_ease-out] animate-fill-both cursor-pointer">
            ON{" "}
            <span className="inline-block bg-[#14f195] px-3 lg:px-4 border-4 lg:border-5 border-black shadow-[6px_6px_0_#000] lg:shadow-[7px_7px_0_#000] hover:shadow-[9px_9px_0_#000] hover:-translate-y-2 transition-all duration-300">
              SOLANA
            </span>
          </span>
        </h1>

        <div className="bg-[#ffed00] text-black border-4 lg:border-5 border-black shadow-[9px_9px_0_#000] lg:shadow-[12px_12px_0_#000] px-6 lg:px-7 py-6 lg:py-7 mb-9 lg:mb-11 hover:shadow-[13px_13px_0_#000] lg:hover:shadow-[18px_18px_0_#000] hover:-translate-y-3 hover:rotate-1 transition-all duration-500 animate-[slide-in-right_0.8s_ease-out_0.3s] animate-fill-both group cursor-pointer relative overflow-hidden">
          <div className="absolute inset-0 bg-[#ff0080] translate-x-full group-hover:translate-x-0 transition-transform duration-700" />
          <p className="text-lg md:text-xl lg:text-2xl font-black uppercase leading-tight relative z-10 group-hover:text-black transition-colors duration-700">
            Classic Monopoly meets Solana speed—Buy NFTs, Earn SOL, Crush
            opponents in decentralized chaos! 🎲
          </p>
        </div>

        <Link href="/lobby">
          <button className="bg-[#9945ff] text-white border-4 lg:border-5 border-black shadow-[11px_11px_0_#000] lg:shadow-[14px_14px_0_#000] px-7 lg:px-9 py-5 lg:py-6 text-xl md:text-2xl lg:text-3xl font-black uppercase max-w-fit transition-all duration-500 hover:bg-[#14f195] hover:text-black hover:scale-110 hover:rotate-3 hover:shadow-[16px_16px_0_#000] lg:hover:shadow-[20px_20px_0_#000] active:scale-95 active:shadow-[7px_7px_0_#000] lg:active:shadow-[9px_9px_0_#000] animate-[slide-in-bottom_0.8s_ease-out_0.5s] animate-fill-both group relative overflow-hidden">
            <span className="relative z-10">🚀 CONNECT WALLET & PLAY</span>
            <div className="absolute inset-0 bg-[#ff0080] translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
          </button>
        </Link>

        {/* Panda for Mobile/Tablet */}
        <div className="lg:hidden flex justify-center mt-12">
          <img
            src="/images/panda-background-hero.png"
            alt="Panda Monopoly"
            className="w-[200px] h-[200px] md:w-[250px] md:h-[250px] object-contain"
          />
        </div>
      </div>

      <div className="relative z-10 border-t-6 border-b-6 border-black bg-[#14f195] py-6 overflow-hidden">
        <div className="flex whitespace-nowrap animate-[marquee_20s_linear_infinite]">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center shrink-0">
              <span className="text-3xl md:text-5xl font-black uppercase text-black mx-8 [text-shadow:4px_4px_0_rgba(255,255,255,0.5)]">
                ROLL THE DICE
              </span>
              <Avatar className="w-12 h-12 md:w-16 md:h-16 border-4 border-black shadow-[4px_4px_0_#000] mx-8 shrink-0">
                <AvatarImage walletAddress="RollDice111111111111111111111111111111" />
                <AvatarFallback
                  walletAddress="RollDice111111111111111111111111111111"
                  className="bg-[#ff0080] text-black text-xl font-black"
                >
                  RD
                </AvatarFallback>
              </Avatar>
              <span className="text-3xl md:text-5xl font-black uppercase text-black mx-8 [text-shadow:4px_4px_0_rgba(255,255,255,0.5)]">
                BUY PROPERTIES
              </span>
              <Avatar className="w-12 h-12 md:w-16 md:h-16 border-4 border-black shadow-[4px_4px_0_#000] mx-8 shrink-0">
                <AvatarImage walletAddress="BuyProperty11111111111111111111111111" />
                <AvatarFallback
                  walletAddress="BuyProperty11111111111111111111111111"
                  className="bg-[#9945ff] text-black text-xl font-black"
                >
                  BP
                </AvatarFallback>
              </Avatar>
              <span className="text-3xl md:text-5xl font-black uppercase text-black mx-8 [text-shadow:4px_4px_0_rgba(255,255,255,0.5)]">
                COLLECT RENT
              </span>
              <Avatar className="w-12 h-12 md:w-16 md:h-16 border-4 border-black shadow-[4px_4px_0_#000] mx-8 shrink-0">
                <AvatarImage walletAddress="CollectRent1111111111111111111111111111" />
                <AvatarFallback
                  walletAddress="CollectRent1111111111111111111111111111"
                  className="bg-[#ffed00] text-black text-xl font-black"
                >
                  CR
                </AvatarFallback>
              </Avatar>
              <span className="text-3xl md:text-5xl font-black uppercase text-black mx-8 [text-shadow:4px_4px_0_rgba(255,255,255,0.5)]">
                WIN SOL
              </span>
              <Avatar className="w-12 h-12 md:w-16 md:h-16 border-4 border-black shadow-[4px_4px_0_#000] mx-8 shrink-0">
                <AvatarImage walletAddress="WinSol1111111111111111111111111111111111" />
                <AvatarFallback
                  walletAddress="WinSol1111111111111111111111111111111111"
                  className="bg-[#ff0080] text-black text-xl font-black"
                >
                  WS
                </AvatarFallback>
              </Avatar>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .bg-grid {
          position: absolute;
          top: 5%;
          left: 5%;
          width: 90%;
          height: 90%;
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          grid-template-rows: repeat(6, 1fr);
          grid-auto-flow: dense;
          gap: 8px;
          z-index: 1;
          opacity: 0.25;
          pointer-events: none;
        }

        @media (min-width: 768px) {
          .bg-grid {
            grid-template-columns: repeat(12, 1fr);
            grid-template-rows: repeat(8, 1fr);
            gap: 10px;
            opacity: 0.3;
          }
        }

        @media (min-width: 1024px) {
          .bg-grid {
            grid-template-columns: repeat(16, 1fr);
            grid-template-rows: repeat(10, 1fr);
            gap: 12px;
            opacity: 0.35;
          }
        }

        .property-block {
          border: 4px solid #000;
          background: var(--bg-color);
          box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.6);
          transition: all 0.3s ease;
          animation: blockFadeIn 1s ease-out both;
          min-height: 30px;
          border-radius: 2px;
        }

        @keyframes blockFadeIn {
          from {
            opacity: 0;
            transform: scale(0.8) rotate(0deg);
          }
          to {
            opacity: 1;
            transform: scale(1) rotate(var(--rotation, 0deg));
          }
        }
      `}</style>
    </div>
  );
}
