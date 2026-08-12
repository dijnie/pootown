import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createWebSecurityHeaders } from "../services/security-headers.js";

describe("web security headers", () => {
  it("allows only the canonical API and room endpoints", () => {
    const headers = createWebSecurityHeaders(
      "https://api.example",
      "wss://rooms.example",
      false,
      "test-nonce"
    );
    const policy = headers.find(
      (header) => header.key === "Content-Security-Policy"
    )?.value;
    assert.match(policy ?? "", /frame-ancestors 'none'/);
    assert.match(
      policy ?? "",
      /connect-src 'self' https:\/\/api\.example https:\/\/rooms\.example wss:\/\/rooms\.example/
    );
    assert.doesNotMatch(policy ?? "", /privy/i);
    assert.equal(policy?.includes("unsafe-eval"), false);
    assert.doesNotMatch(policy ?? "", /script-src[^;]*unsafe-inline/);
    assert.match(policy ?? "", /'nonce-test-nonce' 'strict-dynamic'/);
    assert.equal(policy?.includes("ticket"), false);
  });

  it("allows the Next.js development runtime without enabling eval in production", () => {
    const production = createWebSecurityHeaders(
      "https://api.example",
      "wss://rooms.example",
      false,
      "test-nonce"
    );
    const development = createWebSecurityHeaders(
      "https://api.example",
      "wss://rooms.example",
      true
    );
    const productionPolicy = production.find(
      (header) => header.key === "Content-Security-Policy"
    )?.value;
    const developmentPolicy = development.find(
      (header) => header.key === "Content-Security-Policy"
    )?.value;

    assert.match(productionPolicy ?? "", /script-src[^;]*'nonce-test-nonce'/);
    assert.doesNotMatch(productionPolicy ?? "", /script-src[^;]*unsafe-inline/);
    assert.equal(productionPolicy?.includes("unsafe-eval"), false);
    assert.match(developmentPolicy ?? "", /script-src[^;]*'unsafe-eval'/);
  });

  it("rejects unsafe service endpoints before producing a policy", () => {
    assert.throws(() =>
      createWebSecurityHeaders(
        "https://user:secret@api.example",
        "wss://rooms.example"
      )
    );
    assert.throws(() =>
      createWebSecurityHeaders(
        "https://api.example",
        "wss://rooms.example/private"
      )
    );
  });
});
