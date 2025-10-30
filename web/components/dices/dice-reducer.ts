import { DiceState, DiceAction, DiceValue } from "./dice-constants";

const initialDiceState: DiceState = {
  values: [1, 1],
  status: "idle",
  animationPhase: "none",
};

export const diceReducer = (
  state: DiceState,
  action: DiceAction
): DiceState => {
  switch (action.type) {
    case "START_ROLL":
      return {
        ...state,
        status: "rolling",
        animationPhase: "rolling",
      };

    case "SET_VALUES":
      return {
        ...state,
        values: action.payload,
        status: "settling",
        animationPhase: "throwing",
      };

    case "INITIALIZE_VALUES":
      return {
        ...state,
        values: action.payload,
        // Keep status as idle for initialization
        status: "idle",
        animationPhase: "none",
      };

    case "START_SETTLING":
      return {
        ...state,
        animationPhase: "settling",
      };

    case "COMPLETE_ROLL":
      return {
        ...state,
        status: "complete",
        animationPhase: "none",
      };

    case "RESET":
      return initialDiceState;

    case "ERROR":
      return {
        ...state,
        status: "idle",
        animationPhase: "none",
      };

    default:
      return state;
  }
};

export { initialDiceState };
