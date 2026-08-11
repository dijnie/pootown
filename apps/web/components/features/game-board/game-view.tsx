// Imports: add useState
"use client";

import { useEffect, useState } from "react";
import GameBoard from "./game-board";

import { useGameContext } from "@/components/providers/game-provider";
import { useParams } from "next/navigation";
import { address } from "@solana/kit";
import { LeftPanel } from "./left-panel";
import { RightPanel } from "./right-panel";
import { Spinner } from "@/components/ui/spinner";

export function GameView() {
  const { address: gameAddress } = useParams<{ address: string }>();
  const { setGameAddress, gameState, gameLoading, gameError } =
    useGameContext();

  // Board rotation state lifted here
  const [boardRotation, setBoardRotation] = useState<number>(0);

  const handleRotateClockwise = () => {
    setBoardRotation((prev) => (prev + 90) % 360);
  };

  const handleRotateCounterClockwise = () => {
    setBoardRotation((prev) => (prev - 90 + 360) % 360);
  };

  useEffect(() => {
    if (gameAddress) {
      setGameAddress(address(gameAddress));
    }
  }, [gameAddress]);

  if (gameLoading || !gameState) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Spinner variant="bars" />
      </div>
    );
  }

  if (gameError) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div id="error">
          <p>ERROR: {gameError?.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-screen xl:h-screen game-container w-full h-full relative">
      <div
        style={{
          gridArea: "left",
        }}
        className="overflow-hidden h-full relative z-10"
      >
        <LeftPanel
          onRotateCW={handleRotateClockwise}
          onRotateCCW={handleRotateCounterClockwise}
          boardRotation={boardRotation}
        />
      </div>
      <div
        style={{
          gridArea: "center",
        }}
        className="aspect-square w-screen lg:w-auto lg:h-[80vh] xl:h-screen"
      >
        <GameBoard boardRotation={boardRotation} />
      </div>
      <div
        style={{
          gridArea: "right",
        }}
        className="relative z-10"
      >
        <RightPanel />
      </div>
    </div>
  );
}
