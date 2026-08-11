import { z } from "zod";

import {
  AccountCoinStringSchema,
  CONTRACT_VERSION,
  ContractVersionSchema,
  CursorPaginationSchema,
  EpochMillisecondsSchema,
  GameDefinitionIdSchema,
  GameIdSchema,
  IdempotencyKeySchema,
  OperationIdSchema,
  PlayerIdSchema,
  RealtimeTicketSchema,
  RequestIdSchema,
  ReservationIdSchema,
  RoomIdSchema,
  StateVersionSchema,
  UserIdSchema,
} from "../primitives";

const boundedLabel = z.string().min(1).max(80);
const signedAccountCoinDelta = z
  .string()
  .min(1)
  .max(79)
  .regex(/^(0|[1-9][0-9]{0,77}|-[1-9][0-9]{0,77})$/);

export const ContractHeadersSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
});

export const MutationHeadersSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  idempotencyKey: IdempotencyKeySchema,
});

export const UserViewSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  userId: UserIdSchema,
  createdAtMs: EpochMillisecondsSchema,
  lastSeenAtMs: EpochMillisecondsSchema,
});

export const CoinBalanceResponseSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  availableCoin: AccountCoinStringSchema,
  reservedCoin: AccountCoinStringSchema,
  version: StateVersionSchema,
});

export const CoinOperationViewSchema = z.strictObject({
  operationId: OperationIdSchema,
  kind: z.enum(["initialGrant", "rescueGrant", "reserve", "release", "capture", "payout"]),
  availableDelta: signedAccountCoinDelta,
  reservedDelta: signedAccountCoinDelta,
  createdAtMs: EpochMillisecondsSchema,
});

export const CoinOperationsResponseSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  items: z.array(CoinOperationViewSchema).max(100),
  nextCursor: z.string().min(1).max(512).nullable(),
});

export const GameDefinitionViewSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  gameDefinitionId: GameDefinitionIdSchema,
  displayName: boundedLabel,
  maximumPlayers: z.number().int().min(2).max(4),
  entryCoin: AccountCoinStringSchema,
  timeLimitMs: z.number().int().positive().max(86_400_000).nullable(),
  policyVersion: z.number().int().positive().max(2_147_483_647),
});

export const SessionLifecycleSchema = z.enum([
  "open",
  "cancelling",
  "cancelled",
  "active",
  "settling",
  "settled",
  "recoveryRequired",
]);

export const SessionViewSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  gameId: GameIdSchema,
  gameDefinitionId: GameDefinitionIdSchema,
  roomId: RoomIdSchema,
  lifecycle: SessionLifecycleSchema,
  currentPlayers: z.number().int().min(0).max(4),
  maximumPlayers: z.number().int().min(2).max(4),
  entryCoin: AccountCoinStringSchema,
  createdAtMs: EpochMillisecondsSchema,
  startedAtMs: EpochMillisecondsSchema.nullable(),
  finishedAtMs: EpochMillisecondsSchema.nullable(),
});

export const SessionDetailSchema = SessionViewSchema.extend({
  players: z.array(z.strictObject({ playerId: PlayerIdSchema, seatIndex: z.number().int().min(0).max(3) })).max(4),
})
  .strict()
  .superRefine((session, context) => {
    if (session.currentPlayers !== session.players.length) {
      context.addIssue({ code: "custom", path: ["currentPlayers"], message: "must match players length" });
    }
    const playerIds = new Set(session.players.map((player) => player.playerId));
    if (playerIds.size !== session.players.length) {
      context.addIssue({ code: "custom", path: ["players"], message: "player IDs must be unique" });
    }
    const seats = new Set(session.players.map((player) => player.seatIndex));
    if (seats.size !== session.players.length) {
      context.addIssue({ code: "custom", path: ["players"], message: "seat indexes must be unique" });
    }
    if (session.players.some((player) => player.seatIndex >= session.maximumPlayers)) {
      context.addIssue({ code: "custom", path: ["players"], message: "seat exceeds session capacity" });
    }
  });

export const SessionListRequestSchema = CursorPaginationSchema;

