"use client";

import React from "react";
import { useDiceContext } from "./dice-provider";
import "../../styles/dice.css";

interface DiceFaceProps {
  value: number;
  className: string;
}

const DiceFace: React.FC<DiceFaceProps> = ({ value, className }) => (
  <div className={`dice-face ${className}`} data-value={value}>
    {/* Dots are handled by CSS */}
  </div>
);

interface SingleDiceProps {
  diceNumber: 1 | 2;
  value: number;
  diceRef: React.RefObject<HTMLDivElement>;
  isRolling: boolean;
  isThrowAnimation: boolean;
}

const SingleDice: React.FC<SingleDiceProps> = ({
  diceNumber,
  value,
  diceRef,
  isRolling,
  isThrowAnimation,
}) => {
  const diceClasses = [
    "dice-3d",
    `dice-${diceNumber}`,
    isRolling ? "dice-rolling" : "",
    isThrowAnimation ? "dice-throw" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="dice-wrapper">
      <div ref={diceRef} className={diceClasses}>
        <DiceFace value={value} className="dice-front" />
        <DiceFace value={7 - value} className="dice-back" />
        <DiceFace value={((value + 1) % 6) + 1} className="dice-right" />
        <DiceFace value={((value + 2) % 6) + 1} className="dice-left" />
        <DiceFace value={((value + 3) % 6) + 1} className="dice-top" />
        <DiceFace value={((value + 4) % 6) + 1} className="dice-bottom" />
      </div>
    </div>
  );
};

export const DiceVisual: React.FC = () => {
  const { diceState, dice1Ref, dice2Ref } = useDiceContext();

  const isRolling = diceState.animationPhase === "rolling";
  const isThrowAnimation = diceState.animationPhase === "throwing";

  return (
    <div className="flex justify-center">
      <div className="flex gap-8">
        <SingleDice
          diceNumber={1}
          value={diceState.values[0]}
          diceRef={dice1Ref}
          isRolling={isRolling}
          isThrowAnimation={isThrowAnimation}
        />
        <SingleDice
          diceNumber={2}
          value={diceState.values[1]}
          diceRef={dice2Ref}
          isRolling={isRolling}
          isThrowAnimation={isThrowAnimation}
        />
      </div>
    </div>
  );
};
