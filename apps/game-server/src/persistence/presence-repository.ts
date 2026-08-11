import type { Pool } from "pg";

import { RoomLeaseRepository, type RoomLease } from "./room-lease.js";
import { withTransaction } from "./transaction.js";

export class PresenceRepository {
  public constructor(
    private readonly pool: Pool,
    private readonly leases: RoomLeaseRepository,
  ) {}

  public markConnected(lease: RoomLease, now?: Date): Promise<Date | null> {
    return withTransaction(this.pool, async (client) => {
      await this.leases.assertOwned(client, lease, now);
      const previous = await client.query<{ all_offline_at: Date | null }>(
        "SELECT all_offline_at FROM realtime.room_presence WHERE room_id = $1 FOR UPDATE",
        [lease.roomId],
      );
      await client.query(
        `
          INSERT INTO realtime.room_presence
            (room_id, game_session_id, fencing_token, all_offline_at, abort_deadline_at, updated_at)
          VALUES ($1, $2, $3, NULL, NULL, COALESCE($4::timestamptz, clock_timestamp()))
          ON CONFLICT (room_id) DO UPDATE
          SET game_session_id = EXCLUDED.game_session_id,
              fencing_token = EXCLUDED.fencing_token,
              all_offline_at = NULL,
              abort_deadline_at = NULL,
              updated_at = EXCLUDED.updated_at
        `,
        [lease.roomId, lease.gameId, lease.fencingToken.toString(), now ?? null],
      );
      return previous.rows[0]?.all_offline_at ?? null;
    });
  }

  public markAllOffline(lease: RoomLease, now?: Date): Promise<Date> {
    return withTransaction(this.pool, async (client) => {
      await this.leases.assertOwned(client, lease, now);
      const effective = await client.query<{ now: Date }>(
        "SELECT COALESCE($1::timestamptz, clock_timestamp()) AS now",
        [now ?? null],
      );
      const allOfflineAt = effective.rows[0]?.now;
      if (allOfflineAt === undefined) throw new Error("PostgreSQL clock is unavailable");
      const abortDeadlineAt = new Date(allOfflineAt.getTime() + 120_000);
      if (!Number.isSafeInteger(abortDeadlineAt.getTime())) throw new Error("Reconnect deadline overflowed");
      const result = await client.query<{ abort_deadline_at: Date }>(
        `
          INSERT INTO realtime.room_presence
            (room_id, game_session_id, fencing_token, all_offline_at, abort_deadline_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $4)
          ON CONFLICT (room_id) DO UPDATE
          SET game_session_id = EXCLUDED.game_session_id,
              fencing_token = EXCLUDED.fencing_token,
              all_offline_at = COALESCE(realtime.room_presence.all_offline_at, EXCLUDED.all_offline_at),
              abort_deadline_at = COALESCE(realtime.room_presence.abort_deadline_at, EXCLUDED.abort_deadline_at),
              updated_at = EXCLUDED.updated_at
          RETURNING abort_deadline_at
        `,
        [lease.roomId, lease.gameId, lease.fencingToken.toString(), allOfflineAt, abortDeadlineAt],
      );
      const deadline = result.rows[0]?.abort_deadline_at;
      if (deadline === undefined) throw new Error("Reconnect deadline was not persisted");
      return deadline;
    });
  }
}
