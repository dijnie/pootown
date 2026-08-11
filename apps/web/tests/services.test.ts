import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GameDefinitionIdSchema,
  GameIdSchema,
} from "@pootown/game-contracts";

import { createAccountApi } from "../services/account-api.js";
import { createApiClient } from "../services/api-client.js";
import { createSessionApi } from "../services/session-api.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

describe("web API services", () => {
  it("maps session admission to the exact public route and shared contract", async () => {
    const calls: Array<{ body: unknown; headers: Record<string, string>; method: string; url: string }> = [];
    const gameId = GameIdSchema.parse("game_1");
    const definitionId = GameDefinitionIdSchema.parse("standard_1");
    const client = createApiClient({
      baseUrl: "https://api.example",
      getAccessToken: async () => "access-token",
      fetcher: async (input, init) => {
        calls.push({
          body: JSON.parse(String(init?.body)),
          headers: init?.headers as Record<string, string>,
          method: String(init?.method),
          url: String(input),
        });
        return jsonResponse({
          contractVersion: 1,
          session: {
            contractVersion: 1,
            gameId,
            gameDefinitionId: definitionId,
            roomId: "room_1",
            lifecycle: "open",
            currentPlayers: 1,
            maximumPlayers: 4,
            entryCoin: "100",
            createdAtMs: 1,
            startedAtMs: null,
            finishedAtMs: null,
            players: [{ playerId: "player_1", seatIndex: 0 }],
          },
          admission: {
            contractVersion: 1,
            gameId,
            roomId: "room_1",
            reservationId: "reservation_1",
            playerId: "player_1",
            role: "player",
            ticket: "A".repeat(43),
            expiresAtMs: 2,
          },
        });
      },
    });
    const result = await createSessionApi(client).create(definitionId, { idempotencyKey: "create-intent-1" });
    assert.equal(result.session.gameId, gameId);
    assert.deepEqual(calls, [{
      body: { contractVersion: 1, gameDefinitionId: definitionId },
      headers: {
        accept: "application/json",
        authorization: "Bearer access-token",
        "content-type": "application/json",
        "idempotency-key": "create-intent-1",
        "x-contract-version": "1",
      },
      method: "POST",
      url: "https://api.example/v1/game-sessions",
    }]);
  });

  it("keeps account coins as canonical decimal strings", async () => {
    const client = createApiClient({
      baseUrl: "https://api.example",
      getAccessToken: async () => "access-token",
      fetcher: async () => jsonResponse({
        contractVersion: 1,
        availableCoin: "900719925474099300000",
        reservedCoin: "100",
        version: 3,
      }),
    });
    const result = await createAccountApi(client).balance();
    assert.equal(result.availableCoin, "900719925474099300000");
    assert.equal(typeof result.availableCoin, "string");
  });

  it("reads published game definitions without accepting a client price", async () => {
    const calls: string[] = [];
    const client = createApiClient({
      baseUrl: "https://api.example",
      fetcher: async (input) => {
        calls.push(String(input));
        return jsonResponse({
          contractVersion: 1,
          items: [{
            contractVersion: 1,
            gameDefinitionId: "classic_100",
            displayName: "Classic",
            maximumPlayers: 4,
            entryCoin: "100",
            timeLimitMs: 3_600_000,
            policyVersion: 1,
          }],
        });
      },
    });
    const result = await createSessionApi(client).definitions();
    assert.equal(result.items[0]?.entryCoin, "100");
    assert.deepEqual(calls, ["https://api.example/v1/game-definitions"]);
  });
});
