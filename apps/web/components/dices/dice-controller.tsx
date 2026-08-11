"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { useDiceContext } from "./dice-provider";
import { useGameContext } from "../providers/game-provider";

export const DiceController: React.FC = () => {
  const { demoDices } = useGameContext();
  const { diceState, canRoll, handleRollDice } = useDiceContext();
  console.log("canRoll", diceState, canRoll);
  const isLoading =
    diceState.status === "rolling" || diceState.status === "settling";

  return (
    <Button
      disabled={!canRoll || isLoading}
      loading={isLoading}
      onClick={handleRollDice}
      size="sm"
      className="mt-4"
    >
      {isLoading ? "Rolling..." : demoDices ? "Demo Roll" : "Roll Dice"}
    </Button>
  );
};
