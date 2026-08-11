import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createWebSecurityHeaders } from "../services/security-headers.js";

describe("web security headers", () => {
  it("allows only the canonical API and room endpoints alongside Privy authentication", () => {
    const headers = createWebSecurityHeaders("https://api.example", "wss://rooms.example");
    const policy = headers.find((header) => header.key === "Content-Security-Policy")?.value;
    assert.match(policy ?? "", /frame-ancestors 'none'/);
    assert.match(policy ?? "", /connect-src 'self' https:\/\/auth\.privy\.io https:\/\/api\.example wss:\/\/rooms\.example/);
    assert.equal(policy?.includes("unsafe-eval"), false);
    assert.equal(policy?.includes("ticket"), false);
  });

  it("rejects unsafe service endpoints before producing a policy", () => {
    assert.throws(() => createWebSecurityHeaders("https://user:secret@api.example", "wss://rooms.example"));
    assert.throws(() => createWebSecurityHeaders("https://api.example", "wss://rooms.example/private"));
  });
});
