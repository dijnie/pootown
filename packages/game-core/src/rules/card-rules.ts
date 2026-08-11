import type { MatchCash } from "../model/money";
import {
  checkedAddMatchCash,
  checkedSubtractMatchCash,
  matchCash,
  MAX_MATCH_CASH,
} from "../model/money";
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS, type CardDefinition } from "./card-decks";
import { GAMEPLAY_POLICY } from "./gameplay-policy";
import { moveBy, moveToNearest, type MovementResult } from "./movement";

export type CardDeck = "chance" | "communityChest";

export interface CardPlayerState {
  readonly cash: MatchCash;
  readonly position: number;
  readonly getOutOfJailCards: number;
}

export type CardRuleErrorCode =
  | "INVALID_CARD_STATE"
  | "INVALID_CARD"
  | "INVALID_PLAYER_COUNT"
  | "ARITHMETIC_OVERFLOW";

export type CardResolutionResult =
  | {
      readonly ok: true;
      readonly state: CardPlayerState;
      readonly card: CardDefinition;
      readonly deck: CardDeck;
      readonly cashDelta: bigint;
      readonly movement: MovementResult | null;
      readonly bankruptcyRequired: boolean;
    }
  | { readonly ok: false; readonly code: CardRuleErrorCode };

function validState(state: CardPlayerState): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    typeof state.cash === "bigint" &&
    state.cash >= 0n &&
    state.cash <= MAX_MATCH_CASH &&
    Number.isInteger(state.position) &&
    state.position >= 0 &&
    state.position < GAMEPLAY_POLICY.boardSize &&
    Number.isInteger(state.getOutOfJailCards) &&
    state.getOutOfJailCards >= 0 &&
    state.getOutOfJailCards <= 255
  );
}

function absoluteMovement(position: number, destination: number): MovementResult {
  return {
    from: position,
    to: destination,
    spaces: (destination - position + GAMEPLAY_POLICY.boardSize) % GAMEPLAY_POLICY.boardSize,
    passedGo: destination < position || destination === 0,
  };
}

function addCash(cash: MatchCash, amount: bigint): MatchCash | null {
  return checkedAddMatchCash(cash, matchCash(amount));
}

export function resolveCard(
  deck: CardDeck,
  cardId: number,
  state: CardPlayerState,
  playerCount: number,
): CardResolutionResult {
  if (!validState(state)) return { ok: false, code: "INVALID_CARD_STATE" };
  if (deck !== "chance" && deck !== "communityChest") return { ok: false, code: "INVALID_CARD" };
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4) {
    return { ok: false, code: "INVALID_PLAYER_COUNT" };
  }
  const cards = deck === "chance" ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
  const card = cards.find((candidate) => candidate.id === cardId);
  if (card === undefined) return { ok: false, code: "INVALID_CARD" };

  let cash = state.cash;
  let cashDelta = 0n;
  let movement: MovementResult | null = null;
  let getOutOfJailCards = state.getOutOfJailCards;
  let bankruptcyRequired = false;

  if (card.effect === "money") {
    const amount = BigInt(card.amount);
    if (amount >= 0n) {
      const next = addCash(cash, amount);
      if (next === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
      cash = next;
      cashDelta = amount;
    } else {
      const deduction = matchCash(-amount);
      const next = checkedSubtractMatchCash(cash, deduction);
      if (next === null) {
        cashDelta = -cash;
        cash = matchCash(0n);
        bankruptcyRequired = true;
      } else {
        cash = next;
        cashDelta = amount;
      }
    }
  } else if (card.effect === "move") {
    movement = deck === "chance"
      ? moveBy(state.position, card.amount)
      : absoluteMovement(state.position, card.amount);
    if (movement === null) return { ok: false, code: "INVALID_CARD" };
    if (movement.passedGo) {
      const next = addCash(cash, GAMEPLAY_POLICY.passGoSalary);
      if (next === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
      cash = next;
      cashDelta = GAMEPLAY_POLICY.passGoSalary;
    }
  } else if (card.effect === "moveToNearest") {
    movement = moveToNearest(state.position, [1, 3]);
    if (movement === null) return { ok: false, code: "INVALID_CARD" };
    if (movement.passedGo) {
      const next = addCash(cash, GAMEPLAY_POLICY.passGoSalary);
      if (next === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
      cash = next;
      cashDelta = GAMEPLAY_POLICY.passGoSalary;
    }
  } else if (card.effect === "getOutOfJailFree") {
    if (getOutOfJailCards === 255) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
    getOutOfJailCards += 1;
  } else if (card.effect === "collectFromPlayers") {
    const amount = BigInt(card.amount) * BigInt(playerCount - 1);
    const next = addCash(cash, amount);
    if (next === null) return { ok: false, code: "ARITHMETIC_OVERFLOW" };
    cash = next;
    cashDelta = amount;
  } else if (card.effect !== "repairFree") {
    return { ok: false, code: "INVALID_CARD" };
  }

  return {
    ok: true,
    state: {
      cash,
      position: movement?.to ?? state.position,
      getOutOfJailCards,
    },
    card,
    deck,
    cashDelta,
    movement,
    bankruptcyRequired,
  };
}
