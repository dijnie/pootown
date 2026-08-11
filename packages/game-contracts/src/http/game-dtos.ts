import { z } from "zod";

import {
  AccountCoinStringSchema,
  ContractVersionSchema,
  CursorPaginationSchema,
  EpochMillisecondsSchema,
  GameDefinitionIdSchema,
  GameIdSchema,
  RoomIdSchema,
} from "../primitives";

export const CreateGameRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  gameDefinitionId: GameDefinitionIdSchema,
});

export const AccountCoinViewSchema = z.strictObject({
  availableCoin: AccountCoinStringSchema,
  reservedCoin: AccountCoinStringSchema,
});

export const JoinGameRequestSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  gameId: GameIdSchema,
});

export const GameSummarySchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  gameId: GameIdSchema,
  roomId: RoomIdSchema,
  lifecycle: z.enum(["waitingForPlayers", "inProgress", "cancelled", "finished"]),
  currentPlayers: z.number().int().min(0).max(4),
  maximumPlayers: z.number().int().min(2).max(4),
  entryCoin: AccountCoinStringSchema,
  createdAtMs: EpochMillisecondsSchema,
});

export const ListGamesRequestSchema = CursorPaginationSchema;

export const ListGamesResponseSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  items: z.array(GameSummarySchema).max(100),
  nextCursor: z.string().min(1).max(512).nullable(),
});

export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>;
export type AccountCoinView = z.infer<typeof AccountCoinViewSchema>;
export type JoinGameRequest = z.infer<typeof JoinGameRequestSchema>;
export type GameSummary = z.infer<typeof GameSummarySchema>;
export type ListGamesRequest = z.infer<typeof ListGamesRequestSchema>;
export type ListGamesResponse = z.infer<typeof ListGamesResponseSchema>;
