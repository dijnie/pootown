import { z } from "zod";

const opaqueId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "must be an opaque identifier");

export const CONTRACT_VERSION = 1 as const;
export const ContractVersionSchema = z.literal(CONTRACT_VERSION);
export const GameIdSchema = opaqueId.brand<"GameId">();
export const GameDefinitionIdSchema = opaqueId.brand<"GameDefinitionId">();
export const PlayerIdSchema = opaqueId.brand<"PlayerId">();
export const UserIdSchema = opaqueId.brand<"UserId">();
export const RoomIdSchema = opaqueId.brand<"RoomId">();
export const EventIdSchema = opaqueId.brand<"EventId">();
export const OperationIdSchema = opaqueId.brand<"OperationId">();
export const ReservationIdSchema = opaqueId.brand<"ReservationId">();
export const RequestIdSchema = z.uuid().brand<"RequestId">();
export const StateVersionSchema = z.number().int().nonnegative().max(2_147_483_647);
export const EpochMillisecondsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const unsignedDecimal = z
  .string()
  .min(1)
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/, "must be a canonical unsigned decimal string");

export const AccountCoinStringSchema = unsignedDecimal.brand<"AccountCoinString">();
export const InMatchCashStringSchema = unsignedDecimal.brand<"InMatchCashString">();
export const IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "must be an opaque idempotency key")
  .brand<"IdempotencyKey">();
export const RealtimeTicketSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/,
    "must be a canonical unpadded 256-bit base64url ticket",
  )
  .brand<"RealtimeTicket">();

export const CursorPaginationSchema = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type ContractVersion = z.infer<typeof ContractVersionSchema>;
export type GameId = z.infer<typeof GameIdSchema>;
export type GameDefinitionId = z.infer<typeof GameDefinitionIdSchema>;
export type PlayerId = z.infer<typeof PlayerIdSchema>;
export type UserId = z.infer<typeof UserIdSchema>;
export type RoomId = z.infer<typeof RoomIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
export type OperationId = z.infer<typeof OperationIdSchema>;
export type ReservationId = z.infer<typeof ReservationIdSchema>;
export type RequestId = z.infer<typeof RequestIdSchema>;
export type AccountCoinString = z.infer<typeof AccountCoinStringSchema>;
export type InMatchCashString = z.infer<typeof InMatchCashStringSchema>;
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
export type RealtimeTicket = z.infer<typeof RealtimeTicketSchema>;
export type CursorPagination = z.infer<typeof CursorPaginationSchema>;
