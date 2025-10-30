// Dice animation and configuration constants
export const DICE_CONFIG = {
  // Animation timings (in milliseconds)
  ROLLING_DURATION: 2000,
  THROW_DURATION: 1000,
  SETTLE_DURATION: 300,

  FACE_ROTATIONS: {
    1: [-0.1, 0.3, -1],
    2: [-0.1, 0.6, -0.4],
    3: [-0.85, -0.42, 0.73],
    4: [-0.8, 0.3, -0.75],
    5: [0.3, 0.45, 0.9],
    6: [-0.16, 0.6, 0.18],
  } as const,

  INITIAL_ROTATIONS: {
    DICE_1: "rotate3d(0, 0.9, 0.9, 60deg)",
    DICE_2: "rotate3d(0, 0.9, 0.9, 120deg)",
  },

  // Validation
  MIN_DICE_VALUE: 1,
  MAX_DICE_VALUE: 6,
} as const;

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export type DiceState = {
  values: [DiceValue, DiceValue];
  status: "idle" | "rolling" | "settling" | "complete";
  animationPhase: "none" | "rolling" | "throwing" | "settling";
};

export type DiceAction =
  | { type: "START_ROLL" }
  | { type: "SET_VALUES"; payload: [DiceValue, DiceValue] }
  | { type: "INITIALIZE_VALUES"; payload: [DiceValue, DiceValue] }
  | { type: "START_SETTLING" }
  | { type: "COMPLETE_ROLL" }
  | { type: "RESET" }
  | { type: "ERROR" };

export const isValidDiceValue = (value: number): value is DiceValue => {
  return (
    value >= DICE_CONFIG.MIN_DICE_VALUE && value <= DICE_CONFIG.MAX_DICE_VALUE
  );
};

export const validateDiceValues = (
  values: number[]
): values is [DiceValue, DiceValue] => {
  return values.length === 2 && values.every(isValidDiceValue);
};
