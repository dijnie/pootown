import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SecureRandomSource } from "../src/random/secure-random-source.js";

describe("secure resumable random source", () => {
  it("forks exact continuation without exposing randomness publicly", () => {
    const source = new SecureRandomSource(Buffer.alloc(32, 7));
    source.nextBytes(17);
    const checkpoint = source.checkpoint();
    const fork = source.fork(checkpoint);
    assert.notEqual(fork, null);
    assert.deepEqual(fork?.nextBytes(64), source.nextBytes(64));
    assert.deepEqual(fork?.checkpoint(), source.checkpoint());
  });

  it("rejects malformed checkpoints and invalid draw sizes", () => {
    const source = new SecureRandomSource(Buffer.alloc(32, 9));
    assert.throws(() => source.nextBytes(0));
    assert.throws(() => source.nextBytes(4_097));
    assert.equal(source.fork({ algorithm: "other", state: "bad", draws: 0, bytesConsumed: 0 }), null);
    assert.equal(source.fork({
      algorithm: "hmac-sha256-v1",
      state: Buffer.from(JSON.stringify({ seed: "bad", counter: 0 })).toString("base64url"),
      draws: 0,
      bytesConsumed: 0,
    }), null);
    const valid = source.checkpoint();
    source.nextBytes(33);
    const advanced = source.checkpoint();
    for (const inconsistent of [
      { ...advanced, draws: 0 },
      { ...advanced, bytesConsumed: 0 },
      { ...advanced, draws: advanced.draws + 2 },
      { ...advanced, bytesConsumed: advanced.bytesConsumed + 4_097 },
      { ...valid, state: advanced.state },
    ]) {
      assert.equal(source.fork(inconsistent), null);
    }
  });
});
