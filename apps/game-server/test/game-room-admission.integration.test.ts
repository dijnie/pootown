import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { Server as ColyseusServer } from "@colyseus/core";
import { Client as ColyseusClient, type Room as ClientRoom } from "@colyseus/sdk";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { SessionBootstrapResponse, TicketConsumeResponse } from "@pootown/game-contracts/internal";
import { PlayerPrivateStateMessageSchema } from "@pootown/game-contracts";
import express from "express";

import { CheckpointRepository } from "../src/persistence/checkpoint-repository.js";
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

describe("live Colyseus ticket admission", { timeout: 120_000 }, () => {
  let database: TestDatabase;
  let gameServer: ColyseusServer;
  let httpServer: HttpServer;
  let endpoint: string;
  const rooms: ClientRoom[] = [];

  before(async () => {
    database = await startTestDatabase();
    await seedGameSession(database.pool, "game_admission", "room_admission");
    const leases = new RoomLeaseRepository(database.pool, "admission-instance", 30_000);
    const checkpoints = new CheckpointRepository(database.pool, leases);
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
          return bootstrap;
        },
        async consumeTicket(request) {
          assert.equal(request.gameId, bootstrap.gameId);
          assert.equal(request.roomId, bootstrap.roomId);
          assert.match(request.roomInstanceId, /^admission-instance:/);
          return responseFor(request.ticket);
        },
      },
      checkpoints,
      leaseRenewMs: 10_000,
      leases,
    })).filterBy(["gameId"]);
    await gameServer.listen(0);
    const address = httpServer.address();
    if (typeof address !== "object" || address === null) throw new Error("Colyseus test server did not listen");
    endpoint = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await Promise.all(rooms.splice(0).map((room) => room.leave().catch(() => undefined)));
    await gameServer?.gracefullyShutdown(false);
    await stopTestDatabase(database);
  });

  it("attaches only API-bound players and rejects a duplicate active player", async () => {
    const options = (ticket: string) => ({
      contractVersion: 1,
      gameId: "game_admission",
      ticket,
    });
    const owner = await new ColyseusClient(endpoint).joinOrCreate("game", options(ownerTicket));
    rooms.push(owner);
    let ownerState = owner.state as unknown as GameRoomStateInstance;
    for (let attempt = 0; attempt < 100 && ownerState.stateVersion === undefined; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      ownerState = owner.state as unknown as GameRoomStateInstance;
    }
    assert.equal(ownerState.stateVersion, 1);
    assert.equal(JSON.parse(ownerState.publicStateJson).gameId, "game_admission");
    assert.doesNotMatch(ownerState.publicStateJson, /rng|seed|ticket|reservation|userId/i);
    const ownerPrivate = new Promise<unknown>((resolve) => owner.onMessage("player.private", resolve));
    owner.send("player.private.sync", {});
    assert.equal(PlayerPrivateStateMessageSchema.parse(await ownerPrivate).view.playerId, "player_owner");
    const second = await new ColyseusClient(endpoint).joinOrCreate("game", options(secondTicket));
    rooms.push(second);
    const secondPrivate = new Promise<unknown>((resolve) => second.onMessage("player.private", resolve));
    second.send("player.private.sync", {});
    assert.equal(PlayerPrivateStateMessageSchema.parse(await secondPrivate).view.playerId, "player_second");
    assert.equal(second.roomId, owner.roomId);
    await assert.rejects(new ColyseusClient(endpoint).joinOrCreate("game", options(ownerTicket)));
    await assert.rejects(new ColyseusClient(endpoint).joinOrCreate("game", {
      ...options(secondTicket),
      playerId: "player_attacker",
    }));

    const durable = await database.pool.query(
      `
        SELECT checkpoint.state_version::int, lease.instance_id
        FROM realtime.room_checkpoints checkpoint
        JOIN realtime.room_leases lease USING (room_id, game_session_id, fencing_token)
        WHERE checkpoint.room_id = 'room_admission'
      `,
    );
    assert.equal(durable.rows[0]?.state_version, 1);
    assert.match(durable.rows[0]?.instance_id as string, /^admission-instance:/);
  });
});
