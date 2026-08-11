import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { withTransaction } from "./transaction.js";

interface LeaseRow {
  readonly fencing_token: string;
  readonly game_session_id: string;
  readonly instance_id: string;
  readonly lease_until: Date;
}

interface ClockRow {
  readonly now: Date;
}

export interface RoomLease {
  readonly fencingToken: bigint;
  readonly gameId: string;
  readonly instanceId: string;
  readonly leaseUntil: Date;
  readonly roomId: string;
}

export class RoomLeaseUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RoomLeaseUnavailableError";
  }
}

export class RoomLeaseRepository {
  private readonly ownerId: string;

  public constructor(
    private readonly pool: Pool,
    instanceId: string,
    private readonly leaseDurationMs: number,
    incarnationId = randomUUID(),
  ) {
    this.ownerId = `${instanceId}:${incarnationId}`;
    if (this.ownerId.length > 128) throw new Error("Room lease owner ID exceeds database limit");
  }

  public acquire(roomId: string, gameId: string, now?: Date): Promise<RoomLease> {
    return withTransaction(this.pool, async (client) => {
      const effectiveNow = await this.currentTime(client, now);
      const leaseUntil = new Date(effectiveNow.getTime() + this.leaseDurationMs);
      const inserted = await client.query<LeaseRow>(
        `
          INSERT INTO realtime.room_leases
            (room_id, game_session_id, instance_id, lease_until, fencing_token, updated_at)
          VALUES ($1, $2, $3, $4, 1, $5)
          ON CONFLICT (room_id) DO NOTHING
          RETURNING game_session_id, instance_id, lease_until, fencing_token::text
        `,
        [roomId, gameId, this.ownerId, leaseUntil, effectiveNow],
      );
      if (inserted.rowCount === 1) {
        return { roomId, gameId, instanceId: this.ownerId, leaseUntil, fencingToken: 1n };
      }
      const existing = await client.query<LeaseRow>(
        `
          SELECT game_session_id, instance_id, lease_until, fencing_token::text
          FROM realtime.room_leases WHERE room_id = $1
          FOR UPDATE
        `,
        [roomId],
      );
      const current = existing.rows[0];
      if (current === undefined) throw new RoomLeaseUnavailableError("Room lease disappeared during acquisition");
      if (current.game_session_id !== gameId) {
        throw new RoomLeaseUnavailableError("Room is bound to a different game session");
      }
      if (current.instance_id !== this.ownerId && current.lease_until.getTime() > effectiveNow.getTime()) {
        throw new RoomLeaseUnavailableError("Room lease is held by another instance");
      }
      const currentToken = BigInt(current.fencing_token);
      const continuingLiveLease = current.instance_id === this.ownerId &&
        current.lease_until.getTime() > effectiveNow.getTime();
      const fencingToken = continuingLiveLease ? currentToken : currentToken + 1n;
      if (fencingToken !== currentToken) {
        await client.query(
          "UPDATE realtime.room_checkpoints SET fencing_token = $2 WHERE room_id = $1",
          [roomId, fencingToken.toString()],
        );
        await client.query(
          `
            UPDATE realtime.room_presence
            SET fencing_token = $2,
                all_offline_at = COALESCE(all_offline_at, $3::timestamptz),
                abort_deadline_at = COALESCE(abort_deadline_at, $3::timestamptz + interval '120 seconds'),
                updated_at = $4
            WHERE room_id = $1
          `,
          [roomId, fencingToken.toString(), current.lease_until, effectiveNow],
        );
      }
      await client.query(
        `
          UPDATE realtime.room_leases
          SET instance_id = $2, lease_until = $3, fencing_token = $4, updated_at = $5
          WHERE room_id = $1
        `,
        [roomId, this.ownerId, leaseUntil, fencingToken.toString(), effectiveNow],
      );
      return { roomId, gameId, instanceId: this.ownerId, leaseUntil, fencingToken };
    });
  }

  public renew(lease: RoomLease, now?: Date): Promise<RoomLease> {
    return withTransaction(this.pool, async (client) => {
      const effectiveNow = await this.currentTime(client, now);
      await this.assertOwned(client, lease, effectiveNow);
      const leaseUntil = new Date(effectiveNow.getTime() + this.leaseDurationMs);
      await client.query(
        `
          UPDATE realtime.room_leases
          SET lease_until = $4, updated_at = $5
          WHERE room_id = $1 AND game_session_id = $2 AND instance_id = $3 AND fencing_token = $6
        `,
        [lease.roomId, lease.gameId, lease.instanceId, leaseUntil, effectiveNow, lease.fencingToken.toString()],
      );
      return { ...lease, leaseUntil };
    });
  }

  public async assertOwned(client: PoolClient, lease: RoomLease, now?: Date): Promise<void> {
    const owned = await client.query(
      `
        SELECT 1 FROM realtime.room_leases
        WHERE room_id = $1 AND game_session_id = $2 AND instance_id = $3
          AND fencing_token = $4 AND lease_until > COALESCE($5::timestamptz, clock_timestamp())
        FOR UPDATE
      `,
      [lease.roomId, lease.gameId, lease.instanceId, lease.fencingToken.toString(), now],
    );
    if (owned.rowCount !== 1) throw new RoomLeaseUnavailableError("Room lease is stale or expired");
  }

  public release(lease: RoomLease, now?: Date): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const effectiveNow = await this.currentTime(client, now);
      const released = await client.query(
        `
          UPDATE realtime.room_leases
          SET lease_until = $5, updated_at = $5
          WHERE room_id = $1 AND game_session_id = $2 AND instance_id = $3 AND fencing_token = $4
            AND lease_until > $5
        `,
        [lease.roomId, lease.gameId, lease.instanceId, lease.fencingToken.toString(), effectiveNow],
      );
      return released.rowCount === 1;
    });
  }

  private async currentTime(client: PoolClient, override?: Date): Promise<Date> {
    const result = await client.query<ClockRow>(
      "SELECT COALESCE($1::timestamptz, clock_timestamp()) AS now",
      [override ?? null],
    );
    const now = result.rows[0]?.now;
    if (now === undefined) throw new Error("PostgreSQL clock is unavailable");
    return now;
  }
}
