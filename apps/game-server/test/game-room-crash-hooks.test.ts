import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client, Room } from "@colyseus/core";

import type { AuthenticatedRoomPlayer } from "../src/auth/ticket-auth.js";
import { createGameRoomClass } from "../src/rooms/game-room.js";
import { RuntimeMetrics } from "../src/observability/runtime-metrics.js";

interface CrashTestRoom extends Room {
  handleRoomCommand(client: Client, payload: unknown): Promise<void>;
}

interface AuthenticationGateTestRoom extends CrashTestRoom {
  authenticationWaiters: Set<() => void>;
  authenticationsInFlight: number;
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

  it("retries a committed leave finalization before acknowledging or publishing", async () => {
    let handlerCalls = 0;
    let finalizeCalls = 0;
    let locks = 0;
    let broadcasts = 0;
    const sent: string[] = [];
    const metrics = new RuntimeMetrics();
    const operationalFailures: unknown[] = [];
    const RoomClass = createGameRoomClass({
      metrics,
      onOperationalFailure: (event: unknown) => { operationalFailures.push(event); },
      api: {
        async finalizeSessionCommand(gameId: string, request: unknown, key: string) {
          finalizeCalls += 1;
          assert.equal(gameId, authenticated.gameId);
          assert.deepEqual(request, {
            contractVersion: 1,
            roomId: authenticated.roomId,
            playerId: authenticated.playerId,
            reservationId: authenticated.reservationId,
            action: "leave",
          });
          assert.match(key, /^realtime-finalize-[a-f0-9]{64}$/);
          if (finalizeCalls === 1) {
            const error = new Error("simulated API outage after room commit");
            error.name = "ticket_secret/player_secret/".repeat(100);
            throw error;
          }
          return { contractVersion: 1, operationId: "operation_leave", committed: true };
        },
      },
    } as never);
    const room = new RoomClass() as CrashTestRoom;
    Object.assign(room, {
      gameId: authenticated.gameId,
      logicalRoomId: authenticated.roomId,
      commandHandler: {
        async handle() {
          handlerCalls += 1;
          return {
            accepted: true,
            acknowledgement: {
              type: "command.ack",
              requestId: "00000000-0000-4000-8000-000000000109",
              stateVersion: 2,
              eventIds: ["event_leave_1"],
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
      send(type: string) { sent.push(type); },
      error() { throw new Error("unexpected client error"); },
    } as unknown as Client;
    const command = {
      requestId: "00000000-0000-4000-8000-000000000109",
      expectedStateVersion: 1,
      type: "leaveGame",
      payload: {},
    };

    await room.handleRoomCommand(client, command);
    const otherErrors: number[] = [];
    const otherClient = {
      userData: { ...authenticated, playerId: "player_other", reservationId: "reservation_other", seatIndex: 1 },
      send() { throw new Error("unexpected send to other player"); },
      error(code: number) { otherErrors.push(code); },
    } as unknown as Client;
    await room.handleRoomCommand(otherClient, command);
    await room.handleRoomCommand(client, command);

    assert.equal(handlerCalls, 2);
    assert.equal(finalizeCalls, 2);
    assert.equal(locks, 0);
    assert.equal(broadcasts, 1);
    assert.deepEqual(otherErrors, [4503]);
    assert.deepEqual(sent, ["session.status", "command.ack"]);
    assert.match(metrics.render(), /pootown_realtime_player_commands_committed_total 1/);
    assert.match(metrics.render(), /pootown_realtime_player_commands_replayed_total 1/);
    assert.match(metrics.render(), /pootown_realtime_room_finalization_failures_total 1/);
    assert.deepEqual(operationalFailures, [{ errorType: "error", kind: "room-finalization-pending" }]);
  });

  it("waits for an in-flight authentication before committing leave", async () => {
    let handlerCalls = 0;
    const RoomClass = createGameRoomClass({
      api: {
        async finalizeSessionCommand() {
          return { contractVersion: 1, operationId: "operation_leave", committed: true };
        },
      },
    } as never);
    const room = new RoomClass() as AuthenticationGateTestRoom;
    Object.assign(room, {
      authenticationsInFlight: 1,
      gameId: authenticated.gameId,
      logicalRoomId: authenticated.roomId,
      commandHandler: {
        async handle() {
          handlerCalls += 1;
          return {
            accepted: true,
            acknowledgement: {
              type: "command.ack",
              requestId: "00000000-0000-4000-8000-000000000110",
              stateVersion: 2,
              eventIds: [],
            },
            events: [],
            replayed: false,
          };
        },
      },
      broadcast: () => undefined,
    });
    const client = {
      userData: authenticated,
      send() {},
      error() { throw new Error("unexpected client error"); },
    } as unknown as Client;
    const pending = room.handleRoomCommand(client, {
      requestId: "00000000-0000-4000-8000-000000000110",
      expectedStateVersion: 1,
      type: "leaveGame",
      payload: {},
    });
    await Promise.resolve();
    assert.equal(handlerCalls, 0);
    assert.equal(room.authenticationWaiters.size, 1);

    room.authenticationsInFlight = 0;
    for (const resolveWaiter of room.authenticationWaiters) resolveWaiter();
    room.authenticationWaiters.clear();
    await pending;
    assert.equal(handlerCalls, 1);
  });
});
