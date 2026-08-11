declare const matchCashBrand: unique symbol;

export type MatchCash = bigint & { readonly [matchCashBrand]: "MatchCash" };

export function matchCash(value: bigint): MatchCash {
  if (value < 0n) {
    throw new RangeError("in-match cash cannot be negative");
  }
  return value as MatchCash;
}
