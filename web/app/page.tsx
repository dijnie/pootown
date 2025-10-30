"use client";

import {
  Header,
  FAQSection,
  FooterSection,
  HeroSection,
  HowItWorksSection,
  KeyFeaturesSection,
  MarqueeBar,
  RoadmapSection,
} from "@/components/landing";

export default function MonopolyLanding() {
  return (
    <div className="min-h-screen bg-[#fffef0] text-black font-mono overflow-x-hidden relative">
      <Header />
      <HeroSection />
      <HowItWorksSection />
      <KeyFeaturesSection />
      <RoadmapSection />
      <FAQSection />
      <MarqueeBar />
      <FooterSection />

      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-25px) rotate(5deg);
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes slide-in-left {
          from {
            opacity: 0;
            transform: translateX(-100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slide-in-bottom {
          from {
            opacity: 0;
            transform: translateY(50px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-in-top {
          from {
            opacity: 0;
            transform: translateY(-50px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }

        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        @keyframes scroll-progress {
          0% {
            transform: translateX(-100%);
            background: #14f195;
          }
          25% {
            background: #9945ff;
          }
          50% {
            background: #ff0080;
          }
          75% {
            background: #ffed00;
          }
          100% {
            transform: translateX(100%);
            background: #14f195;
          }
        }

        @keyframes scroll-progress-vertical {
          0% {
            transform: translateY(-100%);
            background: #14f195;
          }
          25% {
            background: #9945ff;
          }
          50% {
            background: #ff0080;
          }
          75% {
            background: #ffed00;
          }
          100% {
            transform: translateY(100%);
            background: #14f195;
          }
        }

        .animate-fill-both {
          animation-fill-mode: both;
        }
      `}</style>
    </div>
  );
}
