import { z } from "zod";

import {
  MutationHeadersSchema,
  OperationResponseSchema,
} from "./api-dtos";
import {
  ContractVersionSchema,
  EpochMillisecondsSchema,
  GameDefinitionIdSchema,
  GameIdSchema,
  PlayerIdSchema,
  RealtimeTicketSchema,
  ReservationIdSchema,
  RoomIdSchema,
  StateVersionSchema,
  UserIdSchema,
} from "../primitives";
import { GameplayRulesetIdSchema } from "../state/gameplay-state";

const sha256Hex = z.string().length(64).regex(/^[a-f0-9]{64}$/);

export const TicketConsumeRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  ticket: RealtimeTicketSchema,
  gameId: GameIdSchema,
  roomId: RoomIdSchema,
  roomInstanceId: z.string().min(1).max(128),
});

export const TicketConsumeResponseSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  userId: UserIdSchema,
  gameId: GameIdSchema,
  roomId: RoomIdSchema,
  reservationId: ReservationIdSchema,
  playerId: PlayerIdSchema,
  seatIndex: z.number().int().min(0).max(3),
  role: z.literal("player"),
  reused: z.boolean(),
});

export const SessionStartedRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  roomId: RoomIdSchema,
  stateVersion: StateVersionSchema.refine((value) => value > 0, "must be positive"),
});

export const SettlementRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  roomId: RoomIdSchema,
  terminalStateVersion: StateVersionSchema.refine((value) => value > 0, "must be positive"),
  checkpointChecksum: sha256Hex,
});

export const AbortSessionRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  reason: z.enum(["reconnectWindowExpired", "operatorDecision"]),
});

export const RoomSessionFinalizationRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  roomId: RoomIdSchema,
  playerId: PlayerIdSchema,
  reservationId: ReservationIdSchema,
  action: z.enum(["leave", "cancel"]),
});

const BootstrapPlayerSchema = z.strictObject({
  playerId: PlayerIdSchema,
  seatIndex: z.number().int().min(0).max(3),
  joinedAtMs: EpochMillisecondsSchema,
});

export const SessionBootstrapResponseSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  gameId: GameIdSchema,
  gameDefinitionId: GameDefinitionIdSchema,
  gameDefinitionVersion: z.number().int().positive().max(2_147_483_647),
  rulesetId: GameplayRulesetIdSchema,
  roomId: RoomIdSchema,
  lifecycle: z.enum(["open", "active", "settling", "settled", "recoveryRequired"]),
  stateVersion: StateVersionSchema,
  creatorPlayerId: PlayerIdSchema,
  maximumPlayers: z.number().int().min(2).max(4),
  timeLimitMs: z.number().int().positive().max(86_400_000).nullable(),
  createdAtMs: EpochMillisecondsSchema,
  startedAtMs: EpochMillisecondsSchema.nullable(),
  players: z.array(BootstrapPlayerSchema).min(1).max(4),
}).superRefine((session, context) => {
  const playerIds = new Set(session.players.map((player) => player.playerId));
  const seats = new Set(session.players.map((player) => player.seatIndex));
  if (playerIds.size !== session.players.length) {
    context.addIssue({ code: "custom", path: ["players"], message: "player IDs must be unique" });
  }
  if (seats.size !== session.players.length) {
    context.addIssue({ code: "custom", path: ["players"], message: "seat indexes must be unique" });
  }
  if (session.players.some((player) => player.seatIndex >= session.maximumPlayers)) {
    context.addIssue({ code: "custom", path: ["players"], message: "seat exceeds session capacity" });
  }
  if (session.players.some((player) => player.joinedAtMs < session.createdAtMs)) {
    context.addIssue({ code: "custom", path: ["players"], message: "join time predates session" });
  }
  if (!session.players.some((player) => player.seatIndex === 0 && player.playerId === session.creatorPlayerId)) {
    context.addIssue({ code: "custom", path: ["creatorPlayerId"], message: "creator must occupy seat zero" });
  }
  if (session.lifecycle === "open" && (session.stateVersion !== 0 || session.startedAtMs !== null)) {
    context.addIssue({ code: "custom", path: ["lifecycle"], message: "open session cannot be started" });
  }
  if (["active", "settling", "settled", "recoveryRequired"].includes(session.lifecycle) &&
      (session.stateVersion === 0 || session.startedAtMs === null)) {
    context.addIssue({ code: "custom", path: ["lifecycle"], message: "started session requires state metadata" });
  }
  if (["active", "settling", "settled", "recoveryRequired"].includes(session.lifecycle) &&
      session.players.length < 2) {
    context.addIssue({ code: "custom", path: ["players"], message: "started session requires at least two players" });
  }
  if (session.startedAtMs !== null && (
    session.startedAtMs < session.createdAtMs ||
    session.players.some((player) => player.joinedAtMs > (session.startedAtMs as number))
  )) {
    context.addIssue({ code: "custom", path: ["startedAtMs"], message: "start time must follow every admission" });
  }
});

export const ReconciliationRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
});

export const ReconciliationResponseSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  waitingSessionsCancelled: z.number().int().nonnegative(),
  expiredAdmissionsReleased: z.number().int().nonnegative(),
  terminalSettlementsCommitted: z.number().int().nonnegative(),
  roomCommandsFinalized: z.number().int().nonnegative(),
  offlineSessionsAborted: z.number().int().nonnegative(),
  sessionsMarkedForRecovery: z.number().int().nonnegative(),
  alreadyRunning: z.boolean(),
});

export const InternalMutationContractSchemas = {
  consumeTicket: { headers: MutationHeadersSchema, body: TicketConsumeRequestSchema },
  markStarted: { headers: MutationHeadersSchema, body: SessionStartedRequestSchema },
  settleSession: { headers: MutationHeadersSchema, body: SettlementRequestSchema },
  abortSession: { headers: MutationHeadersSchema, body: AbortSessionRequestSchema },
  finalizeSessionCommand: { headers: MutationHeadersSchema, body: RoomSessionFinalizationRequestSchema },
  runReconciliation: { headers: MutationHeadersSchema, body: ReconciliationRequestSchema },
} as const;

export type TicketConsumeRequest = z.infer<typeof TicketConsumeRequestSchema>;
export type TicketConsumeResponse = z.infer<typeof TicketConsumeResponseSchema>;
export type SettlementRequest = z.infer<typeof SettlementRequestSchema>;
export type AbortSessionRequest = z.infer<typeof AbortSessionRequestSchema>;
export type RoomSessionFinalizationRequest = z.infer<typeof RoomSessionFinalizationRequestSchema>;
export type SessionBootstrapResponse = z.infer<typeof SessionBootstrapResponseSchema>;
export type ReconciliationResponse = z.infer<typeof ReconciliationResponseSchema>;
export type InternalOperationResponse = z.infer<typeof OperationResponseSchema>;
