declare const gameIdBrand: unique symbol;
declare const playerIdBrand: unique symbol;

export type GameId = string & { readonly [gameIdBrand]: "GameId" };
export type PlayerId = string & { readonly [playerIdBrand]: "PlayerId" };

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function assertOpaqueId(value: string, label: string): void {
  if (value.length < 1 || value.length > 128 || !opaqueIdPattern.test(value)) {
    throw new TypeError(`${label} must be a valid opaque identifier`);
  }
}

export function gameId(value: string): GameId {
  assertOpaqueId(value, "gameId");
  return value as GameId;
}

export function playerId(value: string): PlayerId {
  assertOpaqueId(value, "playerId");
  return value as PlayerId;
}
