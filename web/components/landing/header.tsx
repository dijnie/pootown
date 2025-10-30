"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 border-b-4 border-black shadow-[0_4px_0_#000]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-8 lg:px-12">
        <div className="flex items-center justify-between py-4 md:py-5">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-12 h-12 md:w-14 md:h-14 border-4 border-black bg-white shadow-[4px_4px_0_#000] group-hover:shadow-[6px_6px_0_#000] group-hover:-translate-y-1 transition-all duration-300">
              <Image
                src="/logo.jpg"
                alt="Poo Town"
                fill
                className="object-cover"
              />
            </div>
            <span className="text-xl md:text-2xl font-black uppercase tracking-tight text-black group-hover:text-[#ff0080] transition-colors duration-300">
              POO TOWN
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden lg:flex items-center gap-2">
            <Link
              href="#how-it-works"
              className="px-5 py-2 font-bold uppercase text-black hover:bg-[#14f195] hover:text-black border-2 border-transparent hover:border-black hover:shadow-[3px_3px_0_#000] transition-all duration-300"
            >
              How It Works
            </Link>
            <Link
              href="#features"
              className="px-5 py-2 font-bold uppercase text-black hover:bg-[#ffed00] hover:text-black border-2 border-transparent hover:border-black hover:shadow-[3px_3px_0_#000] transition-all duration-300"
            >
              Features
            </Link>
            <Link
              href="#roadmap"
              className="px-5 py-2 font-bold uppercase text-black hover:bg-[#9945ff] hover:text-black border-2 border-transparent hover:border-black hover:shadow-[3px_3px_0_#000] transition-all duration-300"
            >
              Roadmap
            </Link>
            <Link
              href="#faq"
              className="px-5 py-2 font-bold uppercase text-black hover:bg-[#ff0080] hover:text-black border-2 border-transparent hover:border-black hover:shadow-[3px_3px_0_#000] transition-all duration-300"
            >
              FAQ
            </Link>
          </nav>

          {/* CTA Button */}
          <div className="flex items-center gap-3">
            <Link
              href="/lobby"
              className="bg-[#9945ff] text-black border-4 border-black shadow-[5px_5px_0_#000] px-5 md:px-6 py-2 md:py-3 font-black uppercase text-sm md:text-base transition-all duration-300 hover:bg-[#14f195] hover:shadow-[7px_7px_0_#000] hover:-translate-y-1 active:shadow-[3px_3px_0_#000] active:translate-y-0 flex items-center gap-2"
            >
              PLAY NOW
            </Link>

            {/* Mobile Menu Button */}
            <button className="lg:hidden bg-black text-white border-4 border-black shadow-[4px_4px_0_#ff0080] px-3 py-2 font-black hover:shadow-[6px_6px_0_#ff0080] hover:-translate-y-1 transition-all duration-300">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
