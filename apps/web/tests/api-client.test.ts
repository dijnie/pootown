import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import { ApiError, createApiClient } from "../services/api-client.js";

const responseSchema = z.strictObject({ value: z.literal("ok") });
const requestId = "00000000-0000-4000-8000-000000000001";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("typed web API client", () => {
  it("sends contract, bearer, and idempotency headers", async () => {
    let captured: { input: string; init?: RequestInit } | undefined;
    const client = createApiClient({
      baseUrl: "https://api.example",
      getAccessToken: async () => "access-token-secret",
      fetcher: async (input, init) => {
        captured = { input: String(input), init };
        return jsonResponse({ value: "ok" });
      },
    });
    const result = await client.post("/v1/example", { contractVersion: 1 }, responseSchema, {
      idempotencyKey: "intent-1",
    });
    assert.deepEqual(result, { value: "ok" });
    assert.equal(captured?.input, "https://api.example/v1/example");
    const headers = captured?.init?.headers as Record<string, string>;
    assert.equal(headers.authorization, "Bearer access-token-secret");
    assert.equal(headers["x-contract-version"], "1");
    assert.equal(headers["idempotency-key"], "intent-1");
  });

  it("refreshes an invalid access token at most once", async () => {
    let tokenCalls = 0;
    let fetchCalls = 0;
    const client = createApiClient({
      baseUrl: "https://api.example",
      getAccessToken: async () => `token-${++tokenCalls}`,
      fetcher: async (_input, init) => {
        fetchCalls += 1;
        const headers = init?.headers as Record<string, string>;
        if (fetchCalls === 1) {
          assert.equal(headers.authorization, "Bearer token-1");
          return jsonResponse({
            error: { code: "AUTH_TOKEN_INVALID", message: "Access token invalid", requestId },
          }, 401);
        }
        assert.equal(headers.authorization, "Bearer token-2");
        return jsonResponse({ value: "ok" });
      },
    });
    assert.deepEqual(await client.get("/v1/me", undefined, responseSchema, true), { value: "ok" });
    assert.equal(fetchCalls, 2);
    assert.equal(tokenCalls, 2);
  });

  it("fails closed on malformed success and error envelopes", async () => {
    const invalidSuccess = createApiClient({
      baseUrl: "/api",
      fetcher: async () => jsonResponse({ value: "forged" }),
    });
    await assert.rejects(
      invalidSuccess.get("/public", undefined, responseSchema),
      (error: unknown) => error instanceof ApiError && error.code === "RESPONSE_INVALID" && error.status === 502,
    );

    const invalidError = createApiClient({
      baseUrl: "https://api.example",
      fetcher: async () => jsonResponse({ token: "secret", message: "raw database error" }, 500),
    });
    await assert.rejects(
      invalidError.get("/public", undefined, responseSchema),
      (error: unknown) => error instanceof ApiError &&
        error.message === "Request failed" &&
        !JSON.stringify(error).includes("secret"),
    );
  });

  it("rejects unsafe origins and bounds request time", async () => {
    for (const baseUrl of [
      "file:///tmp/api",
      "https://user:pass@api.example",
      "https://api.example/?ticket=secret",
      "//api.example",
      "/../api",
    ]) {
      assert.throws(() => createApiClient({ baseUrl }), /API base URL/);
    }
    const timed = createApiClient({
      baseUrl: "https://api.example",
      timeoutMs: 1,
      fetcher: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    });
    await assert.rejects(
      timed.get("/slow", undefined, responseSchema),
      (error: unknown) => error instanceof ApiError && error.code === "REQUEST_TIMEOUT",
    );

    const stalledToken = createApiClient({
      baseUrl: "https://api.example/api/v1",
      timeoutMs: 1,
      getAccessToken: async () => new Promise<string | null>(() => undefined),
      fetcher: async () => jsonResponse({ value: "ok" }),
    });
    await assert.rejects(
      stalledToken.get("/me", undefined, responseSchema, true),
      (error: unknown) => error instanceof ApiError && error.code === "REQUEST_TIMEOUT",
    );

    const stalledBody = createApiClient({
      baseUrl: "https://api.example/api/leaderboard",
      timeoutMs: 1,
      fetcher: async (input) => {
        assert.equal(String(input), "https://api.example/api/leaderboard/top-players");
        return { json: async () => new Promise<unknown>(() => undefined), ok: true, status: 200 } as Response;
      },
    });
    await assert.rejects(
      stalledBody.get("/top-players", undefined, responseSchema),
      (error: unknown) => error instanceof ApiError && error.code === "REQUEST_TIMEOUT",
    );
  });
});
