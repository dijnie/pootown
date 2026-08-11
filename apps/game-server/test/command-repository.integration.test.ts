import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { CheckpointRepository } from "../src/persistence/checkpoint-repository.js";
import {
  CommandCommitConflictError,
  CommandIdempotencyConflictError,
  CommandRepository,
} from "../src/persistence/command-repository.js";
import { RoomLeaseRepository } from "../src/persistence/room-lease.js";
import {
  finishedGameplaySnapshot,
  gameplaySnapshot,
  lifecycleSnapshot,
  seedGameSession,
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "./database-test-helper.js";

describe("atomic room command persistence", { timeout: 120_000 }, () => {
  let database: TestDatabase;

  before(async () => {
    database = await startTestDatabase();
    await seedGameSession(database.pool, "game_command", "room_command");
    await seedGameSession(database.pool, "game_command_race", "room_command_race");
    await seedGameSession(database.pool, "game_command_duplicate", "room_command_duplicate");
    await seedGameSession(database.pool, "game_command_timer", "room_command_timer");
    await seedGameSession(database.pool, "game_command_precommit", "room_command_precommit");
    await seedGameSession(database.pool, "game_command_postcommit", "room_command_postcommit");
  });

  after(async () => stopTestDatabase(database));

  it("commits checkpoint, events, and acknowledgement once before exact replay", async () => {
    const leases = new RoomLeaseRepository(database.pool, "command-instance", 30_000);
    const lease = await leases.acquire("room_command", "game_command", new Date("2026-08-11T20:00:00.000Z"));
    await new CheckpointRepository(database.pool, leases).initialize(
      lease,
      1,
      lifecycleSnapshot("game_command", 1),
      new Date("2026-08-11T20:00:01.000Z"),
    );
    const commands = new CommandRepository(database.pool, leases);
    const value = {
      playerId: "player_checkpoint",
      command: {
        requestId: "00000000-0000-4000-8000-000000000101",
        expectedStateVersion: 1,
        type: "joinGame",
        payload: {},
      },
      stateVersion: 2,
      serializedState: lifecycleSnapshot("game_command", 2),
      acknowledgement: {
        type: "command.ack",
        requestId: "00000000-0000-4000-8000-000000000101",
        stateVersion: 2,
        eventIds: ["event_command_1"],
      },
      events: [{
        type: "domain.event",
        eventId: "event_command_1",
        stateVersion: 2,
        occurredAtMs: Date.parse("2026-08-11T20:00:02.000Z"),
        payload: { type: "playerJoined", playerId: "player_2", seatIndex: 1, totalPlayers: 2 },
      }],
    };
    const committed = await commands.commit(lease, value, new Date("2026-08-11T20:00:02.000Z"));
    assert.equal(committed.duplicate, false);
    assert.deepEqual(
      await commands.findReplay(lease, value.playerId, value.command, new Date("2026-08-11T20:00:02.500Z")),
      committed.acknowledgement,
    );
    const replay = await commands.commit(lease, value, new Date("2026-08-11T20:00:03.000Z"));
    assert.equal(replay.duplicate, true);
    assert.deepEqual(replay.acknowledgement, committed.acknowledgement);

    await assert.rejects(commands.commit(lease, {
      ...value,
      command: { ...value.command, type: "leaveGame" },
    }, new Date("2026-08-11T20:00:04.000Z")), CommandIdempotencyConflictError);
    await assert.rejects(commands.findReplay(lease, value.playerId, {
      ...value.command,
      type: "leaveGame",
    }, new Date("2026-08-11T20:00:04.000Z")), CommandIdempotencyConflictError);
    const stored = await database.pool.query(
      `
        SELECT
          (SELECT count(*)::int FROM realtime.room_commands WHERE room_id = $1) AS commands,
          (SELECT count(*)::int FROM realtime.room_events WHERE room_id = $1) AS events,
          (SELECT state_version::int FROM realtime.room_checkpoints WHERE room_id = $1) AS state_version
      `,
      [lease.roomId],
    );
    assert.deepEqual(stored.rows, [{ commands: 1, events: 1, state_version: 2 }]);
  });

  it("allows exactly one command from a shared expected revision", async () => {
    const leases = new RoomLeaseRepository(database.pool, "command-instance", 30_000);
    const lease = await leases.acquire(
      "room_command_race",
      "game_command_race",
      new Date("2026-08-11T20:00:05.000Z"),
    );
    await new CheckpointRepository(database.pool, leases).initialize(
      lease,
      2,
      lifecycleSnapshot("game_command_race", 2),
      new Date("2026-08-11T20:00:05.000Z"),
    );
    const commands = new CommandRepository(database.pool, leases);
    const attempt = (requestId: string) => commands.commit(lease, {
      playerId: "player_checkpoint",
      command: { requestId, expectedStateVersion: 2, type: "joinGame", payload: {} },
      stateVersion: 3,
      serializedState: lifecycleSnapshot("game_command_race", 3),
      acknowledgement: { type: "command.ack", requestId, stateVersion: 3, eventIds: [] },
      events: [],
    }, new Date("2026-08-11T20:00:06.000Z"));
    const results = await Promise.allSettled([
      attempt("00000000-0000-4000-8000-000000000102"),
      attempt("00000000-0000-4000-8000-000000000103"),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.equal(rejected?.status === "rejected" && rejected.reason instanceof CommandCommitConflictError, true);
    const stored = await database.pool.query(
      "SELECT state_version::int FROM realtime.room_checkpoints WHERE room_id = $1",
      [lease.roomId],
    );
    assert.deepEqual(stored.rows, [{ state_version: 3 }]);
  });

  it("returns the committed acknowledgement to concurrent exact duplicates", async () => {
    const leases = new RoomLeaseRepository(database.pool, "command-instance", 30_000);
    const lease = await leases.acquire(
      "room_command_duplicate",
      "game_command_duplicate",
      new Date("2026-08-11T20:00:07.000Z"),
    );
    await new CheckpointRepository(database.pool, leases).initialize(
      lease,
      4,
      lifecycleSnapshot("game_command_duplicate", 4),
      new Date("2026-08-11T20:00:07.000Z"),
    );
    const commands = new CommandRepository(database.pool, leases);
    const value = {
      playerId: "player_checkpoint",
      command: {
        requestId: "00000000-0000-4000-8000-000000000104",
        expectedStateVersion: 4,
        type: "joinGame",
        payload: {},
      },
      stateVersion: 5,
      serializedState: lifecycleSnapshot("game_command_duplicate", 5),
      acknowledgement: {
        type: "command.ack",
        requestId: "00000000-0000-4000-8000-000000000104",
        stateVersion: 5,
        eventIds: [],
      },
      events: [],
    };
    const results = await Promise.all([
      commands.commit(lease, value, new Date("2026-08-11T20:00:08.000Z")),
      commands.commit(lease, value, new Date("2026-08-11T20:00:08.000Z")),
    ]);
    assert.deepEqual(results.map((result) => result.duplicate).sort(), [false, true]);
    assert.deepEqual(results[0]?.acknowledgement, results[1]?.acknowledgement);
    const stored = await database.pool.query(
      `
        SELECT
          (SELECT count(*)::int FROM realtime.room_commands WHERE room_id = $1) AS commands,
          (SELECT state_version::int FROM realtime.room_checkpoints WHERE room_id = $1) AS state_version
      `,
      [lease.roomId],
    );
    assert.deepEqual(stored.rows, [{ commands: 1, state_version: 5 }]);
  });

  it("persists deterministic internal timer commands under the system actor", async () => {
    const leases = new RoomLeaseRepository(database.pool, "command-instance", 30_000);
    const now = new Date("2026-08-11T20:00:09.000Z");
    const lease = await leases.acquire("room_command_timer", "game_command_timer", now);
    await new CheckpointRepository(database.pool, leases).initialize(
      lease,
      2,
      gameplaySnapshot("game_command_timer", 2),
      now,
    );
    const commands = new CommandRepository(database.pool, leases);
    const command = {
      requestId: "00000000-0000-4000-8000-000000000105",
      expectedStateVersion: 2,
      type: "warnTurnThirtySeconds",
      payload: {},
    } as const;
    const value = {
      playerId: "system_timer",
      command,
      stateVersion: 3,
      serializedState: finishedGameplaySnapshot("game_command_timer", 3),
      acknowledgement: { type: "command.ack", requestId: command.requestId, stateVersion: 3, eventIds: [] },
      events: [],
      terminalProof: { endReason: "timeLimit", winnerPlayerId: "player_checkpoint" },
    } as const;
    const committed = await commands.commit(lease, value, now);
    assert.equal(committed.duplicate, false);
    assert.deepEqual(await commands.findReplay(lease, "system_timer", command, now), committed.acknowledgement);
    const stored = await database.pool.query(
      `
        SELECT command.player_id, checkpoint.state_version::int,
          (SELECT count(*)::int FROM realtime.terminal_proofs proof WHERE proof.room_id = command.room_id) AS proofs
        FROM realtime.room_commands command
        JOIN realtime.room_checkpoints checkpoint USING (room_id)
        WHERE command.room_id = $1
      `,
      [lease.roomId],
    );
    assert.deepEqual(stored.rows, [{ player_id: "system_timer", state_version: 3, proofs: 1 }]);
  });

  it("rolls back every durable artifact when interrupted before commit", async () => {
    const now = new Date("2026-08-11T20:10:00.000Z");
    const leases = new RoomLeaseRepository(database.pool, "precommit-instance", 30_000);
    const lease = await leases.acquire("room_command_precommit", "game_command_precommit", now);
    await new CheckpointRepository(database.pool, leases).initialize(
      lease,
      1,
      lifecycleSnapshot("game_command_precommit", 1),
      now,
    );
    let interrupt = true;
    const commands = new CommandRepository(database.pool, leases, {
      beforeCommit() {
        if (interrupt) throw new Error("simulated pre-commit crash");
      },
    });
    const requestId = "00000000-0000-4000-8000-000000000106";
    const value = {
      playerId: "player_checkpoint",
      command: { requestId, expectedStateVersion: 1, type: "joinGame", payload: {} },
      stateVersion: 2,
      serializedState: lifecycleSnapshot("game_command_precommit", 2),
      acknowledgement: { type: "command.ack", requestId, stateVersion: 2, eventIds: [] },
      events: [],
    } as const;

    await assert.rejects(commands.commit(lease, value, now), /simulated pre-commit crash/);
    const rolledBack = await database.pool.query(
      `
        SELECT
          (SELECT count(*)::int FROM realtime.room_commands WHERE room_id = $1) AS commands,
          (SELECT count(*)::int FROM realtime.room_events WHERE room_id = $1) AS events,
          (SELECT state_version::int FROM realtime.room_checkpoints WHERE room_id = $1) AS state_version
      `,
      [lease.roomId],
    );
    assert.deepEqual(rolledBack.rows, [{ commands: 0, events: 0, state_version: 1 }]);

    interrupt = false;
    assert.equal((await commands.commit(lease, value, now)).duplicate, false);
  });

  it("returns the stored acknowledgement after interruption following commit", async () => {
    const now = new Date("2026-08-11T20:20:00.000Z");
    const leases = new RoomLeaseRepository(database.pool, "postcommit-instance", 30_000);
    const lease = await leases.acquire("room_command_postcommit", "game_command_postcommit", now);
    await new CheckpointRepository(database.pool, leases).initialize(
      lease,
      1,
      lifecycleSnapshot("game_command_postcommit", 1),
      now,
    );
    const commands = new CommandRepository(database.pool, leases, {
      afterCommit() { throw new Error("simulated post-commit crash"); },
    });
    const requestId = "00000000-0000-4000-8000-000000000107";
    const value = {
      playerId: "player_checkpoint",
      command: { requestId, expectedStateVersion: 1, type: "joinGame", payload: {} },
      stateVersion: 2,
      serializedState: lifecycleSnapshot("game_command_postcommit", 2),
      acknowledgement: { type: "command.ack", requestId, stateVersion: 2, eventIds: [] },
      events: [],
    } as const;

    await assert.rejects(commands.commit(lease, value, now), /simulated post-commit crash/);
    assert.deepEqual(await commands.findReplay(lease, value.playerId, value.command, now), value.acknowledgement);
    const replay = await commands.commit(lease, value, now);
    assert.equal(replay.duplicate, true);
    const stored = await database.pool.query(
      `
        SELECT
          (SELECT count(*)::int FROM realtime.room_commands WHERE room_id = $1) AS commands,
          (SELECT count(*)::int FROM realtime.room_events WHERE room_id = $1) AS events,
          (SELECT state_version::int FROM realtime.room_checkpoints WHERE room_id = $1) AS state_version
      `,
      [lease.roomId],
    );
    assert.deepEqual(stored.rows, [{ commands: 1, events: 0, state_version: 2 }]);
  });
});
