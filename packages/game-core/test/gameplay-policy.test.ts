import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GAMEPLAY_POLICY, GAMEPLAY_RULESET_ID } from "../src";
import { RULESET_VERSION } from "../src/rules/board-definition";

describe("versioned gameplay policy", () => {
  it("freezes the accepted room and timer policy independently of legacy defaults", () => {
    assert.equal(GAMEPLAY_POLICY.id, GAMEPLAY_RULESET_ID);
    assert.equal(GAMEPLAY_POLICY.dataVersion, RULESET_VERSION);
    assert.equal(GAMEPLAY_RULESET_ID, `pootown-rust-source-v${RULESET_VERSION}`);
    assert.equal(GAMEPLAY_POLICY.minimumPlayers, 2);
    assert.equal(GAMEPLAY_POLICY.maximumPlayers, 4);
    assert.equal(GAMEPLAY_POLICY.boardSize, 40);
    assert.equal(GAMEPLAY_POLICY.turnTimeoutMs, 90_000);
    assert.deepEqual(GAMEPLAY_POLICY.turnWarningRemainingMs, [30_000, 10_000]);
    assert.equal(GAMEPLAY_POLICY.reconnectWindowMs, 120_000);
    assert.equal(GAMEPLAY_POLICY.maximumMissedTurns, 3);
  });

  it("keeps account coin outside the in-match policy", () => {
    assert.equal(GAMEPLAY_POLICY.startingMatchCash, 1_500n);
    assert.equal(GAMEPLAY_POLICY.startingBankCash, 1_000_000n);
    assert.equal("entryCoin" in GAMEPLAY_POLICY, false);
    assert.equal("accountCoin" in GAMEPLAY_POLICY, false);
    assert.equal("wallet" in GAMEPLAY_POLICY, false);
  });

  it("records approved corrections and legacy quirks as explicit policy", () => {
    assert.equal(GAMEPLAY_POLICY.freeParkingPosition, 20);
    assert.equal(GAMEPLAY_POLICY.timeLimitTieBreak, "stableSeat");
    assert.equal(GAMEPLAY_POLICY.collectFromPlayersEffect, "creditDrawerFromBank");
    assert.equal(GAMEPLAY_POLICY.bankruptcyAssetDestination, "bank");
    assert.equal(GAMEPLAY_POLICY.terminalFinalization, "automatic");
  });
});
