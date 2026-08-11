import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client, Room } from "@colyseus/core";

import type { AuthenticatedRoomPlayer } from "../src/auth/ticket-auth.js";
import { createGameRoomClass } from "../src/rooms/game-room.js";

interface CrashTestRoom extends Room {
  handleRoomCommand(client: Client, payload: unknown): Promise<void>;
}

const authenticated: AuthenticatedRoomPlayer = Object.freeze({
  gameId: "game_crash",
  playerId: "player_crash",
  reservationId: "reservation_crash",
  role: "player",
  roomId: "room_crash",
  seatIndex: 0,
  userId: "user_crash",
});

describe("room delivery crash boundaries", () => {
  it("keeps the committed acknowledgement replayable after an immediate post-ack interruption", async () => {
    let interrupt = true;
    let handlerCalls = 0;
    let locks = 0;
    let broadcasts = 0;
    const sent: Array<{ type: string; payload: unknown }> = [];
    const RoomClass = createGameRoomClass({
      crashHooks: {
        afterAcknowledgement() {
          if (interrupt) throw new Error("simulated post-ack crash");
        },
      },
    } as never);
    const room = new RoomClass() as CrashTestRoom;
    Object.assign(room, {
      commandHandler: {
        async handle() {
          handlerCalls += 1;
          return {
            accepted: true,
            acknowledgement: {
              type: "command.ack",
              requestId: "00000000-0000-4000-8000-000000000108",
              stateVersion: 2,
              eventIds: ["event_crash_1"],
            },
            events: handlerCalls === 1 ? [{ type: "domain.event" }] : [],
            replayed: handlerCalls > 1,
          };
        },
      },
      lock: async () => { locks += 1; },
      broadcast: () => { broadcasts += 1; },
    });
    const client = {
      userData: authenticated,
      send(type: string, payload: unknown) { sent.push({ type, payload }); },
      error() { throw new Error("unexpected client error"); },
    } as unknown as Client;
    const command = {
      requestId: "00000000-0000-4000-8000-000000000108",
      expectedStateVersion: 1,
      type: "endTurn",
      payload: {},
    };

    await room.handleRoomCommand(client, command);
    interrupt = false;
    await room.handleRoomCommand(client, command);

    assert.equal(handlerCalls, 2);
    assert.equal(locks, 1);
    assert.equal(broadcasts, 0);
    assert.deepEqual(sent.map((message) => message.type), [
      "command.ack",
      "session.status",
      "command.ack",
    ]);
    assert.deepEqual(sent[0]?.payload, sent[2]?.payload);
  });
});
