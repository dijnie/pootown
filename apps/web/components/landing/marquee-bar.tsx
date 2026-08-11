"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export default function MarqueeBar() {
  return (
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
  );
}
