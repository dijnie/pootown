import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TicketConsumeRequest, TicketConsumeResponse } from "@pootown/game-contracts/internal";

import {
  TicketAuthenticationError,
  TicketAuthenticator,
  type TicketAdmissionApi,
} from "../src/auth/ticket-auth.js";

const options = {
  contractVersion: 1 as const,
  gameId: "game_1",
  ticket: "A".repeat(43),
};

function response(overrides: Partial<TicketConsumeResponse> = {}): TicketConsumeResponse {
  return {
    contractVersion: 1,
    userId: "user_1" as TicketConsumeResponse["userId"],
    gameId: "game_1" as TicketConsumeResponse["gameId"],
    roomId: "room_1" as TicketConsumeResponse["roomId"],
    reservationId: "reservation_1" as TicketConsumeResponse["reservationId"],
    playerId: "player_1" as TicketConsumeResponse["playerId"],
    seatIndex: 0,
    role: "player",
    reused: false,
    ...overrides,
  };
}

describe("realtime ticket authentication", () => {
  it("derives private player claims only from the API consume result", async () => {
    let consumedRequest: TicketConsumeRequest | undefined;
    let consumedKey: string | undefined;
    const api: TicketAdmissionApi = {
      async consumeTicket(request, idempotencyKey) {
        consumedRequest = request;
        consumedKey = idempotencyKey;
        return response();
      },
    };
    const authenticator = new TicketAuthenticator(api, "game-server:boot-1", response().roomId);
    const authenticated = await authenticator.authenticate(options);
    assert.deepEqual(authenticated, {
      gameId: "game_1",
      playerId: "player_1",
      reservationId: "reservation_1",
      role: "player",
      roomId: "room_1",
      seatIndex: 0,
      userId: "user_1",
    });
    assert.equal(Object.isFrozen(authenticated), true);
    assert.deepEqual(consumedRequest, {
      contractVersion: 1,
      ticket: options.ticket,
      gameId: options.gameId,
      roomId: "room_1",
      roomInstanceId: "game-server:boot-1",
    });
    assert.match(consumedKey ?? "", /^realtime-consume-[a-f0-9]{64}$/);
    assert.equal(consumedKey?.includes(options.ticket), false);
  });

  it("rejects forged client claims before API consumption", async () => {
    let calls = 0;
    const authenticator = new TicketAuthenticator({
      async consumeTicket() {
        calls += 1;
        return response();
      },
    }, "game-server:boot-1", response().roomId);
    for (const forged of [
      { ...options, userId: "user_attacker" },
      { ...options, playerId: "player_attacker" },
      { ...options, seatIndex: 3 },
      { ...options, role: "spectator" },
      { ...options, roomId: "room_attacker" },
      { ...options, ticket: "not-a-ticket" },
    ]) {
      await assert.rejects(authenticator.authenticate(forged), TicketAuthenticationError);
    }
    assert.equal(calls, 0);
  });

  it("fails closed when the API response is bound to another room", async () => {
    const authenticator = new TicketAuthenticator({
      async consumeTicket() {
        return response({ roomId: "room_other" as TicketConsumeResponse["roomId"] });
      },
    }, "game-server:boot-1", response().roomId);
    await assert.rejects(authenticator.authenticate(options), TicketAuthenticationError);
  });
});
