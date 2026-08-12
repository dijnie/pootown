import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rateLimitTracker } from "../src/platform/http/rate-limit-tracker";

describe("rate limit tracker", () => {
  it("separates authenticated users behind one address", () => {
    assert.equal(rateLimitTracker({ ip: "127.0.0.1", principal: { userId: "user_one" } }), "user:user_one");
    assert.equal(rateLimitTracker({ ip: "127.0.0.1", principal: { userId: "user_two" } }), "user:user_two");
  });

  it("tracks public callers by address and internal callers by service", () => {
    assert.equal(rateLimitTracker({ ip: "203.0.113.10" }), "ip:203.0.113.10");
    assert.equal(
      rateLimitTracker({ ip: "127.0.0.1", internalPrincipal: { serviceId: "game-server" } }),
      "service:game-server",
    );
  });

  it("does not accept unbounded or malformed identities as tracker keys", () => {
    assert.equal(rateLimitTracker({ ip: "127.0.0.1", principal: { userId: "x".repeat(129) } }), "ip:127.0.0.1");
    assert.equal(rateLimitTracker({ ip: null, principal: { userId: 1 } }), "ip:unknown");
  });
});
