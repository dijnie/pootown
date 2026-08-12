"use client";

import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";
import { playDiceRollSequence, stopDiceRollSequence } from "@/lib/soundUtil";
import { useGameContext } from "@/components/providers/game-provider";
import { commandErrorMessage } from "@/services/command-error-message";
import { toast } from "sonner";
import "../../../styles/dice.css";

const diceRotations = {
  1: [-0.1, 0.3, -1],
  2: [-0.1, 0.6, -0.4],
  3: [-0.85, -0.42, 0.73],
  4: [-0.8, 0.3, -0.75],
  5: [0.3, 0.45, 0.9],
  6: [-0.16, 0.6, 0.18],
};

interface DiceContextType {
  dice1: number;
  dice2: number;
  isRolling: boolean;
  isThrowAnimation: boolean;
  canRoll: boolean;
  handleRollDice: () => Promise<void>;
  dice1Ref: React.RefObject<HTMLDivElement | null>;
  dice2Ref: React.RefObject<HTMLDivElement | null>;
}

const DiceContext = createContext<DiceContextType | null>(null);

const DiceFace = ({ className }: { className: string }) => (
  <div className={`dice-face ${className}`}>
    {/* Dots are handled by CSS. */}
  </div>
);

export const DiceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [dice1, setDice1] = useState(1);
  const [dice2, setDice2] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [isThrowAnimation, setIsThrowAnimation] = useState(false);

  const isWaitingForResult = useRef(false);
  const dice1Ref = useRef<HTMLDivElement>(null);
  const dice2Ref = useRef<HTMLDivElement>(null);

  const { currentPlayerState, canRollDice, rollDice, demoDices } =
    useGameContext();

  const canRoll = canRollDice();

  const handleRollDice = async () => {
    if (!canRoll || isRolling) return;
    playDiceRollSequence();
    setIsRolling(true);
    setIsThrowAnimation(true);
    isWaitingForResult.current = true;

    // Reset dice rotations and start rolling animation
    if (dice1Ref.current) {
      dice1Ref.current.style.transform = "rotate3d(0, 0.9, 0.9, 60deg)";
    }
    if (dice2Ref.current) {
      dice2Ref.current.style.transform = "rotate3d(0, 0.9, 0.9, 120deg)";
    }

    // Submit the intent; the room owns dice generation and publishes the result.
    try {
      await rollDice(demoDices ? demoDices : undefined);
      await new Promise((resolve) => setTimeout(resolve, 6000));
    } catch (error) {
      toast.error(commandErrorMessage(error));
      stopDiceRollSequence();
      setIsRolling(false);
      setIsThrowAnimation(false);
      isWaitingForResult.current = false;
      return;
    }
  };

  useEffect(() => {
    if (
      isWaitingForResult.current &&
      currentPlayerState?.lastDiceRoll &&
      currentPlayerState.lastDiceRoll.length >= 2
    ) {
      const dice1Value = currentPlayerState.lastDiceRoll[0];
      const dice2Value = currentPlayerState.lastDiceRoll[1];

      if (
        dice1Value >= 1 &&
        dice1Value <= 6 &&
        dice2Value >= 1 &&
        dice2Value <= 6
      ) {
        // Stop rolling animation
        setIsRolling(false);

        // Set final dice values
        setDice1(dice1Value);
        setDice2(dice2Value);

        // Start throw animation
        setIsThrowAnimation(true);
        // Set final rotations
        if (dice1Ref.current) {
          const [x, y, z] =
            diceRotations[dice1Value as keyof typeof diceRotations];
          dice1Ref.current.style.transform = `rotate3d(${x}, ${y}, ${z}, 180deg)`;
        }

        if (dice2Ref.current) {
          const [x, y, z] =
            diceRotations[dice2Value as keyof typeof diceRotations];
          dice2Ref.current.style.transform = `rotate3d(${x}, ${y}, ${z}, 180deg)`;
        }

        stopDiceRollSequence();

        // Reset states after animation
        setTimeout(() => {
          setIsThrowAnimation(false);
          isWaitingForResult.current = false;
        }, 1000);
      }
    }
  }, [currentPlayerState?.lastDiceRoll]);

  useEffect(() => {
    if (
      !isRolling &&
      currentPlayerState?.lastDiceRoll &&
      currentPlayerState.lastDiceRoll.length >= 2
    ) {
      const dices = Array.from(currentPlayerState.lastDiceRoll);
      setDice1(dices[0]);
      setDice2(dices[1]);
    }
  }, [currentPlayerState?.lastDiceRoll, isRolling]);

  const contextValue: DiceContextType = {
    dice1,
    dice2,
    isRolling,
    isThrowAnimation,
    canRoll,
    handleRollDice,
    dice1Ref,
    dice2Ref,
  };

  return (
    <DiceContext.Provider value={contextValue}>{children}</DiceContext.Provider>
  );
};

export const useDiceContext = () => {
  const context = useContext(DiceContext);
  if (!context) {
    throw new Error("useDiceContext must be used within a DiceProvider");
  }
  return context;
};

export const DicesOnly: React.FC = () => {
  const { isRolling, isThrowAnimation, dice1Ref, dice2Ref } = useDiceContext();

  return (
    <div className="flex justify-center">
      <div className="flex gap-[var(--dice-gap)]">
        {/* Dice 1 - 3D */}
        <div className="dice-wrapper">
          <div
            ref={dice1Ref}
            className={`dice-3d dice-1 ${isRolling ? "dice-rolling" : ""} ${
              isThrowAnimation ? "dice-throw" : ""
            }`}
          >
            <DiceFace className="dice-front" />
            <DiceFace className="dice-back" />
            <DiceFace className="dice-right" />
            <DiceFace className="dice-left" />
            <DiceFace className="dice-top" />
            <DiceFace className="dice-bottom" />
          </div>
        </div>
        {/* Dice 2 - 3D with different animation */}
        <div className="dice-wrapper">
          <div
            ref={dice2Ref}
            className={`dice-3d dice-2 ${isRolling ? "dice-rolling" : ""} ${
              isThrowAnimation ? "dice-throw" : ""
            }`}
          >
            <DiceFace className="dice-front" />
            <DiceFace className="dice-back" />
            <DiceFace className="dice-right" />
            <DiceFace className="dice-left" />
            <DiceFace className="dice-top" />
            <DiceFace className="dice-bottom" />
          </div>
        </div>
      </div>
    </div>
  );
};