export const SessionListResponseSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  items: z.array(SessionViewSchema).max(100),
  nextCursor: z.string().min(1).max(512).nullable(),
});

export const TicketGrantSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  gameId: GameIdSchema,
  roomId: RoomIdSchema,
  reservationId: ReservationIdSchema,
  playerId: PlayerIdSchema,
  role: z.literal("player"),
  ticket: RealtimeTicketSchema,
  expiresAtMs: EpochMillisecondsSchema,
});

export const AdmissionResponseSchema = z
  .strictObject({
    contractVersion: ContractVersionSchema,
    session: SessionDetailSchema,
    admission: TicketGrantSchema,
  })
  .superRefine((response, context) => {
    if (response.session.gameId !== response.admission.gameId) {
      context.addIssue({ code: "custom", path: ["admission", "gameId"], message: "must match session" });
    }
    if (response.session.roomId !== response.admission.roomId) {
      context.addIssue({ code: "custom", path: ["admission", "roomId"], message: "must match session" });
    }
    if (!response.session.players.some((player) => player.playerId === response.admission.playerId)) {
      context.addIssue({ code: "custom", path: ["admission", "playerId"], message: "must be seated" });
    }
  });

export const CreateSessionRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  gameDefinitionId: GameDefinitionIdSchema,
});

export const JoinIntentRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
});

export const ReleaseJoinIntentRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
});

export const ReconnectTicketRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
});

export const PublicMutationContractSchemas = {
  createSession: { headers: MutationHeadersSchema, body: CreateSessionRequestSchema },
  joinIntent: { headers: MutationHeadersSchema, body: JoinIntentRequestSchema },
  releaseJoinIntent: { headers: MutationHeadersSchema, body: ReleaseJoinIntentRequestSchema },
  reconnectTicket: { headers: MutationHeadersSchema, body: ReconnectTicketRequestSchema },
} as const;

export const LeaderboardEntrySchema = z.strictObject({
  rank: z.number().int().positive().max(10_000_000),
  playerId: PlayerIdSchema,
  displayName: boundedLabel.nullable(),
  gamesPlayed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  gamesWon: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  accountCoinWon: AccountCoinStringSchema,
});

export const LeaderboardResponseSchema = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({
    data: z.array(LeaderboardEntrySchema).max(100),
    pagination: z.strictObject({
      page: z.number().int().positive(),
      limit: z.number().int().min(1).max(100),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    }),
  }),
  requestId: RequestIdSchema,
  timestamp: EpochMillisecondsSchema,
});

export const SessionHistoryEntrySchema = z.strictObject({
  gameId: GameIdSchema,
  playerId: PlayerIdSchema,
  result: z.enum(["won", "lost", "cancelled", "aborted"]),
  accountCoinDelta: signedAccountCoinDelta,
  finishedAtMs: EpochMillisecondsSchema,
});

export const SessionHistoryResponseSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  items: z.array(SessionHistoryEntrySchema).max(100),
  nextCursor: z.string().min(1).max(512).nullable(),
});

export const OperationResponseSchema = z.strictObject({
  contractVersion: z.literal(CONTRACT_VERSION),
  operationId: OperationIdSchema,
  committed: z.literal(true),
});

export const LiveHealthResponseSchema = z.strictObject({ status: z.literal("ok") });
export const ReadyHealthResponseSchema = z.strictObject({
  status: z.enum(["ready", "notReady"]),
  database: z.enum(["up", "down", "migrationsPending"]),
});

export type MutationHeaders = z.infer<typeof MutationHeadersSchema>;
export type UserView = z.infer<typeof UserViewSchema>;
export type CoinBalanceResponse = z.infer<typeof CoinBalanceResponseSchema>;
export type GameDefinitionView = z.infer<typeof GameDefinitionViewSchema>;
export type SessionView = z.infer<typeof SessionViewSchema>;
export type SessionDetail = z.infer<typeof SessionDetailSchema>;
export type TicketGrant = z.infer<typeof TicketGrantSchema>;
export type AdmissionResponse = z.infer<typeof AdmissionResponseSchema>;
