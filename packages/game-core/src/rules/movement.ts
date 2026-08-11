import type { RandomSource } from "../ports/random-source";
import { GAMEPLAY_POLICY } from "./gameplay-policy";

const MAXIMUM_REJECTION_DRAWS = 256;
const LARGEST_UNBIASED_BYTE = 251;

export interface DiceRoll {
  readonly dice: readonly [number, number];
  readonly total: number;
  readonly isDoubles: boolean;
}

export interface MovementResult {
  readonly from: number;
  readonly to: number;
  readonly spaces: number;
  readonly passedGo: boolean;
}

export interface DoublesResult {
  readonly consecutiveDoubles: number;
  readonly sentToJail: boolean;
}

function isBoardPosition(position: number): boolean {
  return Number.isInteger(position) && position >= 0 && position < GAMEPLAY_POLICY.boardSize;
}

function drawDie(randomSource: RandomSource): number | null {
  for (let attempt = 0; attempt < MAXIMUM_REJECTION_DRAWS; attempt += 1) {
    let bytes: Uint8Array;
    try {
      bytes = randomSource.nextBytes(1);
    } catch {
      return null;
    }
    if (!(bytes instanceof Uint8Array) || bytes.length !== 1) return null;
    const value = bytes[0];
    if (value !== undefined && value <= LARGEST_UNBIASED_BYTE) return (value % 6) + 1;
  }
  return null;
}

/** Draws server-owned dice without modulo bias. Adapter failure is fail-closed. */
export function rollDice(randomSource: RandomSource): DiceRoll | null {
  const first = drawDie(randomSource);
  if (first === null) return null;
  const second = drawDie(randomSource);
  if (second === null) return null;
  return {
    dice: [first, second],
    total: first + second,
    isDoubles: first === second,
  };
}

export function moveBy(position: number, spaces: number): MovementResult | null {
  if (!isBoardPosition(position) || !Number.isSafeInteger(spaces)) return null;
  const absolute = position + spaces;
  if (!Number.isSafeInteger(absolute)) return null;
  return {
    from: position,
    to: ((absolute % GAMEPLAY_POLICY.boardSize) + GAMEPLAY_POLICY.boardSize) % GAMEPLAY_POLICY.boardSize,
    spaces,
    passedGo: spaces > 0 && absolute >= GAMEPLAY_POLICY.boardSize,
  };
}

/** Finds the closest target strictly ahead, wrapping through GO when needed. */
export function moveToNearest(position: number, targets: readonly number[]): MovementResult | null {
  if (!isBoardPosition(position) || targets.length === 0 || targets.some((target) => !isBoardPosition(target))) {
    return null;
  }
  const distance = Math.min(
    ...targets.map((target) => {
      const forward = target - position;
      return forward > 0 ? forward : GAMEPLAY_POLICY.boardSize + forward;
    }),
  );
  return moveBy(position, distance);
}

export function applyDoubles(previousConsecutiveDoubles: number, roll: DiceRoll): DoublesResult | null {
  if (
    !Number.isInteger(previousConsecutiveDoubles) ||
    previousConsecutiveDoubles < 0 ||
    previousConsecutiveDoubles > 2 ||
    roll.dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6) ||
    roll.total !== roll.dice[0] + roll.dice[1] ||
    roll.isDoubles !== (roll.dice[0] === roll.dice[1])
  ) {
    return null;
  }
  if (!roll.isDoubles) return { consecutiveDoubles: 0, sentToJail: false };
  const consecutiveDoubles = previousConsecutiveDoubles + 1;
  return consecutiveDoubles === 3
    ? { consecutiveDoubles: 0, sentToJail: true }
    : { consecutiveDoubles, sentToJail: false };
}
