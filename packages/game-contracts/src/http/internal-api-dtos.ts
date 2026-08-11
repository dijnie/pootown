import { z } from "zod";

import {
  MutationHeadersSchema,
  OperationResponseSchema,
} from "./api-dtos";
import {
  ContractVersionSchema,
  GameIdSchema,
  PlayerIdSchema,
  RealtimeTicketSchema,
  ReservationIdSchema,
  RoomIdSchema,
  StateVersionSchema,
  UserIdSchema,
} from "../primitives";

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
  stateVersion: StateVersionSchema,
});

export const SettlementRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  roomId: RoomIdSchema,
  terminalStateVersion: StateVersionSchema,
  checkpointChecksum: sha256Hex,
});

export const AbortSessionRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  reason: z.enum(["reconnectWindowExpired", "operatorDecision"]),
});

export const InternalMutationContractSchemas = {
  consumeTicket: { headers: MutationHeadersSchema, body: TicketConsumeRequestSchema },
  markStarted: { headers: MutationHeadersSchema, body: SessionStartedRequestSchema },
  settleSession: { headers: MutationHeadersSchema, body: SettlementRequestSchema },
  abortSession: { headers: MutationHeadersSchema, body: AbortSessionRequestSchema },
} as const;

export type TicketConsumeRequest = z.infer<typeof TicketConsumeRequestSchema>;
export type TicketConsumeResponse = z.infer<typeof TicketConsumeResponseSchema>;
export type SettlementRequest = z.infer<typeof SettlementRequestSchema>;
export type InternalOperationResponse = z.infer<typeof OperationResponseSchema>;
