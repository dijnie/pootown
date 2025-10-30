"use client";

import AnimatedGridBackground from "./animated-grid-background";

export default function RoadmapSection() {
  const roadmapItems = [
    {
      phase: "Q1 2025",
      title: "BETA LAUNCH",
      status: "LIVE",
      desc: "Devnet release with core gameplay",
      color: "#14f195",
    },
    {
      phase: "Q2 2025",
      title: "MAINNET",
      status: "COMING",
      desc: "Full mainnet launch with tournaments",
      color: "#9945ff",
    },
    {
      phase: "Q3 2025",
      title: "NFT MARKETPLACE",
      status: "PLANNED",
      desc: "Trade properties on secondary market",
      color: "#ff0080",
    },
    {
      phase: "Q4 2025",
      title: "MOBILE APP",
      status: "PLANNED",
      desc: "iOS & Android native apps",
      color: "#ffed00",
    },
  ];

  return (
    <section
      id="roadmap"
      className="relative py-24 md:py-36 px-6 md:px-12 lg:px-20 bg-white/90 border-t-8 border-black scroll-mt-20"
    >
      <AnimatedGridBackground />
      <div className="max-w-6xl mx-auto relative z-10">
        <h2 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase mb-20 text-center text-black [text-shadow:10px_10px_0_#ff0080] hover:[text-shadow:14px_14px_0_#ff0080] transition-all duration-300">
          ROADMAP
        </h2>

        <div className="flex gap-12 items-start relative">
          {/* Vertical Progress Indicator Bar */}
          <div className="flex-shrink-0 flex items-start gap-6 sticky top-24">
            <div
              className="flex flex-col justify-between h-full py-2"
              style={{ height: "100%", minHeight: "600px" }}
            >
              {["Q1", "Q2", "Q3", "Q4"].map((q, i) => (
                <div
                  key={i}
                  className="text-2xl font-black text-black hover:scale-125 transition-transform duration-300 cursor-pointer"
                >
                  {q}
                </div>
              ))}
            </div>
            <div className="w-4 bg-white border-4 border-black relative overflow-hidden self-stretch">
              <div className="absolute inset-0 bg-[#14f195] animate-[scroll-progress-vertical_3s_ease-in-out_infinite]"></div>
            </div>
          </div>

          <div className="flex-1 space-y-10">
            {roadmapItems.map((item, i) => (
              <div
                key={i}
                className="border-6 border-black shadow-[12px_12px_0_#000] p-8 md:p-10 hover:shadow-[18px_18px_0_#000] hover:-translate-x-3 hover:scale-[1.02] transition-all duration-500 flex flex-col md:flex-row md:items-center gap-8 cursor-pointer group relative overflow-hidden"
                style={{ backgroundColor: item.color }}
              >
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
                <div className="flex-shrink-0 relative z-10">
                  <div className="text-4xl md:text-5xl font-black text-black [text-shadow:4px_4px_0_rgba(255,255,255,0.5)] group-hover:scale-110 transition-transform duration-300">
                    {item.phase}
                  </div>
                </div>
                <div className="flex-1 relative z-10">
                  <h3 className="text-3xl md:text-4xl font-black uppercase mb-3 text-black [text-shadow:2px_2px_0_rgba(255,255,255,0.5)]">
                    {item.title}
                  </h3>
                  <p className="text-xl md:text-2xl font-bold text-black [text-shadow:1px_1px_0_rgba(255,255,255,0.5)]">
                    {item.desc}
                  </p>
                </div>
                <div className="flex-shrink-0 relative z-10">
                  <div className="bg-black border-5 border-white shadow-[6px_6px_0_rgba(0,0,0,0.3)] px-6 py-3 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                    <span className="text-white font-black text-lg uppercase">
                      {item.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
