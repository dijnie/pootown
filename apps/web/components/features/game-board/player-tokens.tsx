"use client";

import { PlayerAccount } from "@/types/schema";
import React, { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface PlayerTokenProps {
  player: PlayerAccount;
  position: number;
  boardRotation: number;
  playersOnSameSpace: PlayerAccount[];
  isPlaying: boolean;
}

export const PlayerToken: React.FC<PlayerTokenProps> = ({
  player,
  position,
  boardRotation,
  playersOnSameSpace,
  isPlaying,
}) => {
  const [animatedPosition, setAnimatedPosition] = useState(position);
  const [isAnimating, setIsAnimating] = useState(false);
  const previousPositionRef = useRef(position);
  
  // Animate player movement step by step
  useEffect(() => {
    const oldPos = previousPositionRef.current;
    const newPos = position;
    
    if (oldPos === newPos) return;
    
    // Calculate the number of steps to move
    const steps = newPos > oldPos 
      ? newPos - oldPos 
      : (40 - oldPos) + newPos; // Handle wrapping around the board
    
    if (steps === 0 || steps > 12) {
      // If too many steps or no movement, jump directly
      setAnimatedPosition(newPos);
      previousPositionRef.current = newPos;
      return;
    }
    
    // Animate step by step
    setIsAnimating(true);
    let currentStep = 0;
    const stepDelay = 300; // ms per step - slower for smoother movement
    
    const animationInterval = setInterval(() => {
      currentStep++;
      const intermediatePos = (oldPos + currentStep) % 40;
      setAnimatedPosition(intermediatePos);
      
      if (currentStep >= steps) {
        clearInterval(animationInterval);
        setIsAnimating(false);
        previousPositionRef.current = newPos;
      }
    }, stepDelay);
    
    return () => clearInterval(animationInterval);
  }, [position]);
  
  // Position token based on board position (40 spaces total)
  const getTokenPosition = (pos: number) => {
    // 14x14 grid with 2x2 corner spaces and 2x2 side spaces
    // Each grid cell is approximately 7.14% wide (100% / 14)
    const cellSize = 7.14;
    const cornerCenter = 10.71; // Center of 2x2 corner (1.5 cells from edge)
    const sideSpaceCenter = 17.86; // Center position for 2x2 side spaces

    if (pos === 0) {
      // GO corner (bottom-right) - center of 2x2 corner
      return { left: `${100 - cornerCenter}%`, top: `${100 - cornerCenter}%` };
    } else if (pos >= 1 && pos <= 9) {
      // Bottom row (right to left from GO) - center of 2x2 side spaces
      const spaceIndex = pos - 1;
      const left = 100 - sideSpaceCenter - spaceIndex * ((cellSize * 10) / 9); // Adjust spacing for 9 spaces in 10 cells
      return { left: `${left}%`, top: `${100 - cornerCenter}%` };
    } else if (pos === 10) {
      // JAIL corner (bottom-left) - center of 2x2 corner
      return { left: `${cornerCenter}%`, top: `${100 - cornerCenter}%` };
    } else if (pos >= 11 && pos <= 19) {
      // Left column (bottom to top) - center of 2x2 side spaces
      const spaceIndex = pos - 11;
      const top = 100 - sideSpaceCenter - spaceIndex * ((cellSize * 10) / 9); // Adjust spacing for 9 spaces in 10 cells
      return { left: `${cornerCenter}%`, top: `${top}%` };
    } else if (pos === 20) {
      // Free Parking corner (top-left) - center of 2x2 corner
      return { left: `${cornerCenter}%`, top: `${cornerCenter}%` };
    } else if (pos >= 21 && pos <= 29) {
      // Top row (left to right) - center of 2x2 side spaces
      const spaceIndex = pos - 21;
      const left = sideSpaceCenter + spaceIndex * ((cellSize * 10) / 9); // Adjust spacing for 9 spaces in 10 cells
      return { left: `${left}%`, top: `${cornerCenter}%` };
    } else if (pos === 30) {
      // Go To Jail corner (top-right) - center of 2x2 corner
      return { left: `${100 - cornerCenter}%`, top: `${cornerCenter}%` };
    } else if (pos >= 31 && pos <= 39) {
      // Right column (top to bottom) - center of 2x2 side spaces
      const spaceIndex = pos - 31;
      const top = sideSpaceCenter + spaceIndex * ((cellSize * 10) / 9); // Adjust spacing for 9 spaces in 10 cells
      return { left: `${100 - cornerCenter}%`, top: `${top}%` };
    } else {
      // Default fallback
      return { left: "50%", top: "50%" };
    }
  };

  // Use animated position instead of final position
  const baseTokenPos = getTokenPosition(animatedPosition);

  // Handle multiple players on same space
  const getAdjustedPosition = () => {
    if (playersOnSameSpace.length <= 1) {
      return baseTokenPos;
    }

    const tokenIndex = playersOnSameSpace.findIndex(
      (p) => p.wallet === player.wallet
    );
    const offsetDistance = 1.5; // Distance between tokens in percentage (reduced for better centering)

    let adjustedLeft = parseFloat(baseTokenPos.left);
    let adjustedTop = parseFloat(baseTokenPos.top);

    if (playersOnSameSpace.length === 2) {
      // Arrange horizontally
      const offset = tokenIndex === 0 ? -offsetDistance : offsetDistance;
      adjustedLeft += offset;
    } else if (playersOnSameSpace.length === 3) {
      // Arrange in triangle
      const offsets = [
        { x: -offsetDistance, y: -offsetDistance },
        { x: offsetDistance, y: -offsetDistance },
        { x: 0, y: offsetDistance },
      ];
      adjustedLeft += offsets[tokenIndex].x;
      adjustedTop += offsets[tokenIndex].y;
    } else if (playersOnSameSpace.length === 4) {
      // Arrange in 2x2 grid
      const offsets = [
        { x: -offsetDistance, y: -offsetDistance },
        { x: offsetDistance, y: -offsetDistance },
        { x: -offsetDistance, y: offsetDistance },
        { x: offsetDistance, y: offsetDistance },
      ];
      adjustedLeft += offsets[tokenIndex].x;
      adjustedTop += offsets[tokenIndex].y;
    }

    return { left: `${adjustedLeft}%`, top: `${adjustedTop}%` };
  };

  const tokenPos = getAdjustedPosition();

  return (
    <div
      className={`absolute w-10 h-10 flex items-center justify-center transition-all ease-in-out ${
        isAnimating ? 'duration-300' : 'duration-500'
      }`}
      style={{
        left: tokenPos.left,
        top: tokenPos.top,
        transform: `translate(-50%, -50%) rotate(${-boardRotation}deg) ${isAnimating ? 'scale(1.15)' : 'scale(1)'}`,
        zIndex: isAnimating ? 2000 : 1000 + player.wallet, // Elevate during animation
      }}
    >
      {/* Location-like shape with avatar */}
      <div className="relative w-full h-full">
        <div
          className={cn("absolute inset-0 rounded-full bg-white/20 shadow-lg", {
            "border-main border-3": isPlaying,
            "border-white/40 border-2": !isPlaying,
          })}
        />

        {/* Inner avatar container */}
        <div className="absolute inset-1 rounded-full overflow-hidden bg-white shadow-md">
          <Avatar className="w-full h-full">
            <AvatarImage
              walletAddress={player.wallet}
              alt={`${player.wallet} token`}
              className="w-full h-full object-cover"
            />
            <AvatarFallback
              walletAddress={player.wallet}
              className="w-full h-full text-xs font-bold bg-gradient-to-br from-blue-400 to-purple-500 text-white"
            >
              {player.wallet.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Glow effect */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-500/20 blur-sm"></div>
      </div>
    </div>
  );
};

interface PlayerTokensContainerProps {
  players: PlayerAccount[];
  boardRotation: number;
  currentPlayer: string;
}

export const PlayerTokensContainer: React.FC<PlayerTokensContainerProps> = ({
  players,
  boardRotation,
  currentPlayer,
}) => {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1000 }}
    >
      {players.map((player) => {
        const playersOnSameSpace = players.filter(
          (p) => p.position === player.position
        );

        return (
          <PlayerToken
            key={player.address}
            player={player}
            position={player.position}
            boardRotation={boardRotation}
            playersOnSameSpace={playersOnSameSpace}
            isPlaying={player.wallet === currentPlayer}
          />
        );
      })}
    </div>
  );
};
