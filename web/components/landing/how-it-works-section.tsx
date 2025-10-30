"use client";

import { useState } from "react";
import AnimatedGridBackground from "./animated-grid-background";

export default function HowItWorksSection() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const steps = [
    {
      num: "01",
      title: "CONNECT WALLET",
      desc: "Link your Solana wallet to start playing",
      color: "#ff0080",
    },
    {
      num: "02",
      title: "ROLL DICE",
      desc: "Roll the dice and move around the board",
      color: "#9945ff",
    },
    {
      num: "03",
      title: "BUY PROPERTIES",
      desc: "Purchase NFT properties with SOL",
      color: "#14f195",
    },
    {
      num: "04",
      title: "COLLECT RENT",
      desc: "Earn SOL when opponents land on your properties",
      color: "#ffed00",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="relative py-24 md:py-36 px-6 md:px-12 lg:px-20 bg-white/90 border-t-8 border-black scroll-mt-20"
    >
      <AnimatedGridBackground />
      <div className="max-w-7xl mx-auto relative z-10">
        <h2 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase mb-20 text-center text-black [text-shadow:10px_10px_0_#ff0080] hover:[text-shadow:14px_14px_0_#ff0080] transition-all duration-300">
          HOW IT WORKS
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div
              key={i}
              className="border-6 border-black shadow-[12px_12px_0_#000] p-8 hover:shadow-[18px_18px_0_#000] hover:-translate-y-3 hover:rotate-2 hover:scale-105 transition-all duration-500 animate-[slide-in-bottom_0.6s_ease-out] animate-fill-both cursor-pointer group relative overflow-hidden"
              style={{
                backgroundColor: step.color,
                animationDelay: `${i * 0.15}s`,
              }}
              onMouseEnter={() => setHoveredCard(i)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div
                className={`absolute inset-0 bg-white opacity-0 ${
                  hoveredCard === i ? "opacity-20" : ""
                } transition-opacity duration-300`}
              />
              <div className="text-7xl md:text-8xl font-black text-black mb-6 [text-shadow:5px_5px_0_rgba(255,255,255,0.5)] group-hover:scale-110 transition-transform duration-300 relative z-10">
                {step.num}
              </div>
              <h3 className="text-2xl md:text-3xl font-black uppercase mb-4 text-black [text-shadow:2px_2px_0_rgba(255,255,255,0.5)] relative z-10">
                {step.title}
              </h3>
              <p className="text-lg md:text-xl font-bold text-black [text-shadow:1px_1px_0_rgba(255,255,255,0.5)] relative z-10">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
