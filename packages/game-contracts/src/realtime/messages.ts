import { z } from "zod";

import { CommandRejectionSchema, GameErrorCodeSchema } from "../errors";
import {
  EpochMillisecondsSchema,
  EventIdSchema,
  PlayerIdSchema,
  RequestIdSchema,
  StateVersionSchema,
} from "../primitives";
import { GameplayDomainEventEnvelopeSchema } from "./gameplay-events";
import { PlayerPrivateViewSchema } from "../state/game-state";

export const CommandAcknowledgementSchema = z.strictObject({
  type: z.literal("command.ack"),
  requestId: RequestIdSchema,
  stateVersion: StateVersionSchema,
  eventIds: z.array(EventIdSchema).max(32),
});

const lifecycleEventPayloads = [
  z.strictObject({ type: z.literal("gameCreated"), creatorId: PlayerIdSchema }),
  z.strictObject({
    type: z.literal("playerJoined"),
    playerId: PlayerIdSchema,
    seatIndex: z.number().int().min(0).max(3),
    totalPlayers: z.number().int().min(1).max(4),
  }),
  z.strictObject({
    type: z.literal("playerLeft"),
    playerId: PlayerIdSchema,
    seatIndex: z.number().int().min(0).max(3),
    remainingPlayers: z.number().int().min(1).max(3),
  }),
  z.strictObject({ type: z.literal("gameStarted"), totalPlayers: z.number().int().min(2).max(4) }),
  z.strictObject({ type: z.literal("gameCancelled"), playersCount: z.number().int().min(1).max(4) }),
] as const;

export const LifecycleEventPayloadSchema = z.discriminatedUnion("type", lifecycleEventPayloads);

export const DomainEventEnvelopeSchema = z.strictObject({
  type: z.literal("domain.event"),
  eventId: EventIdSchema,
  stateVersion: StateVersionSchema,
  occurredAtMs: EpochMillisecondsSchema,
  payload: LifecycleEventPayloadSchema,
});

export const SessionStatusSchema = z.strictObject({
  type: z.literal("session.status"),
  status: z.enum(["connecting", "connected", "reconnecting", "closed"]),
  reason: z.string().min(1).max(128).optional(),
});

export const ClockSyncSchema = z.strictObject({
  type: z.literal("clock.sync"),
  serverTimeMs: EpochMillisecondsSchema,
  deadlineAtMs: EpochMillisecondsSchema.nullable(),
  stateVersion: StateVersionSchema,
});

export const AuthStatusSchema = z.strictObject({
  type: z.enum(["auth.expiring", "auth.revoked"]),
});

export const PlayerPrivateStateMessageSchema = z.strictObject({
  type: z.literal("player.private"),
  view: PlayerPrivateViewSchema,
});

export const PlayerPrivateStateRequestSchema = z.strictObject({});

export const ServerMessageSchema = z.union([
  CommandAcknowledgementSchema,
  CommandRejectionSchema,
  DomainEventEnvelopeSchema,
  GameplayDomainEventEnvelopeSchema,
  SessionStatusSchema,
  ClockSyncSchema,
  AuthStatusSchema,
  PlayerPrivateStateMessageSchema,
]);

export type CommandAcknowledgement = z.infer<typeof CommandAcknowledgementSchema>;
export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelopeSchema>;
export type LifecycleEventPayload = z.infer<typeof LifecycleEventPayloadSchema>;
export type PlayerPrivateStateMessage = z.infer<typeof PlayerPrivateStateMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export { GameErrorCodeSchema };
