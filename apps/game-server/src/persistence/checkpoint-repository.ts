import { createHash, timingSafeEqual } from "node:crypto";
import { parseGameplaySnapshot, parseSnapshot } from "@pootown/game-core";
import type { Pool } from "pg";

import { RoomLeaseRepository, type RoomLease } from "./room-lease.js";
import { withTransaction } from "./transaction.js";

const CHECKPOINT_SCHEMA_VERSION = 1;
const MAX_CHECKPOINT_BYTES = 1_048_576;

interface CheckpointRow {
  readonly checksum: Buffer;
  readonly fencing_token: string;
  readonly private_state: unknown;
  readonly schema_version: number;
  readonly state_version: string;
  readonly updated_at: Date;
}

export interface RoomCheckpoint {
  readonly checksum: string;
  readonly fencingToken: bigint;
  readonly schemaVersion: number;
  readonly serializedState: string;
  readonly stateVersion: number;
  readonly updatedAt: Date;
}

export class CheckpointConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CheckpointConflictError";
  }
}

export class CorruptCheckpointError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CorruptCheckpointError";
  }
}

export function checkpointChecksum(serializedState: string): Buffer {
  return createHash("sha256").update(serializedState).digest();
}

export function validateCheckpointSnapshot(serializedState: string, stateVersion?: number): void {
  const bytes = Buffer.byteLength(serializedState);
  if (bytes === 0 || bytes > MAX_CHECKPOINT_BYTES) {
    throw new CorruptCheckpointError("Checkpoint size is invalid");
  }
  let parsedStateVersion: number | undefined;
  try {
    parsedStateVersion = parseSnapshot(serializedState).stateVersion;
  } catch {
    try {
      parsedStateVersion = parseGameplaySnapshot(serializedState).stateVersion;
    } catch {
      throw new CorruptCheckpointError("Checkpoint is not a supported complete game snapshot");
    }
  }
  if (stateVersion !== undefined && parsedStateVersion !== stateVersion) {
    throw new CorruptCheckpointError("Checkpoint state version does not match storage revision");
  }
}

export class CheckpointRepository {
  public constructor(
    private readonly pool: Pool,
    private readonly leases: RoomLeaseRepository,
  ) {}

  public async initialize(
    lease: RoomLease,
    stateVersion: number,
    serializedState: string,
    now?: Date,
  ): Promise<RoomCheckpoint> {
    validateCheckpointSnapshot(serializedState, stateVersion);
    if (!Number.isSafeInteger(stateVersion) || stateVersion < 0) {
      throw new CorruptCheckpointError("Checkpoint state version is invalid");
    }
    return withTransaction(this.pool, async (client) => {
      await this.leases.assertOwned(client, lease, now);
      const digest = checkpointChecksum(serializedState);
      const inserted = await client.query<CheckpointRow>(
        `
          INSERT INTO realtime.room_checkpoints
            (room_id, game_session_id, schema_version, state_version, fencing_token,
             checksum, private_state, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, clock_timestamp()))
          ON CONFLICT (room_id) DO NOTHING
          RETURNING schema_version, state_version::text, fencing_token::text,
                    checksum, private_state, updated_at
        `,
        [
          lease.roomId,
          lease.gameId,
          CHECKPOINT_SCHEMA_VERSION,
          stateVersion,
          lease.fencingToken.toString(),
          digest,
          { serialized: serializedState },
          now ?? null,
        ],
      );
      const row = inserted.rows[0];
      if (row === undefined) throw new CheckpointConflictError("Room checkpoint already exists");
      return this.parseRow(row);
    });
  }

  public async save(
    lease: RoomLease,
    expectedStateVersion: number,
    stateVersion: number,
    serializedState: string,
    now?: Date,
  ): Promise<RoomCheckpoint> {
    validateCheckpointSnapshot(serializedState, stateVersion);
    if (!Number.isSafeInteger(expectedStateVersion) || expectedStateVersion < 0 ||
        !Number.isSafeInteger(stateVersion) || stateVersion <= expectedStateVersion) {
      throw new CheckpointConflictError("Checkpoint version transition is invalid");
    }
    return withTransaction(this.pool, async (client) => {
      await this.leases.assertOwned(client, lease, now);
      const digest = checkpointChecksum(serializedState);
      const updated = await client.query<CheckpointRow>(
        `
          UPDATE realtime.room_checkpoints
          SET schema_version = $4, state_version = $5, checksum = $6,
              private_state = $7, updated_at = COALESCE($8::timestamptz, clock_timestamp())
          WHERE room_id = $1 AND game_session_id = $2 AND fencing_token = $3
            AND state_version = $9
          RETURNING schema_version, state_version::text, fencing_token::text,
                    checksum, private_state, updated_at
        `,
        [
          lease.roomId,
          lease.gameId,
          lease.fencingToken.toString(),
          CHECKPOINT_SCHEMA_VERSION,
          stateVersion,
          digest,
          { serialized: serializedState },
          now ?? null,
          expectedStateVersion,
        ],
      );
      const row = updated.rows[0];
      if (row === undefined) throw new CheckpointConflictError("Checkpoint state version is stale");
      return this.parseRow(row);
    });
  }

  public async load(lease: RoomLease, now?: Date): Promise<RoomCheckpoint | null> {
    return withTransaction(this.pool, async (client) => {
      await this.leases.assertOwned(client, lease, now);
      const result = await client.query<CheckpointRow>(
        `
          SELECT schema_version, state_version::text, fencing_token::text,
                 checksum, private_state, updated_at
          FROM realtime.room_checkpoints
          WHERE room_id = $1 AND game_session_id = $2 AND fencing_token = $3
        `,
        [lease.roomId, lease.gameId, lease.fencingToken.toString()],
      );
      const row = result.rows[0];
      return row === undefined ? null : this.parseRow(row);
    });
  }

  private parseRow(row: CheckpointRow): RoomCheckpoint {
    if (row.schema_version !== CHECKPOINT_SCHEMA_VERSION) {
      throw new CorruptCheckpointError("Checkpoint schema version is unsupported");
    }
    const stateVersion = Number(row.state_version);
    const state = row.private_state;
    if (!Number.isSafeInteger(stateVersion) || stateVersion < 0 ||
        typeof state !== "object" || state === null || Array.isArray(state) ||
        Object.keys(state).length !== 1 || !("serialized" in state) ||
        typeof state.serialized !== "string") {
      throw new CorruptCheckpointError("Checkpoint payload is malformed");
    }
    validateCheckpointSnapshot(state.serialized, stateVersion);
    const expected = checkpointChecksum(state.serialized);
    if (row.checksum.length !== expected.length || !timingSafeEqual(row.checksum, expected)) {
      throw new CorruptCheckpointError("Checkpoint checksum does not match payload");
    }
    return Object.freeze({
      checksum: expected.toString("hex"),
      fencingToken: BigInt(row.fencing_token),
      schemaVersion: row.schema_version,
      serializedState: state.serialized,
      stateVersion,
      updatedAt: new Date(row.updated_at),
    });
  }
}
