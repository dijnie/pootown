import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InternalApiClient, InternalApiRequestError } from "../src/api/internal-api-client.js";

const bootstrap = {
  contractVersion: 1 as const,
  gameId: "game_1",
  gameDefinitionId: "classic_100",
  gameDefinitionVersion: 1,
  rulesetId: "pootown-rust-source-v1" as const,
  roomId: "room_1",
  lifecycle: "open" as const,
  stateVersion: 0,
  creatorPlayerId: "player_1",
  maximumPlayers: 4,
  timeLimitMs: 3_600_000,
  createdAtMs: 1,
  startedAtMs: null,
  players: [{ playerId: "player_1", seatIndex: 0, joinedAtMs: 1 }],
};

describe("internal API client", () => {
  it("authenticates and strictly parses the realtime bootstrap", async () => {
    const client = new InternalApiClient({
      baseUrl: "https://api.pootown.example",
      credentialProvider: { async issue() { return "signed-service-token"; } },
      fetchImplementation: async (input, init) => {
        assert.equal(input, "https://api.pootown.example/internal/v1/game-sessions/game_1/bootstrap");
        assert.equal(init?.method, "GET");
        assert.deepEqual(init?.headers, {
          authorization: "Bearer signed-service-token",
          "x-contract-version": "1",
        });
        return Response.json(bootstrap);
      },
    });
    assert.deepEqual(await client.bootstrap("game_1"), bootstrap);
  });

  it("binds ticket consumption and rejects malformed success or error envelopes", async () => {
    const requests: RequestInit[] = [];
    const client = new InternalApiClient({
      baseUrl: "https://api.pootown.example",
      credentialProvider: { async issue() { return "signed-service-token"; } },
      fetchImplementation: async (_input, init) => {
        requests.push(init ?? {});
        return Response.json({
          contractVersion: 1,
          userId: "user_1",
          gameId: "game_1",
          roomId: "room_1",
          reservationId: "reservation_1",
          playerId: "player_1",
          seatIndex: 0,
          role: "player",
          reused: false,
        });
      },
    });
    await client.consumeTicket({
      contractVersion: 1,
      ticket: "A".repeat(43),
      gameId: "game_1",
      roomId: "room_1",
      roomInstanceId: "game-server-1",
    }, "consume:game-server-1:game_1:player_1");
    assert.equal(requests[0]?.method, "POST");
    assert.deepEqual(JSON.parse(requests[0]?.body as string), {
      contractVersion: 1,
      ticket: "A".repeat(43),
      gameId: "game_1",
      roomId: "room_1",
      roomInstanceId: "game-server-1",
    });
    assert.deepEqual(requests[0]?.headers, {
      "content-type": "application/json",
      "idempotency-key": "consume:game-server-1:game_1:player_1",
      authorization: "Bearer signed-service-token",
      "x-contract-version": "1",
    });

    const malformed = new InternalApiClient({
      baseUrl: "https://api.pootown.example",
      credentialProvider: { async issue() { return "signed-service-token"; } },
      fetchImplementation: async () => Response.json({ ...bootstrap, userId: "private" }),
    });
    await assert.rejects(malformed.bootstrap("game_1"), (error: unknown) =>
      error instanceof InternalApiRequestError && error.code === "INTERNAL_API_INVALID_RESPONSE");

    const failing = new InternalApiClient({
      baseUrl: "https://api.pootown.example",
      credentialProvider: { async issue() { return "signed-service-token"; } },
      fetchImplementation: async () => Response.json({
        error: {
          code: "TICKET_EXPIRED",
          message: "expired",
          requestId: "00000000-0000-4000-8000-000000000001",
        },
      }, { status: 401 }),
    });
    await assert.rejects(failing.bootstrap("game_1"), (error: unknown) =>
      error instanceof InternalApiRequestError && error.status === 401 && error.code === "TICKET_EXPIRED");
    assert.equal(requests.length, 1);
  });

  it("marks the exact committed room revision started with an idempotency key", async () => {
    let observed: { input: string; init?: RequestInit } | undefined;
    const client = new InternalApiClient({
      baseUrl: "https://api.pootown.example",
      credentialProvider: { async issue() { return "signed-service-token"; } },
      fetchImplementation: async (input, init) => {
        observed = { input: String(input), ...(init === undefined ? {} : { init }) };
        return Response.json({ contractVersion: 1, operationId: "operation_started", committed: true });
      },
    });
    const response = await client.markStarted("game_1", {
      contractVersion: 1,
      roomId: "room_1",
      stateVersion: 7,
    }, "realtime-start-key");
    assert.equal(response.committed, true);
    assert.equal(observed?.input, "https://api.pootown.example/internal/v1/game-sessions/game_1/started");
    assert.equal(observed?.init?.method, "POST");
    assert.deepEqual(JSON.parse(observed?.init?.body as string), {
      contractVersion: 1,
      roomId: "room_1",
      stateVersion: 7,
    });
    assert.equal((observed?.init?.headers as Record<string, string>)["idempotency-key"], "realtime-start-key");
  });
});
