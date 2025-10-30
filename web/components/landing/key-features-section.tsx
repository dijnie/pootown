"use client";

import AnimatedGridBackground from "./animated-grid-background";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export default function KeyFeaturesSection() {
  const features = [
    {
      walletAddress: "MagicBlock1111111111111111111111111111111",
      title: "MAGICBLOCK",
      desc: "Lightning-fast gameplay powered by MagicBlock's ephemeral rollups for instant transactions",
      color: "#9945ff",
    },
    {
      walletAddress: "Indexer11111111111111111111111111111111",
      title: "INDEXER",
      desc: "Real-time game state tracking with advanced indexing for seamless multiplayer experience",
      color: "#14f195",
    },
    {
      walletAddress: "Solana111111111111111111111111111111111",
      title: "SOLANA",
      desc: "Built on Solana for ultra-low fees and blazing-fast transactions. Play without breaking the bank",
      color: "#ffed00",
    },
  ];

  return (
    <section
      id="features"
      className="relative py-32 px-6 md:px-12 lg:px-20 bg-white/90 border-t-8 border-black scroll-mt-20"
    >
      <AnimatedGridBackground />
      <div className="max-w-7xl mx-auto relative z-10">
        <h2 className="text-6xl md:text-8xl font-black uppercase mb-24 text-center text-black hover:scale-105 transition-transform duration-300 cursor-pointer">
          <span className="inline-block bg-[#9945ff] text-black px-8 py-4 border-6 border-black shadow-[12px_12px_0_#000] hover:shadow-[18px_18px_0_#000] hover:-translate-y-2 transition-all duration-300">
            KEY FEATURES
          </span>
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <div
              key={i}
              className="border-6 border-black shadow-[16px_16px_0_#000] p-12 hover:shadow-[24px_24px_0_#000] hover:-translate-y-5 hover:scale-105 hover:rotate-2 transition-all duration-700 cursor-pointer group relative overflow-hidden"
              style={{ backgroundColor: feature.color }}
            >
              <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
              <div className="mb-8 group-hover:scale-125 group-hover:rotate-12 transition-all duration-700 relative z-10 flex justify-center">
                <Avatar className="w-24 h-24 sm:w-32 sm:h-32 border-6 border-black shadow-[8px_8px_0_#000] group-hover:shadow-[12px_12px_0_#000] transition-all duration-700">
                  <AvatarImage walletAddress={feature.walletAddress} />
                  <AvatarFallback
                    walletAddress={feature.walletAddress}
                    className="bg-white text-black text-2xl font-black"
                  >
                    {feature.walletAddress.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <h3 className="text-4xl font-black uppercase mb-6 text-black [text-shadow:3px_3px_0_rgba(255,255,255,0.5)] relative z-10">
                {feature.title}
              </h3>
              <p className="text-xl font-bold text-black [text-shadow:1px_1px_0_rgba(255,255,255,0.5)] relative z-10 leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
