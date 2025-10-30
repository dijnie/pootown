import { useCallback, useRef } from "react";
import { playDiceRollSequence, stopDiceRollSequence } from "@/lib/soundUtil";

export const useDiceSound = () => {
  const soundTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startDiceSound = useCallback(() => {
    playDiceRollSequence();
  }, []);

  const stopDiceSound = useCallback(() => {
    stopDiceRollSequence();
    if (soundTimeoutRef.current) {
      clearTimeout(soundTimeoutRef.current);
      soundTimeoutRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopDiceSound();
  }, [stopDiceSound]);

  return {
    startDiceSound,
    stopDiceSound,
    cleanup,
  };
};
