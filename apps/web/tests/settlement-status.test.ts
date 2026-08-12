import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { settlementStatusFromLifecycle } from "../services/settlement-status.js";

describe("settlement status", () => {
  it("shows completion only after the API commits settlement", () => {
    assert.equal(settlementStatusFromLifecycle("settled"), "completed");
    assert.equal(settlementStatusFromLifecycle("settling"), "processing");
    assert.equal(settlementStatusFromLifecycle("active"), "processing");
  });

  it("shows automatic recovery without exposing a payout action", () => {
    assert.equal(settlementStatusFromLifecycle("recoveryRequired"), "delayed");
  });
});
