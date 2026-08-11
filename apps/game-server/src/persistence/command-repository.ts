import { createHash } from "node:crypto";
import {
  CommandAcknowledgementSchema,
  DomainEventEnvelopeSchema,
  GameplayDomainEventEnvelopeSchema,
  PlayerIdSchema,
  RoomCommandSchema,
  type CommandAcknowledgement,
  type RoomCommand,
} from "@pootown/game-contracts";
import {
  InternalGameplayCommandSchema,
  type InternalGameplayCommand,
} from "@pootown/game-contracts/internal";
import type { Pool } from "pg";

import {
  checkpointChecksum,
  validateCheckpointSnapshot,
} from "./checkpoint-repository.js";
import { RoomLeaseRepository, type RoomLease } from "./room-lease.js";
import { withTransaction } from "./transaction.js";

interface StoredCommandRow {
  readonly response_snapshot: unknown;
}

interface StoredCommandResponse {
  readonly acknowledgement: CommandAcknowledgement;
  readonly requestHash: string;
}

export interface CommandCommit {
  readonly acknowledgement: unknown;
  readonly events: readonly unknown[];
  readonly playerId: string;
  readonly command: unknown;
  readonly serializedState: string;
  readonly stateVersion: number;
  readonly terminalProof?: {
    readonly endReason: "lastPlayerStanding" | "timeLimit" | "timeoutForfeit";
    readonly winnerPlayerId: string;
  };
}

export interface CommandCommitResult {
  readonly acknowledgement: CommandAcknowledgement;
  readonly duplicate: boolean;
}

export interface CommandPersistenceHooks {
  readonly afterCommit?: () => void | Promise<void>;
  readonly beforeCommit?: () => void | Promise<void>;
}

export class CommandCommitConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CommandCommitConflictError";
  }
}

export class CommandIdempotencyConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CommandIdempotencyConflictError";
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const fields = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${fields.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new CommandCommitConflictError("Command contains a non-serializable value");
  return encoded;
}

type PersistedRoomCommand = RoomCommand | InternalGameplayCommand;

function parsePersistedCommand(value: unknown): PersistedRoomCommand {
  const playerCommand = RoomCommandSchema.safeParse(value);
  return playerCommand.success ? playerCommand.data : InternalGameplayCommandSchema.parse(value);
}

function requestHash(command: PersistedRoomCommand): string {
  return createHash("sha256").update(canonicalJson(command)).digest("hex");
}

function parseStoredResponse(value: unknown): StoredCommandResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Object.keys(value).length !== 2 || !("requestHash" in value) || !("acknowledgement" in value) ||
      typeof value.requestHash !== "string" || !/^[a-f0-9]{64}$/.test(value.requestHash)) {
    throw new CommandCommitConflictError("Stored command response is corrupt");
  }
  const acknowledgement = CommandAcknowledgementSchema.safeParse(value.acknowledgement);
  if (!acknowledgement.success) throw new CommandCommitConflictError("Stored command acknowledgement is corrupt");
  return { requestHash: value.requestHash, acknowledgement: acknowledgement.data };
}

export class CommandRepository {
  public constructor(
    private readonly pool: Pool,
    private readonly leases: RoomLeaseRepository,
    private readonly hooks: CommandPersistenceHooks = {},
  ) {}

  public async findReplay(
    lease: RoomLease,
    playerIdValue: string,
    commandValue: unknown,
    now?: Date,
  ): Promise<CommandAcknowledgement | null> {
    const command = parsePersistedCommand(commandValue);
    const playerId = PlayerIdSchema.parse(playerIdValue);
    const hash = requestHash(command);
    return withTransaction(this.pool, async (client) => {
      await this.leases.assertOwned(client, lease, now);
      const existing = await client.query<StoredCommandRow>(
        `
          SELECT response_snapshot FROM realtime.room_commands
          WHERE room_id = $1 AND player_id = $2 AND request_id = $3
        `,
        [lease.roomId, playerId, command.requestId],
      );
      const prior = existing.rows[0];
      if (prior === undefined) return null;
      const stored = parseStoredResponse(prior.response_snapshot);
      if (stored.requestHash !== hash) {
        throw new CommandIdempotencyConflictError("Command request ID was reused with different content");
      }
      return stored.acknowledgement;
    });
  }

