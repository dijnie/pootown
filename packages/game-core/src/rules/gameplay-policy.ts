import { RULESET_VERSION } from "./board-definition";

/**
 * Immutable policy for the first off-chain ruleset.
 *
 * This identifier is persisted with game snapshots. Changing any value below
 * requires a new identifier so an existing game can always resume under the
 * rules it started with.
 */
export const GAMEPLAY_RULESET_ID = `pootown-rust-source-v${RULESET_VERSION}` as const;

export const GAMEPLAY_POLICY = Object.freeze({
  id: GAMEPLAY_RULESET_ID,
  dataVersion: RULESET_VERSION,
  boardSize: 40,
  minimumPlayers: 2,
  maximumPlayers: 4,
  startingMatchCash: 1_500n,
  startingBankCash: 1_000_000n,
  passGoSalary: 200n,
  turnTimeoutMs: 90_000,
  turnWarningRemainingMs: Object.freeze([30_000, 10_000] as const),
  reconnectWindowMs: 120_000,
  maximumMissedTurns: 3,
  jailPosition: 10,
  jailFine: 50n,
  maximumJailTurns: 3,
  freeParkingPosition: 20,
  goToJailPosition: 30,
  mevTax: Object.freeze({ position: 4, amount: 200n }),
  priorityFeeTax: Object.freeze({ position: 38, amount: 75n }),
  totalHouses: 32,
  totalHotels: 12,
  maximumHousesPerProperty: 4,
  tradeExpiryMs: 3_600_000,
  maximumActiveTrades: 20,
  timeLimitTieBreak: "stableSeat" as const,
  collectFromPlayersEffect: "creditDrawerFromBank" as const,
  bankruptcyAssetDestination: "bank" as const,
  terminalFinalization: "automatic" as const,
});

export type GameplayRulesetId = typeof GAMEPLAY_RULESET_ID;
export type GameplayPolicy = typeof GAMEPLAY_POLICY;
