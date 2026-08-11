import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client, Room } from "@colyseus/core";

import type { AuthenticatedRoomPlayer } from "../src/auth/ticket-auth.js";
import { createGameRoomClass, playerPrivateStateMessage } from "../src/rooms/game-room.js";

interface TestRoom extends Room {
  onAuth(client: Client, options: unknown): Promise<AuthenticatedRoomPlayer>;
  onJoin(client: Client, options: unknown, authenticated: AuthenticatedRoomPlayer): Promise<void>;
  onLeave(client: Client): Promise<void>;
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

function createRoom(options: {
  failBootstrapAtCall?: number;
  lifecycleAtBootstrap?: (call: number) => "active" | "open" | "settled";
  onMarkAllOffline?: (now?: Date) => void;
  onMarkConnected?: () => void;
} = {}): TestRoom {
  let bootstrapCalls = 0;
  const RoomClass = createGameRoomClass({
    api: {
      async bootstrap() {
        bootstrapCalls += 1;
        if (bootstrapCalls === options.failBootstrapAtCall) throw new Error("API unavailable");
        return {
          contractVersion: 1,
          gameId: authenticated.gameId,
          gameDefinitionId: "classic_100",
          gameDefinitionVersion: 1,
          rulesetId: "pootown-rust-source-v1",
          roomId: authenticated.roomId,
          lifecycle: options.lifecycleAtBootstrap?.(bootstrapCalls) ?? "open",
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
    presence: {
      async markConnected() {
        options.onMarkConnected?.();
        return new Date(1);
      },
      async markAllOffline(_lease: unknown, now?: Date) {
        options.onMarkAllOffline?.(now);
        return new Date(120_001);
      },
    },
  } as never);
  const room = new RoomClass() as TestRoom;
  Object.assign(room, {
    gameId: authenticated.gameId,
    logicalRoomId: authenticated.roomId,
    authenticator: { authenticate: async () => authenticated },
    commandHandler: { ensureAdmittedPlayer: async () => [] },
    lease: {
      roomId: authenticated.roomId,
      gameId: authenticated.gameId,
      instanceId: "auth-instance:boot",
      leaseUntil: new Date(60_000),
      fencingToken: 1n,
    },
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
    await room.onJoin(attachedClient, options, claims);

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

  it("rejects attachment when API closure wins the reconnect race", async () => {
    let connectedCalls = 0;
    let offlineCalls = 0;
    const room = createRoom({
      lifecycleAtBootstrap: (call) => call === 1 ? "active" : "settled",
      onMarkConnected: () => { connectedCalls += 1; },
      onMarkAllOffline: () => { offlineCalls += 1; },
    });
    const options = { contractVersion: 1, gameId: authenticated.gameId, ticket: "A".repeat(43) };
    const reconnectingClient = client("session_reconnect_race");
    const claims = await room.onAuth(reconnectingClient, options);

    await assert.rejects(room.onJoin(reconnectingClient, options, claims));

    assert.equal(connectedCalls, 1);
    assert.equal(offlineCalls, 1);
    assert.equal((reconnectingClient as Client & { userData?: unknown }).userData, undefined);
  });

  it("starts the offline window when only an unattached authentication remains", async () => {
    let offlineCalls = 0;
    const room = createRoom({ onMarkAllOffline: () => { offlineCalls += 1; } });
    const options = { contractVersion: 1, gameId: authenticated.gameId, ticket: "A".repeat(43) };
    const attachedClient = client("session_attached_last");
    const claims = await room.onAuth(attachedClient, options);
    await room.onJoin(attachedClient, options, claims);
    const sessions = (room as unknown as {
      activeSessions: Map<string, { clientSessionId: string; joined: boolean }>;
    }).activeSessions;
    sessions.set("pending_player", { clientSessionId: "session_pending", joined: false });

    await room.onLeave(attachedClient);

    assert.equal(offlineCalls, 1);
  });

  it("restores the offline window when the attachment recheck is unavailable", async () => {
    let offlineCalls = 0;
    let restoredAt: Date | undefined;
    const room = createRoom({
      failBootstrapAtCall: 2,
      onMarkAllOffline: (now) => {
        offlineCalls += 1;
        restoredAt = now;
      },
    });
    const options = { contractVersion: 1, gameId: authenticated.gameId, ticket: "A".repeat(43) };
    const reconnectingClient = client("session_reconnect_outage");
    const claims = await room.onAuth(reconnectingClient, options);

    await assert.rejects(room.onJoin(reconnectingClient, options, claims), /API unavailable/);

    assert.equal(offlineCalls, 1);
    assert.equal(restoredAt?.getTime(), 1);
    assert.equal((reconnectingClient as Client & { userData?: unknown }).userData, undefined);
  });

  it("does not mark the room offline when another socket remains attached", async () => {
    let offlineCalls = 0;
    const room = createRoom({
      failBootstrapAtCall: 2,
      onMarkAllOffline: () => { offlineCalls += 1; },
    });
    const sessions = (room as unknown as {
      activeSessions: Map<string, { clientSessionId: string; joined: boolean }>;
    }).activeSessions;
    sessions.set("other_player", { clientSessionId: "session_other", joined: true });
    const options = { contractVersion: 1, gameId: authenticated.gameId, ticket: "A".repeat(43) };
    const reconnectingClient = client("session_reconnect_with_peer");
    const claims = await room.onAuth(reconnectingClient, options);

    await assert.rejects(room.onJoin(reconnectingClient, options, claims), /API unavailable/);

    assert.equal(offlineCalls, 0);
  });
});