  public async commit(lease: RoomLease, value: CommandCommit, now?: Date): Promise<CommandCommitResult> {
    const command = parsePersistedCommand(value.command);
    const playerId = PlayerIdSchema.parse(value.playerId);
    const acknowledgement = CommandAcknowledgementSchema.parse(value.acknowledgement);
    const events = value.events.map((event) => {
      const lifecycle = DomainEventEnvelopeSchema.safeParse(event);
      if (lifecycle.success) return lifecycle.data;
      return GameplayDomainEventEnvelopeSchema.parse(event);
    });
    const hash = requestHash(command);
    if (value.stateVersion !== command.expectedStateVersion + 1 ||
        acknowledgement.requestId !== command.requestId || acknowledgement.stateVersion !== value.stateVersion ||
        events.some((event) => event.stateVersion !== value.stateVersion) ||
        acknowledgement.eventIds.length !== events.length ||
        acknowledgement.eventIds.some((eventId, index) => eventId !== events[index]?.eventId)) {
      throw new CommandCommitConflictError("Command result versions or events are inconsistent");
    }
    validateCheckpointSnapshot(value.serializedState, value.stateVersion);
    const result = await withTransaction(this.pool, async (client) => {
      await this.leases.assertOwned(client, lease, now);
      const existing = await client.query<StoredCommandRow>(
        `
          SELECT response_snapshot FROM realtime.room_commands
          WHERE room_id = $1 AND player_id = $2 AND request_id = $3
        `,
        [lease.roomId, playerId, command.requestId],
      );
      const prior = existing.rows[0];
      if (prior !== undefined) {
        const stored = parseStoredResponse(prior.response_snapshot);
        if (stored.requestHash !== hash) {
          throw new CommandIdempotencyConflictError("Command request ID was reused with different content");
        }
        return { acknowledgement: stored.acknowledgement, duplicate: true };
      }

    const digest = checkpointChecksum(value.serializedState);
      const checkpoint = await client.query(
        `
          UPDATE realtime.room_checkpoints
          SET state_version = $4, checksum = $5, private_state = $6,
              updated_at = COALESCE($7::timestamptz, clock_timestamp())
          WHERE room_id = $1 AND game_session_id = $2 AND fencing_token = $3
            AND state_version = $8
        `,
        [
          lease.roomId,
          lease.gameId,
          lease.fencingToken.toString(),
          value.stateVersion,
          digest,
          { serialized: value.serializedState },
          now ?? null,
          command.expectedStateVersion,
        ],
      );
      if (checkpoint.rowCount !== 1) {
        const concurrentlyCommitted = await client.query<StoredCommandRow>(
          `
            SELECT response_snapshot FROM realtime.room_commands
            WHERE room_id = $1 AND player_id = $2 AND request_id = $3
          `,
          [lease.roomId, playerId, command.requestId],
        );
        const concurrent = concurrentlyCommitted.rows[0];
        if (concurrent === undefined) throw new CommandCommitConflictError("Checkpoint revision is stale");
        const stored = parseStoredResponse(concurrent.response_snapshot);
        if (stored.requestHash !== hash) {
          throw new CommandIdempotencyConflictError("Command request ID was reused with different content");
        }
        return { acknowledgement: stored.acknowledgement, duplicate: true };
      }

      for (const event of events) {
        await client.query(
          `
            INSERT INTO realtime.room_events
              (event_id, room_id, state_version, event_type, public_payload, occurred_at)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, clock_timestamp()))
          `,
          [event.eventId, lease.roomId, event.stateVersion, event.payload.type, event, now ?? null],
        );
      }
      if (value.terminalProof !== undefined) {
        const winnerPlayerId = PlayerIdSchema.parse(value.terminalProof.winnerPlayerId);
        await client.query(
          `
            INSERT INTO realtime.terminal_proofs
              (game_session_id, room_id, state_version, checkpoint_checksum,
               winner_player_id, end_reason, committed_at)
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, clock_timestamp()))
          `,
          [
            lease.gameId,
            lease.roomId,
            value.stateVersion,
            digest,
            winnerPlayerId,
            value.terminalProof.endReason,
            now ?? null,
          ],
        );
      }
      await client.query(
        `
          INSERT INTO realtime.room_commands
            (room_id, player_id, request_id, expected_state_version,
             committed_state_version, response_snapshot, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, clock_timestamp()))
        `,
        [
          lease.roomId,
          playerId,
          command.requestId,
          command.expectedStateVersion,
          value.stateVersion,
          { requestHash: hash, acknowledgement },
          now ?? null,
        ],
      );
      await this.hooks.beforeCommit?.();
      return { acknowledgement, duplicate: false };
    });
    if (!result.duplicate) await this.hooks.afterCommit?.();
    return result;
  }
}
