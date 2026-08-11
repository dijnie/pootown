import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  gameId,
  playerId,
  serializeSnapshot,
  transition,
  type GameState,
  type RandomCheckpoint,
  type RandomSource,
} from "@pootown/game-core";

import {
  CheckpointConflictError,
  CheckpointRepository,
  CorruptCheckpointError,
} from "../src/persistence/checkpoint-repository.js";
import { RoomLeaseRepository, RoomLeaseUnavailableError } from "../src/persistence/room-lease.js";
import {
  seedGameSession,
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "./database-test-helper.js";

class CheckpointTestRandomSource implements RandomSource {
  public nextBytes(length: number): Uint8Array {
    return new Uint8Array(length);
  }

  public checkpoint(): RandomCheckpoint {
    return { algorithm: "checkpoint-test-v1", state: "initial", draws: 0, bytesConsumed: 0 };
  }

  public canResume(checkpoint: RandomCheckpoint): boolean {
    return checkpoint.algorithm === "checkpoint-test-v1";
  }
}

function lifecycleSnapshot(stateVersion: number): string {
  const result = transition(null, {
    type: "createGame",
    expectedStateVersion: 0,
    payload: { gameId: gameId("game_checkpoint"), maximumPlayers: 4, timeLimitMs: 3_600_000 },
  }, {
    actorId: playerId("player_checkpoint"),
    nowMs: Date.parse("2026-08-11T17:00:00.000Z"),
    randomSource: new CheckpointTestRandomSource(),
  });
  assert.equal(result.ok, true);
  return serializeSnapshot({ ...(result.state as GameState), stateVersion });
}

describe("durable room checkpoints", { timeout: 120_000 }, () => {
  let database: TestDatabase;

  before(async () => {
    database = await startTestDatabase();
    await seedGameSession(database.pool, "game_checkpoint", "room_checkpoint");
  });

  after(async () => stopTestDatabase(database));

  it("persists exact checksummed snapshots with version compare-and-set", async () => {
    const leases = new RoomLeaseRepository(database.pool, "instance-checkpoint-1", 30_000);
    const checkpoints = new CheckpointRepository(database.pool, leases);
    const lease = await leases.acquire(
      "room_checkpoint",
      "game_checkpoint",
      new Date("2026-08-11T17:00:00.000Z"),
    );
    const initial = await checkpoints.initialize(
      lease,
      1,
      lifecycleSnapshot(1),
      new Date("2026-08-11T17:00:01.000Z"),
    );
    assert.equal(initial.stateVersion, 1);
    assert.equal(initial.checksum.length, 64);
    assert.deepEqual(await checkpoints.load(lease, new Date("2026-08-11T17:00:02.000Z")), initial);

    const committed = await checkpoints.save(
      lease,
      1,
      2,
      lifecycleSnapshot(2),
      new Date("2026-08-11T17:00:03.000Z"),
    );
    assert.equal(committed.stateVersion, 2);
    await assert.rejects(
      checkpoints.save(
        lease,
        1,
        3,
        lifecycleSnapshot(3),
        new Date("2026-08-11T17:00:04.000Z"),
      ),
      CheckpointConflictError,
    );
    assert.equal((await checkpoints.load(lease, new Date("2026-08-11T17:00:05.000Z")))?.stateVersion, 2);
    await assert.rejects(
      checkpoints.save(lease, 2, 3, "not-json", new Date("2026-08-11T17:00:06.000Z")),
      CorruptCheckpointError,
    );
  });

  it("moves the checkpoint fence on takeover and fails closed on corruption", async () => {
    await seedGameSession(database.pool, "game_checkpoint_takeover", "room_checkpoint_takeover");
    const firstLeases = new RoomLeaseRepository(database.pool, "instance-checkpoint-1", 30_000);
    const firstCheckpoints = new CheckpointRepository(database.pool, firstLeases);
    const oldLease = await firstLeases.acquire(
      "room_checkpoint_takeover",
      "game_checkpoint_takeover",
      new Date("2026-08-11T17:10:00.000Z"),
    );
    await firstCheckpoints.initialize(
      oldLease,
      2,
      lifecycleSnapshot(2),
      new Date("2026-08-11T17:10:01.000Z"),
    );
    const secondLeases = new RoomLeaseRepository(database.pool, "instance-checkpoint-2", 30_000);
    const secondCheckpoints = new CheckpointRepository(database.pool, secondLeases);
    const takeover = await secondLeases.acquire(
      "room_checkpoint_takeover",
      "game_checkpoint_takeover",
      new Date("2026-08-11T17:10:30.000Z"),
    );
    assert.equal(takeover.fencingToken, oldLease.fencingToken + 1n);
    assert.equal((await secondCheckpoints.load(takeover, new Date("2026-08-11T17:10:31.000Z")))?.stateVersion, 2);
    await assert.rejects(
      firstCheckpoints.save(
        oldLease,
        2,
        3,
        lifecycleSnapshot(3),
        new Date("2026-08-11T17:10:31.000Z"),
      ),
      RoomLeaseUnavailableError,
    );

    await database.pool.query(
      "UPDATE realtime.room_checkpoints SET checksum = decode(repeat('ff', 32), 'hex') WHERE room_id = $1",
      [takeover.roomId],
    );
    await assert.rejects(
      secondCheckpoints.load(takeover, new Date("2026-08-11T17:10:32.000Z")),
      CorruptCheckpointError,
    );
  });
});
