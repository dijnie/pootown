import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, createApiClient } from "../services/api-client.js";
import { normalizeApiOrigin } from "../services/api-origin.js";
import { createLeaderboardApi } from "../services/leaderboard.js";
import { createPollingLifecycle, type PollingTimer } from "../services/polling-lifecycle.js";

const validResponse = {
  success: true,
  data: {
    data: [{
      rank: 1,
      playerId: "player_1",
      displayName: "Panda",
      gamesPlayed: 3,
      gamesWon: 2,
      accountCoinWon: "900719925474099300000",
    }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  },
  requestId: "00000000-0000-4000-8000-000000000001",
  timestamp: 1,
} as const;

describe("leaderboard API", () => {
  it("accepts only a canonical API origin", () => {
    assert.equal(normalizeApiOrigin("https://api.example/"), "https://api.example");
    for (const invalid of [
      "https://user:secret@api.example/",
      "https://api.example/private",
      "https://api.example/?ticket=secret",
      "https://api.example/#secret",
      "file:///tmp/api",
    ]) {
      assert.throws(() => normalizeApiOrigin(invalid), /HTTP origin/);
    }
  });

  it("fences stale and hidden polling callbacks", () => {
    let hidden = false;
    const callbacks: Array<() => void> = [];
    const timer: PollingTimer = {
      clear: () => undefined,
      set: (next) => {
        callbacks.push(next);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    };
    const lifecycle = createPollingLifecycle(() => hidden, timer);
    const first = lifecycle.begin();
    let calls = 0;
    lifecycle.schedule(first, 1, () => { calls += 1; });
    const staleCallback = callbacks[0];
    lifecycle.invalidate(first);
    assert.ok(staleCallback !== undefined);
    staleCallback?.();
    assert.equal(calls, 0);

    const second = lifecycle.begin();
    lifecycle.schedule(second, 1, () => { calls += 1; });
    const hiddenCallback = callbacks[1];
    hidden = true;
    assert.ok(hiddenCallback !== undefined);
    hiddenCallback?.();
    assert.equal(calls, 0);
    lifecycle.schedule(second, 1, () => { calls += 1; });
    assert.equal(calls, 0);
  });

  it("uses the versioned public route and preserves account coin precision", async () => {
    const calls: string[] = [];
    const api = createLeaderboardApi(createApiClient({
      baseUrl: "https://api.example",
      fetcher: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify(validResponse), { status: 200 });
      },
    }));
    const response = await api.topPlayers({ limit: 20, page: 1 });
    assert.deepEqual(calls, ["https://api.example/v1/leaderboard/top-players?limit=20&page=1"]);
    assert.equal(response.data.data[0]?.accountCoinWon, "900719925474099300000");
  });

  it("rejects legacy wallet and SOL producer fields", async () => {
    const api = createLeaderboardApi(createApiClient({
      baseUrl: "https://api.example",
      fetcher: async () => new Response(JSON.stringify({
        ...validResponse,
        data: {
          ...validResponse.data,
          data: [{ ...validResponse.data.data[0], walletAddress: "wallet", totalEarnings: 1 }],
        },
      }), { status: 200 }),
    }));
    await assert.rejects(() => api.topPlayers(), (error: unknown) => {
      return error instanceof ApiError && error.code === "RESPONSE_INVALID";
    });
  });
});
