import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { Server as ColyseusServer, matchMaker } from "@colyseus/core";
import { Client as ColyseusClient, type Room as ClientRoom } from "@colyseus/sdk";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { SessionBootstrapResponse, TicketConsumeResponse } from "@pootown/game-contracts/internal";
import {
  CommandAcknowledgementSchema,
  CommandRejectionSchema,
  DomainEventEnvelopeSchema,
  PlayerPrivateStateMessageSchema,
  SessionStatusSchema,
} from "@pootown/game-contracts";
import express from "express";

import { CheckpointRepository } from "../src/persistence/checkpoint-repository.js";
import { CommandRepository } from "../src/persistence/command-repository.js";
import { PresenceRepository } from "../src/persistence/presence-repository.js";
import { RoomLeaseRepository } from "../src/persistence/room-lease.js";
import { createGameRoomClass } from "../src/rooms/game-room.js";
import type { GameRoomStateInstance } from "../src/rooms/game-room-state.js";
import {
  seedGameSession,
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "./database-test-helper.js";

const ownerTicket = "A".repeat(43);
const secondTicket = `${"B".repeat(42)}A`;

function within<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 10_000);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

describe("live Colyseus ticket admission", { timeout: 120_000 }, () => {
  let database: TestDatabase;
  let gameServer: ColyseusServer;
  let httpServer: HttpServer;
  let endpoint: string;
  let bootstrapCalls = 0;
  let apiStarted = false;
  let startedCalls = 0;
  let releaseSecondConsume: (() => void) | undefined;
  let blockSecondConsume = true;
  let secondConsumeStarted: Promise<void>;
  let signalSecondConsumeStarted: (() => void) | undefined;
  const rooms: ClientRoom[] = [];

  before(async () => {
    secondConsumeStarted = new Promise((resolve) => { signalSecondConsumeStarted = resolve; });
    database = await startTestDatabase();
    await seedGameSession(database.pool, "game_admission", "room_admission");
    const leases = new RoomLeaseRepository(database.pool, "admission-instance", 30_000);
    const checkpoints = new CheckpointRepository(database.pool, leases);
    const commands = new CommandRepository(database.pool, leases);
    const presence = new PresenceRepository(database.pool, leases);
    const bootstrap: SessionBootstrapResponse = {
      contractVersion: 1,
      gameId: "game_admission" as SessionBootstrapResponse["gameId"],
      gameDefinitionId: "classic_100" as SessionBootstrapResponse["gameDefinitionId"],
      gameDefinitionVersion: 1,
      rulesetId: "pootown-rust-source-v1",
      roomId: "room_admission" as SessionBootstrapResponse["roomId"],
      lifecycle: "open",
      stateVersion: 0,
      creatorPlayerId: "player_owner" as SessionBootstrapResponse["creatorPlayerId"],
      maximumPlayers: 4,
      timeLimitMs: 3_600_000,
      createdAtMs: 1,
      startedAtMs: null,
      players: [
        { playerId: "player_owner" as SessionBootstrapResponse["players"][number]["playerId"], seatIndex: 0, joinedAtMs: 1 },
        { playerId: "player_second" as SessionBootstrapResponse["players"][number]["playerId"], seatIndex: 1, joinedAtMs: 2 },
      ],
    };
    const responseFor = (ticket: string): TicketConsumeResponse => ({
      contractVersion: 1,
      userId: (ticket === ownerTicket ? "user_owner" : "user_second") as TicketConsumeResponse["userId"],
      gameId: bootstrap.gameId,
      roomId: bootstrap.roomId,
      reservationId: (ticket === ownerTicket ? "reservation_owner" : "reservation_second") as TicketConsumeResponse["reservationId"],
      playerId: (ticket === ownerTicket ? "player_owner" : "player_second") as TicketConsumeResponse["playerId"],
      seatIndex: ticket === ownerTicket ? 0 : 1,
      role: "player",
      reused: false,
    });
    const app = express();
    httpServer = createServer(app);
    gameServer = new ColyseusServer({ transport: new WebSocketTransport({ server: httpServer }) });
    gameServer.define("game", createGameRoomClass({
      api: {
        async bootstrap(gameId) {
          assert.equal(gameId, bootstrap.gameId);
          bootstrapCalls += 1;
          if (bootstrapCalls === 2) return { ...bootstrap, players: [bootstrap.players[0]!] };
          return apiStarted ? {
            ...bootstrap,
            lifecycle: "active",
            stateVersion: 3,
            startedAtMs: Date.parse("2026-08-11T21:00:01.000Z"),
          } : bootstrap;
        },
        async consumeTicket(request) {
          assert.equal(request.gameId, bootstrap.gameId);
          assert.equal(request.roomId, bootstrap.roomId);
          assert.match(request.roomInstanceId, /^admission-instance:/);
          if (request.ticket === secondTicket && blockSecondConsume) {
            signalSecondConsumeStarted?.();
            await new Promise<void>((resolve) => { releaseSecondConsume = resolve; });
            blockSecondConsume = false;
          }
          return responseFor(request.ticket);
        },
        async markStarted(gameId, request, idempotencyKey) {
          assert.equal(gameId, bootstrap.gameId);
          assert.equal(request.roomId, bootstrap.roomId);
          assert.equal(request.stateVersion, 3);
          assert.match(idempotencyKey, /^realtime-start-[a-f0-9]{64}$/);
          startedCalls += 1;
          if (startedCalls === 1) throw new Error("simulated post-commit API outage");
          apiStarted = true;
          return {
            contractVersion: 1,
            operationId: "operation_started" as never,
            committed: true,
          };
        },
        async finalizeSessionCommand() {
          throw new Error("Admission test does not finalize waiting-room commands");
        },
        async settleSession() {
          throw new Error("Admission test does not finish the game");
        },
      },
      checkpoints,
      commands,
      leaseRenewMs: 10_000,
      leases,
      presence,
    })).filterBy(["gameId"]);
    await gameServer.listen(0);
    const address = httpServer.address();
    if (typeof address !== "object" || address === null) throw new Error("Colyseus test server did not listen");
    endpoint = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await Promise.allSettled(rooms.splice(0).map((room) => within(room.leave(), "room leave")));
    await within(gameServer.gracefullyShutdown(false), "server shutdown");
    await within(stopTestDatabase(database), "database shutdown");
  });

  it("attaches only API-bound players and rejects a duplicate active player", async () => {
    const options = (ticket: string) => ({
      contractVersion: 1,
      gameId: "game_admission",
      ticket,
    });
    const owner = await within(
      new ColyseusClient(endpoint).joinOrCreate("game", options(ownerTicket)),
      "owner room join",
    );
    rooms.push(owner);
    let ownerState = owner.state as unknown as GameRoomStateInstance;
    for (let attempt = 0; attempt < 100 && ownerState.stateVersion === undefined; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      ownerState = owner.state as unknown as GameRoomStateInstance;
    }
    assert.equal(ownerState.stateVersion, 1);
    assert.equal(JSON.parse(ownerState.publicStateJson).gameId, "game_admission");
    assert.equal(JSON.parse(ownerState.publicStateJson).seats[1], null);
    assert.doesNotMatch(ownerState.publicStateJson, /rng|seed|ticket|reservation|userId/i);
    const ownerPrivate = new Promise<unknown>((resolve) => owner.onMessage("player.private", resolve));
    owner.send("player.private.sync", {});
    assert.equal(PlayerPrivateStateMessageSchema.parse(await within(ownerPrivate, "owner private state")).view.playerId, "player_owner");
    await assert.rejects(within(
      new ColyseusClient(endpoint).joinOrCreate("game", options(ownerTicket)),
      "duplicate owner rejection",
    ));
    await assert.rejects(within(new ColyseusClient(endpoint).joinOrCreate("game", {
      ...options(secondTicket),
      playerId: "player_attacker",
    }), "forged admission rejection"));
    const joinedEvent = new Promise<unknown>((resolve) => owner.onMessage("domain.event", resolve));
    const secondJoin = new ColyseusClient(endpoint).joinOrCreate("game", options(secondTicket));
    await within(secondConsumeStarted, "second ticket consume");
    const racedStartRejection = new Promise<unknown>((resolve) => owner.onMessage("command.reject", resolve));
    owner.send("command", {
      requestId: "00000000-0000-4000-8000-000000000300",
      expectedStateVersion: 1,
      type: "startGame",
      payload: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseSecondConsume?.();
    const second = await within(secondJoin, "second room join");
    rooms.push(second);
    assert.equal(DomainEventEnvelopeSchema.parse(await within(joinedEvent, "player joined event")).payload.type, "playerJoined");
    assert.equal(CommandRejectionSchema.parse(await within(racedStartRejection, "raced start rejection")).code, "STALE_STATE_VERSION");
    const secondPrivate = new Promise<unknown>((resolve) => second.onMessage("player.private", resolve));
    second.send("player.private.sync", {});
    assert.equal(PlayerPrivateStateMessageSchema.parse(await within(secondPrivate, "second private state")).view.playerId, "player_second");

    const requestId = "00000000-0000-4000-8000-000000000301";
    const ownerAck = new Promise<unknown>((resolve) => owner.onMessage("command.ack", resolve));
    const secondEvent = new Promise<unknown>((resolve) => second.onMessage("domain.event", resolve));
    const startDeferred = new Promise<unknown>((resolve) => owner.onMessage("session.status", resolve));
    owner.send("command", {
      requestId,
      expectedStateVersion: 2,
      type: "startGame",
      payload: {},
    });
    assert.deepEqual(SessionStatusSchema.parse(await within(startDeferred, "deferred start status")), {
      type: "session.status",
      status: "reconnecting",
      reason: "command-finalization-pending",
    });
    owner.send("command", {
      requestId,
      expectedStateVersion: 2,
      type: "startGame",
      payload: {},
    });
    const acknowledgement = CommandAcknowledgementSchema.parse(await within(ownerAck, "start acknowledgement"));
    const event = DomainEventEnvelopeSchema.parse(await within(secondEvent, "start event"));
    assert.equal(acknowledgement.stateVersion, 3);
    assert.equal(event.payload.type, "gameStarted");
    for (let attempt = 0; attempt < 100 && ownerState.stateVersion !== 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      ownerState = owner.state as unknown as GameRoomStateInstance;
    }
    assert.equal(ownerState.stateVersion, 3);
    assert.equal(JSON.parse(ownerState.publicStateJson).turn.phase, "awaitingRoll");

    const replayAck = new Promise<unknown>((resolve) => owner.onMessage("command.ack", resolve));
    owner.send("command", {
      requestId,
      expectedStateVersion: 2,
      type: "startGame",
      payload: {},
    });
    assert.deepEqual(CommandAcknowledgementSchema.parse(await within(replayAck, "replay acknowledgement")), acknowledgement);
    assert.equal(startedCalls, 3);
    assert.equal(second.roomId, owner.roomId);
    const durable = await database.pool.query(
      `
        SELECT checkpoint.state_version::int, lease.instance_id,
          (SELECT count(*)::int FROM realtime.room_commands command WHERE command.room_id = checkpoint.room_id) AS commands,
          (SELECT count(*)::int FROM realtime.room_events event WHERE event.room_id = checkpoint.room_id) AS events
        FROM realtime.room_checkpoints checkpoint
        JOIN realtime.room_leases lease USING (room_id, game_session_id, fencing_token)
        WHERE checkpoint.room_id = 'room_admission'
      `,
    );
    assert.equal(durable.rows[0]?.state_version, 3);
    assert.equal(durable.rows[0]?.commands, 2);
    assert.equal(durable.rows[0]?.events, 2);
    assert.match(durable.rows[0]?.instance_id as string, /^admission-instance:/);

    await within(second.leave(), "second player disconnect");
    const serverRoom = await matchMaker.getRoomById(owner.roomId);
    assert.equal(serverRoom?.locked, false);
    assert.equal(serverRoom?.clients, 1);
    const reconnected = await within(
      new ColyseusClient(endpoint).joinById(owner.roomId, options(secondTicket)),
      "second player reconnect",
    );
    rooms.push(reconnected);
    const reconnectedPrivate = new Promise<unknown>((resolve) => reconnected.onMessage("player.private", resolve));
    reconnected.send("player.private.sync", {});
    assert.equal(
      PlayerPrivateStateMessageSchema.parse(await within(reconnectedPrivate, "reconnected private state")).view.playerId,
      "player_second",
    );
    let connectedPresence = await database.pool.query(
      "SELECT abort_deadline_at FROM realtime.room_presence WHERE room_id = $1",
      ["room_admission"],
    );
    for (let attempt = 0; attempt < 100 && connectedPresence.rowCount !== 1; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      connectedPresence = await database.pool.query(
        "SELECT abort_deadline_at FROM realtime.room_presence WHERE room_id = $1",
        ["room_admission"],
      );
    }
    assert.deepEqual(connectedPresence.rows, [{ abort_deadline_at: null }]);
    await within(owner.leave(), "owner disconnect");
    await within(reconnected.leave(), "last player disconnect");
    let offlinePresence = await database.pool.query<{ window_ms: string }>(
      "SELECT extract(epoch FROM (abort_deadline_at - all_offline_at)) * 1000 AS window_ms FROM realtime.room_presence WHERE room_id = $1",
      ["room_admission"],
    );
    for (let attempt = 0; attempt < 100 &&
      (offlinePresence.rows[0]?.window_ms === null || offlinePresence.rows[0]?.window_ms === undefined);
      attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      offlinePresence = await database.pool.query<{ window_ms: string }>(
        "SELECT extract(epoch FROM (abort_deadline_at - all_offline_at)) * 1000 AS window_ms FROM realtime.room_presence WHERE room_id = $1",
        ["room_admission"],
      );
    }
    assert.equal(Number(offlinePresence.rows[0]?.window_ms), 120_000);
    rooms.length = 0;
  });
});
