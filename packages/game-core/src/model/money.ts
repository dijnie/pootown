declare const matchCashBrand: unique symbol;

export type MatchCash = bigint & { readonly [matchCashBrand]: "MatchCash" };

export const MAX_MATCH_CASH = (10n ** 78n) - 1n;

export function matchCash(value: bigint): MatchCash {
  if (value < 0n || value > MAX_MATCH_CASH) {
    throw new RangeError("in-match cash must fit the canonical unsigned decimal contract");
  }
  return value as MatchCash;
}

export function checkedAddMatchCash(left: MatchCash, right: MatchCash): MatchCash | null {
  const result = left + right;
  return result <= MAX_MATCH_CASH ? (result as MatchCash) : null;
}

export function checkedSubtractMatchCash(left: MatchCash, right: MatchCash): MatchCash | null {
  return left >= right ? ((left - right) as MatchCash) : null;
}
