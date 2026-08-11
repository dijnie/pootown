import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { RoomLeaseRepository, RoomLeaseUnavailableError } from "../src/persistence/room-lease.js";
import {
  seedGameSession,
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "./database-test-helper.js";

describe("room lease fencing", { timeout: 120_000 }, () => {
  let database: TestDatabase;

  before(async () => {
    database = await startTestDatabase();
    await seedGameSession(database.pool, "game_lease", "room_lease");
  });

  after(async () => stopTestDatabase(database));

  it("renews one owner and fences it after an expired takeover", async () => {
    const firstRepository = new RoomLeaseRepository(database.pool, "instance-1", 30_000);
    const secondRepository = new RoomLeaseRepository(database.pool, "instance-2", 30_000);
    const acquired = await firstRepository.acquire("room_lease", "game_lease", new Date("2026-08-11T15:00:00.000Z"));
    assert.equal(acquired.fencingToken, 1n);
    const renewed = await firstRepository.renew(acquired, new Date("2026-08-11T15:00:10.000Z"));
    assert.equal(renewed.fencingToken, 1n);
    assert.equal(renewed.leaseUntil.getTime(), Date.parse("2026-08-11T15:00:40.000Z"));
    await assert.rejects(
      secondRepository.acquire("room_lease", "game_lease", new Date("2026-08-11T15:00:39.999Z")),
      RoomLeaseUnavailableError,
    );

    const takeover = await secondRepository.acquire(
      "room_lease",
      "game_lease",
      new Date("2026-08-11T15:00:40.000Z"),
    );
    assert.equal(takeover.fencingToken, 2n);
    await assert.rejects(
      firstRepository.renew(renewed, new Date("2026-08-11T15:00:40.001Z")),
      RoomLeaseUnavailableError,
    );
    assert.equal(await firstRepository.release(renewed, new Date("2026-08-11T15:00:40.002Z")), false);
    assert.equal(await secondRepository.release(takeover, new Date("2026-08-11T15:00:40.002Z")), true);
    const reacquired = await secondRepository.acquire(
      "room_lease",
      "game_lease",
      new Date("2026-08-11T15:00:40.002Z"),
    );
    assert.equal(reacquired.fencingToken, 3n);
  });

  it("never rebinds a room identifier to another game", async () => {
    await seedGameSession(database.pool, "game_other", "room_other");
    const repository = new RoomLeaseRepository(database.pool, "instance-1", 30_000);
    await assert.rejects(
      repository.acquire("room_lease", "game_other", new Date("2026-08-11T16:00:00.000Z")),
      RoomLeaseUnavailableError,
    );
  });

  it("admits exactly one owner during concurrent first acquisition", async () => {
    await seedGameSession(database.pool, "game_lease_race", "room_lease_race");
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
      new RoomLeaseRepository(database.pool, `race-instance-${index}`, 30_000).acquire(
        "room_lease_race",
        "game_lease_race",
        new Date("2026-08-11T18:00:00.000Z"),
      )));
    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 19);
    assert.equal(rejected.every((attempt) => attempt.reason instanceof RoomLeaseUnavailableError), true);
    const stored = await database.pool.query<{ count: number; fencing_token: string }>(
      `
        SELECT count(*)::int AS count, max(fencing_token)::text AS fencing_token
        FROM realtime.room_leases WHERE room_id = $1
      `,
      ["room_lease_race"],
    );
    assert.deepEqual(stored.rows, [{ count: 1, fencing_token: "1" }]);
  });

  it("treats overlapping boots with the same configured instance name as different owners", async () => {
    await seedGameSession(database.pool, "game_same_instance", "room_same_instance");
    const firstBoot = new RoomLeaseRepository(database.pool, "shared-instance", 30_000);
    const secondBoot = new RoomLeaseRepository(database.pool, "shared-instance", 30_000);
    const firstLease = await firstBoot.acquire(
      "room_same_instance",
      "game_same_instance",
      new Date("2026-08-11T19:00:00.000Z"),
    );
    await assert.rejects(
      secondBoot.acquire("room_same_instance", "game_same_instance", new Date("2026-08-11T19:00:01.000Z")),
      RoomLeaseUnavailableError,
    );
    const takeover = await secondBoot.acquire(
      "room_same_instance",
      "game_same_instance",
      new Date("2026-08-11T19:00:30.000Z"),
    );
    assert.notEqual(takeover.instanceId, firstLease.instanceId);
    assert.equal(takeover.fencingToken, firstLease.fencingToken + 1n);
    await assert.rejects(
      firstBoot.renew(firstLease, new Date("2026-08-11T19:00:30.001Z")),
      RoomLeaseUnavailableError,
    );
  });
});
