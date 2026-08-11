import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { PresenceRepository } from "../src/persistence/presence-repository.js";
import { RoomLeaseRepository, RoomLeaseUnavailableError } from "../src/persistence/room-lease.js";
import {
  seedGameSession,
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "./database-test-helper.js";

describe("durable room presence", { timeout: 120_000 }, () => {
  let database: TestDatabase;

  before(async () => {
    database = await startTestDatabase();
    await seedGameSession(database.pool, "game_presence", "room_presence");
  });

  after(async () => stopTestDatabase(database));

  it("preserves the first all-offline deadline and fences stale owners", async () => {
    const firstLeases = new RoomLeaseRepository(database.pool, "presence-first", 30_000);
    const firstPresence = new PresenceRepository(database.pool, firstLeases);
    const offlineAt = new Date("2026-08-11T23:00:00.000Z");
    const firstLease = await firstLeases.acquire("room_presence", "game_presence", offlineAt);
    assert.equal(
      (await firstPresence.markAllOffline(firstLease, offlineAt)).toISOString(),
      "2026-08-11T23:02:00.000Z",
    );
    assert.equal(
      (await firstPresence.markAllOffline(firstLease, new Date(offlineAt.getTime() + 29_000))).toISOString(),
      "2026-08-11T23:02:00.000Z",
    );
    await firstLeases.release(firstLease, new Date(offlineAt.getTime() + 31_000));

    const secondLeases = new RoomLeaseRepository(database.pool, "presence-second", 30_000);
    const secondPresence = new PresenceRepository(database.pool, secondLeases);
    const secondLease = await secondLeases.acquire(
      "room_presence",
      "game_presence",
      new Date(offlineAt.getTime() + 32_000),
    );
    assert.equal(secondLease.fencingToken, 2n);
    await assert.rejects(
      firstPresence.markConnected(firstLease, new Date(offlineAt.getTime() + 33_000)),
      RoomLeaseUnavailableError,
    );
    assert.equal(
      (await secondPresence.markConnected(secondLease, new Date(offlineAt.getTime() + 33_000)))?.toISOString(),
      offlineAt.toISOString(),
    );
    const stored = await database.pool.query(
      "SELECT fencing_token::int, all_offline_at, abort_deadline_at FROM realtime.room_presence WHERE room_id = $1",
      [secondLease.roomId],
    );
    assert.deepEqual(stored.rows, [{ fencing_token: 2, all_offline_at: null, abort_deadline_at: null }]);
  });

  it("starts the reconnect window from the previous owner's last live lease", async () => {
    await seedGameSession(database.pool, "game_presence_crash", "room_presence_crash");
    const lastLiveAt = new Date("2026-08-11T23:10:00.000Z");
    const firstLeases = new RoomLeaseRepository(database.pool, "crash-first", 30_000);
    const firstPresence = new PresenceRepository(database.pool, firstLeases);
    const firstLease = await firstLeases.acquire("room_presence_crash", "game_presence_crash", lastLiveAt);
    await firstPresence.markConnected(firstLease, lastLiveAt);

    const secondLeases = new RoomLeaseRepository(database.pool, "crash-second", 30_000);
    const secondLease = await secondLeases.acquire(
      "room_presence_crash",
      "game_presence_crash",
      new Date(lastLiveAt.getTime() + 31_000),
    );
    const stored = await database.pool.query<{
      abort_deadline_at: Date;
      all_offline_at: Date;
      fencing_token: string;
    }>(
      `
        SELECT fencing_token::text, all_offline_at, abort_deadline_at
        FROM realtime.room_presence WHERE room_id = $1
      `,
      [secondLease.roomId],
    );
    assert.deepEqual(stored.rows, [{
      fencing_token: "2",
      all_offline_at: new Date(lastLiveAt.getTime() + 30_000),
      abort_deadline_at: new Date(lastLiveAt.getTime() + 150_000),
    }]);
  });
});
