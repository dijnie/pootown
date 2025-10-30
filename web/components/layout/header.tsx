"use client";

import React, { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { ConnectWalletButton } from "../connect-wallet-button";
import Link from "next/link";
import { CreateGameWalletDialog } from "../create-game-wallet-dialog";

const scrolltoHash = function (element_id: string) {
  const element = document.getElementById(element_id);
  element?.scrollIntoView({
    behavior: "smooth",
    block: "end",
    inline: "nearest",
  });
};

const NavBar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateGameWalletDialogOpen, setIsCreateGameWalletDialogOpen] =
    useState(false);

  return (
    <>
      <nav className="fixed top-4 z-50 w-full px-4">
        <div
          className={cn(
            `mx-auto flex h-[80px] max-w-6xl w-full container
        items-center justify-between px-6 transition-transform
        duration-300 ease-in-out bg-chart-3 dark:bg-darkBg transform `
          )}
          style={{
            border: "3px solid black",
            boxShadow: "8px 8px 0px 0px #000000",
          }}
        >
          <div className="flex items-center gap-6">
            <h1
              className="text-3xl font-black font-Space_Grotesk tracking-tight
    text-black dark:text-white transform -rotate-2 hover:rotate-0 transition-transform
    duration-300 min-w-[80px] xs:min-w-[100px] lg:text-5xl"
            >
              <Link href="/lobby">
                <Image
                  src="/logo.jpg"
                  alt="Panda Monopoly Logo"
                  width={48}
                  height={48}
                />
              </Link>
            </h1>

            <NavLinks />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center text-base lg:text-lg space-x-6">
            <div className="flex items-center gap-4">
              <ConnectWalletButton
                onCreateGameWallet={() => setIsCreateGameWalletDialogOpen(true)}
              />
            </div>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center gap-4">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 bg-main dark:bg-main transform hover:-rotate-3 transition-transform"
              style={{
                border: "2px solid black",
                boxShadow: "4px 4px 0px 0px #000000",
              }}
            >
              <div className="w-6 h-0.5 bg-black mb-1"></div>
              <div className="w-6 h-0.5 bg-black mb-1"></div>
              <div className="w-6 h-0.5 bg-black"></div>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="fixed top-[120px] z-50 w-full px-4">
          <div
            className="w-full bg-white dark:bg-darkBg p-4 transform"
            style={{
              border: "3px solid black",
              boxShadow: "8px 8px 0px 0px #000000",
            }}
          >
            <MobileNavLinks setIsOpen={setIsOpen} />
            <div className="mt-4 p-2"></div>
          </div>
        </div>
      )}

      <CreateGameWalletDialog
        isOpen={isCreateGameWalletDialogOpen}
        onClose={() => setIsCreateGameWalletDialogOpen(false)}
      />
    </>
  );
};

function NavLinks() {
  const links = [
    // { href: "/", label: "Lobby" },
    { href: "/leaderboard", label: "Leaderboard" },
  ];

  return (
    <>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          target={link.href.startsWith("http") ? "_blank" : "_self"}
          rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="px-3 py-1 font-bold text-black dark:text-white hover:-translate-y-1 hover:rotate-2
                             transform transition-all duration-200"
          style={{
            border: "2px solid transparent",
            borderRadius: "0px",
          }}
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

function MobileNavLinks({
  setIsOpen,
}: {
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const links = [{ href: "/leaderboard", label: "Leaderboard" }];

  return (
    <div className="flex flex-col space-y-3">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target={link.href.startsWith("http") ? "_blank" : "_self"}
          rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="p-2 text-center text-lg font-bold bg-yellow-300 dark:bg-darkBg
                             transform hover:rotate-2 transition-transform"
          style={{
            border: "2px solid black",
            boxShadow: "4px 4px 0px 0px #000000",
          }}
          onClick={(e) => {
            if (link.href.startsWith("#")) {
              e.preventDefault();
              scrolltoHash(link.href.substring(1));
            }
            setIsOpen(false);
          }}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

export default NavBar;
