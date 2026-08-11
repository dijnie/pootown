import { useRef, useCallback } from "react";
import { DICE_CONFIG, DiceValue } from "./dice-constants";

export const useDiceAnimation = () => {
  const dice1Ref = useRef<HTMLDivElement>(null);
  const dice2Ref = useRef<HTMLDivElement>(null);

  const setInitialRotations = useCallback(() => {
    if (dice1Ref.current) {
      dice1Ref.current.style.transform = DICE_CONFIG.INITIAL_ROTATIONS.DICE_1;
    }
    if (dice2Ref.current) {
      dice2Ref.current.style.transform = DICE_CONFIG.INITIAL_ROTATIONS.DICE_2;
    }
  }, []);

  const setFinalRotations = useCallback(
    (dice1Value: DiceValue, dice2Value: DiceValue) => {
      if (dice1Ref.current) {
        const [x, y, z] = DICE_CONFIG.FACE_ROTATIONS[dice1Value];
        dice1Ref.current.style.transform = `rotate3d(${x}, ${y}, ${z}, 180deg)`;
      }

      if (dice2Ref.current) {
        const [x, y, z] = DICE_CONFIG.FACE_ROTATIONS[dice2Value];
        dice2Ref.current.style.transform = `rotate3d(${x}, ${y}, ${z}, 180deg)`;
      }
    },
    []
  );

  return {
    dice1Ref,
    dice2Ref,
    setInitialRotations,
    setFinalRotations,
  };
};
