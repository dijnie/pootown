import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthApi } from "../services/auth-api.js";
import { ApiError } from "../services/api-client.js";

const session = {
  contractVersion: 1,
  accessToken: "a".repeat(32),
  accessTokenExpiresAtMs: 1_000,
  user: { userId: "user_1", email: "player@example.test" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("email auth API client", () => {
  it("uses only exact credentialed auth routes and never puts credentials in URLs", async () => {
    const requests: Array<{ readonly input: string; readonly init?: RequestInit }> = [];
    const api = createAuthApi("https://api.example", async (input, init) => {
      requests.push({ input: String(input), init });
      return jsonResponse(String(input).endsWith("/logout") ? { contractVersion: 1, loggedOut: true } : session);
    });
    await api.register({ email: "player@example.test", password: "correct-horse-42" });
    await api.login({ email: "player@example.test", password: "correct-horse-42" });
    await api.refresh();
    await api.logout();

    assert.deepEqual(requests.map((request) => request.input), [
      "https://api.example/v1/auth/register",
      "https://api.example/v1/auth/login",
      "https://api.example/v1/auth/refresh",
      "https://api.example/v1/auth/logout",
    ]);
    for (const request of requests) {
      assert.equal(request.init?.credentials, "include");
      assert.equal((request.init?.headers as Record<string, string>)["x-contract-version"], "1");
      assert.doesNotMatch(request.input, /player|password|token/i);
    }
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      contractVersion: 1,
      email: "player@example.test",
      password: "correct-horse-42",
    });
    assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), { contractVersion: 1 });
  });

  it("rejects malformed success and error envelopes without retaining sensitive bodies", async () => {
    const malformed = createAuthApi("https://api.example", async () => jsonResponse({ ...session, refreshToken: "secret" }));
    await assert.rejects(
      malformed.refresh(),
      (error: unknown) => error instanceof ApiError && error.code === "RESPONSE_INVALID",
    );
    const failed = createAuthApi("https://api.example", async () => jsonResponse({ password: "secret" }, 401));
    await assert.rejects(
      failed.login({ email: "player@example.test", password: "correct-horse-42" }),
      (error: unknown) => error instanceof ApiError && !JSON.stringify(error).includes("secret"),
    );
  });
});
