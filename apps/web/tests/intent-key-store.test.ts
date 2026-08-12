import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IntentKeyStore } from "../services/intent-key-store.js";

describe("intent idempotency keys", () => {
  it("keeps one key through ambiguous retries and separates logical intents", () => {
    let sequence = 0;
    const keys = new IntentKeyStore(() => `key-${++sequence}`);

    assert.equal(keys.get("create:classic"), "key-1");
    assert.equal(keys.get("create:classic"), "key-1");
    assert.equal(keys.get("create:fast"), "key-2");

    keys.complete("create:classic");
    assert.equal(keys.get("create:classic"), "key-3");
  });

  it("abandons retained keys only when the user abandons the dialog", () => {
    let sequence = 0;
    const keys = new IntentKeyStore(() => `key-${++sequence}`);

    assert.equal(keys.get("create:classic"), "key-1");
    keys.clear();
    assert.equal(keys.get("create:classic"), "key-2");
  });
});
