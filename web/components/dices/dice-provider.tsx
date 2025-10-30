"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
  useRef,
} from "react";
import { useGameContext } from "@/components/providers/game-provider";
import { diceReducer, initialDiceState } from "./dice-reducer";
import { useDiceAnimation } from "./use-dice-animation";
import { useDiceSound } from "./use-dice-sound";
import { DICE_CONFIG, validateDiceValues, DiceState } from "./dice-constants";

interface DiceContextType {
  // State
  diceState: DiceState;
  canRoll: boolean;

  // Actions
  handleRollDice: () => Promise<void>;

  // Animation refs
  dice1Ref: React.RefObject<HTMLDivElement>;
  dice2Ref: React.RefObject<HTMLDivElement>;
}

const DiceContext = createContext<DiceContextType | null>(null);

interface DiceProviderProps {
  children: ReactNode;
}

export const DiceProvider: React.FC<DiceProviderProps> = ({ children }) => {
  const [diceState, dispatch] = useReducer(diceReducer, initialDiceState);
  const { dice1Ref, dice2Ref, setInitialRotations, setFinalRotations } =
    useDiceAnimation();
  const { startDiceSound, stopDiceSound, cleanup } = useDiceSound();

  // Track the last processed dice roll to avoid reprocessing
  const lastProcessedDiceRoll = useRef<number[] | null>(null);

  const { currentPlayerState, canRollDice, rollDice, setDemoDices, demoDices } =
    useGameContext();

  // Only allow rolling when game allows it AND dice are in idle state
  const canRoll = canRollDice() && diceState.status === "idle";

  // Handle dice roll results from smart contract
  useEffect(() => {
    if (
      diceState.status === "rolling" &&
      currentPlayerState?.lastDiceRoll &&
      currentPlayerState.lastDiceRoll.length >= 2
    ) {
      const diceValues = Array.from(currentPlayerState.lastDiceRoll);

      // Check if this is a new dice roll result (not already processed)
      const isSameDiceRoll =
        lastProcessedDiceRoll.current &&
        lastProcessedDiceRoll.current.length === diceValues.length &&
        lastProcessedDiceRoll.current.every(
          (val, index) => val === diceValues[index]
        );

      if (!isSameDiceRoll && validateDiceValues(diceValues)) {
        console.log("Received new dice values:", diceValues);

        // Mark this dice roll as processed
        lastProcessedDiceRoll.current = diceValues;

        // Set the dice values and start settling animation
        dispatch({ type: "SET_VALUES", payload: diceValues });
        setFinalRotations(diceValues[0], diceValues[1]);

        // Stop sound and complete the roll after animation
        setTimeout(() => {
          stopDiceSound();
          dispatch({ type: "START_SETTLING" });

          setTimeout(() => {
            dispatch({ type: "COMPLETE_ROLL" });
          }, DICE_CONFIG.SETTLE_DURATION);
        }, DICE_CONFIG.THROW_DURATION);
      }
    }
  }, [
    currentPlayerState?.lastDiceRoll,
    diceState.status,
    setFinalRotations,
    stopDiceSound,
  ]);

  // Initialize dice values on first load (only if we haven't processed any dice roll yet)
  useEffect(() => {
    if (
      diceState.status === "idle" &&
      !lastProcessedDiceRoll.current &&
      currentPlayerState?.lastDiceRoll &&
      currentPlayerState.lastDiceRoll.length >= 2
    ) {
      const diceValues = Array.from(currentPlayerState.lastDiceRoll);

      if (validateDiceValues(diceValues)) {
        console.log("Initializing dice with existing values:", diceValues);
        lastProcessedDiceRoll.current = diceValues;
        // Use INITIALIZE_VALUES to keep status as idle
        dispatch({ type: "INITIALIZE_VALUES", payload: diceValues });
        setFinalRotations(diceValues[0], diceValues[1]);
      }
    }
  }, [currentPlayerState?.lastDiceRoll, diceState.status, setFinalRotations]);

  // Reset processed dice roll when a new turn starts (when canRollDice becomes true again)
  useEffect(() => {
    if (canRollDice() && diceState.status === "idle") {
      // If we can roll dice and we're idle, it means it's a new turn
      // Reset the processed dice roll tracker
      lastProcessedDiceRoll.current = null;
    }
  }, [canRollDice, diceState.status]);

  const handleRollDice = useCallback(async () => {
    if (!canRoll) return;

    try {
      console.log("Starting dice roll");

      // Start rolling state and animation
      dispatch({ type: "START_ROLL" });
      setInitialRotations();
      startDiceSound();

      // Call smart contract
      await rollDice(demoDices || undefined);
    } catch (error) {
      console.error("Error rolling dice:", error);

      // Reset state on error
      dispatch({ type: "ERROR" });
      stopDiceSound();
      // Reset processed dice roll on error
      lastProcessedDiceRoll.current = null;
    } finally {
      setDemoDices(null);
    }
  }, [
    canRoll,
    setInitialRotations,
    startDiceSound,
    rollDice,
    demoDices,
    stopDiceSound,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const contextValue = useMemo<DiceContextType>(
    () => ({
      diceState,
      canRoll,
      handleRollDice,
      // @ts-expect-error
      dice1Ref,
      // @ts-expect-error
      dice2Ref,
    }),
    [diceState, canRoll, handleRollDice, dice1Ref, dice2Ref]
  );

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
