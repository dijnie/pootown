import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client, Room } from "@colyseus/core";

import type { AuthenticatedRoomPlayer } from "../src/auth/ticket-auth.js";
import { createGameRoomClass, playerPrivateStateMessage } from "../src/rooms/game-room.js";

interface TestRoom extends Room {
  onAuth(client: Client, options: unknown): Promise<AuthenticatedRoomPlayer>;
  onJoin(client: Client, options: unknown, authenticated: AuthenticatedRoomPlayer): void;
}

const authenticated: AuthenticatedRoomPlayer = Object.freeze({
  gameId: "game_auth",
  playerId: "player_auth",
  reservationId: "reservation_auth",
  role: "player",
  roomId: "room_auth",
  seatIndex: 0,
  userId: "user_auth",
});

function createRoom(): TestRoom {
  const RoomClass = createGameRoomClass({
    api: {
      async bootstrap() {
        return {
          contractVersion: 1,
          gameId: authenticated.gameId,
          gameDefinitionId: "classic_100",
          gameDefinitionVersion: 1,
          rulesetId: "pootown-rust-source-v1",
          roomId: authenticated.roomId,
          lifecycle: "open",
          stateVersion: 0,
          creatorPlayerId: authenticated.playerId,
          maximumPlayers: 4,
          timeLimitMs: null,
          createdAtMs: 1,
          startedAtMs: null,
          players: [{ playerId: authenticated.playerId, seatIndex: 0, joinedAtMs: 1 }],
        } as never;
      },
    },
  } as never);
  const room = new RoomClass() as TestRoom;
  Object.assign(room, {
    gameId: authenticated.gameId,
    logicalRoomId: authenticated.roomId,
    authenticator: { authenticate: async () => authenticated },
    commandHandler: { ensureAdmittedPlayer: async () => [] },
    seatReservationTimeout: 0,
  });
  return room;
}

function client(sessionId: string): Client {
  return { sessionId } as Client;
}

describe("room authentication reservation", () => {
  it("releases a consumed-ticket reservation when the socket never attaches", async () => {
    const room = createRoom();
    const options = { contractVersion: 1, gameId: authenticated.gameId, ticket: "A".repeat(43) };
    await room.onAuth(client("session_abandoned"), options);
    await assert.rejects(room.onAuth(client("session_blocked"), options));

    room.clock.tick();
    assert.deepEqual(await room.onAuth(client("session_retry"), options), authenticated);
  });

  it("keeps an attached player reserved after the authentication timeout", async () => {
    const room = createRoom();
    const options = { contractVersion: 1, gameId: authenticated.gameId, ticket: "A".repeat(43) };
    const attachedClient = client("session_attached");
    const claims = await room.onAuth(attachedClient, options);
    room.onJoin(attachedClient, options, claims);

    room.clock.tick();
    assert.deepEqual(playerPrivateStateMessage(claims), {
      type: "player.private",
      view: {
        schemaVersion: 1,
        gameId: "game_auth",
        playerId: "player_auth",
        reconnectDeadlineAtMs: null,
      },
    });
    await assert.rejects(room.onAuth(client("session_duplicate"), options));
  });
});
