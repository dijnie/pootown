import type { MatchCash } from "../model/money";
import { checkedSubtractMatchCash, matchCash, MAX_MATCH_CASH } from "../model/money";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import { moveBy, type DiceRoll, type MovementResult } from "./movement";

export interface JailPlayerState {
  readonly cash: MatchCash;
  readonly position: number;
  readonly inJail: boolean;
  readonly jailTurns: number;
  readonly consecutiveDoubles: number;
  readonly getOutOfJailCards: number;
}

export type JailRuleErrorCode =
  | "INVALID_JAIL_STATE"
  | "PLAYER_NOT_IN_JAIL"
  | "NO_GET_OUT_OF_JAIL_CARD"
  | "INVALID_DICE";

export type JailActionResult =
  | {
      readonly ok: true;
      readonly state: JailPlayerState;
      readonly outcome: "entered" | "released" | "remains" | "bankruptcyRequired";
      readonly releaseMethod: "doubles" | "fine" | "card" | null;
      readonly movement: MovementResult | null;
      readonly turnEnded: boolean;
      readonly amountPaid: MatchCash;
    }
  | { readonly ok: false; readonly code: JailRuleErrorCode };

function validState(state: JailPlayerState): boolean {
  return (
    typeof state.cash === "bigint" &&
    state.cash >= 0n &&
    state.cash <= MAX_MATCH_CASH &&
    typeof state.inJail === "boolean" &&
    Number.isInteger(state.position) &&
    state.position >= 0 &&
    state.position < GAMEPLAY_POLICY.boardSize &&
    Number.isInteger(state.jailTurns) &&
    state.jailTurns >= 0 &&
    state.jailTurns <= GAMEPLAY_POLICY.maximumJailTurns &&
    Number.isInteger(state.consecutiveDoubles) &&
    state.consecutiveDoubles >= 0 &&
    state.consecutiveDoubles <= 2 &&
    Number.isInteger(state.getOutOfJailCards) &&
    state.getOutOfJailCards >= 0 &&
    state.getOutOfJailCards <= 255 &&
    (state.inJail
      ? state.position === GAMEPLAY_POLICY.jailPosition && state.jailTurns <= 2 && state.consecutiveDoubles === 0
      : state.jailTurns === 0)
  );
}

function validDice(roll: DiceRoll): boolean {
  return (
    Array.isArray(roll.dice) &&
    roll.dice.length === 2 &&
    roll.dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6) &&
    roll.total === roll.dice[0] + roll.dice[1] &&
    roll.isDoubles === (roll.dice[0] === roll.dice[1])
  );
}

export function enterJail(state: JailPlayerState): JailActionResult {
  if (!validState(state)) return { ok: false, code: "INVALID_JAIL_STATE" };
  return {
    ok: true,
    state: {
      ...state,
      position: GAMEPLAY_POLICY.jailPosition,
      inJail: true,
      jailTurns: 0,
      consecutiveDoubles: 0,
    },
    outcome: "entered",
    releaseMethod: null,
    movement: null,
    turnEnded: true,
    amountPaid: matchCash(0n),
  };
}

export function payJailFine(state: JailPlayerState): JailActionResult {
  if (!validState(state)) return { ok: false, code: "INVALID_JAIL_STATE" };
  if (!state.inJail) return { ok: false, code: "PLAYER_NOT_IN_JAIL" };
  const fine = matchCash(GAMEPLAY_POLICY.jailFine);
  const cash = checkedSubtractMatchCash(state.cash, fine);
  if (cash === null) {
    return {
      ok: true,
      state,
      outcome: "bankruptcyRequired",
      releaseMethod: null,
      movement: null,
      turnEnded: false,
      amountPaid: matchCash(0n),
    };
  }
  return {
    ok: true,
    state: { ...state, cash, inJail: false, jailTurns: 0 },
    outcome: "released",
    releaseMethod: "fine",
    movement: null,
    turnEnded: true,
    amountPaid: fine,
  };
}

export function useJailCard(state: JailPlayerState): JailActionResult {
  if (!validState(state)) return { ok: false, code: "INVALID_JAIL_STATE" };
  if (!state.inJail) return { ok: false, code: "PLAYER_NOT_IN_JAIL" };
  if (state.getOutOfJailCards < 1) return { ok: false, code: "NO_GET_OUT_OF_JAIL_CARD" };
  return {
    ok: true,
    state: {
      ...state,
      inJail: false,
      jailTurns: 0,
      getOutOfJailCards: state.getOutOfJailCards - 1,
    },
    outcome: "released",
    releaseMethod: "card",
    movement: null,
    turnEnded: true,
    amountPaid: matchCash(0n),
  };
}

export function resolveJailRoll(state: JailPlayerState, roll: DiceRoll): JailActionResult {
  if (!validState(state)) return { ok: false, code: "INVALID_JAIL_STATE" };
  if (!state.inJail) return { ok: false, code: "PLAYER_NOT_IN_JAIL" };
  if (!validDice(roll)) return { ok: false, code: "INVALID_DICE" };
  const jailTurns = state.jailTurns + 1;
  if (!roll.isDoubles && jailTurns < GAMEPLAY_POLICY.maximumJailTurns) {
    return {
      ok: true,
      state: { ...state, jailTurns },
      outcome: "remains",
      releaseMethod: null,
      movement: null,
      turnEnded: true,
      amountPaid: matchCash(0n),
    };
  }

  let cash = state.cash;
  let releaseMethod: "doubles" | "fine" = "doubles";
  let amountPaid = matchCash(0n);
  if (!roll.isDoubles) {
    const fine = matchCash(GAMEPLAY_POLICY.jailFine);
    const afterFine = checkedSubtractMatchCash(cash, fine);
    if (afterFine === null) {
      return {
        ok: true,
        state: { ...state, cash: matchCash(0n), inJail: false, jailTurns: 0, consecutiveDoubles: 0 },
        outcome: "bankruptcyRequired",
        releaseMethod: null,
        movement: null,
        turnEnded: true,
        amountPaid: matchCash(0n),
      };
    }
    cash = afterFine;
    releaseMethod = "fine";
    amountPaid = fine;
  }

  const movement = moveBy(state.position, roll.total);
  if (movement === null) return { ok: false, code: "INVALID_DICE" };
  return {
    ok: true,
    state: {
      ...state,
      cash,
      position: movement.to,
      inJail: false,
      jailTurns: 0,
      consecutiveDoubles: 0,
    },
    outcome: "released",
    releaseMethod,
    movement,
    turnEnded: false,
    amountPaid,
  };
}
