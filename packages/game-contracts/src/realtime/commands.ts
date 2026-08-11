import { z } from "zod";

import {
  GameIdSchema,
  RequestIdSchema,
  StateVersionSchema,
} from "../primitives";
import { PlayerGameplayCommandSchema } from "./gameplay-commands";

const baseEnvelope = {
  requestId: RequestIdSchema,
  expectedStateVersion: StateVersionSchema,
};

export const CreateGameCommandSchema = z.strictObject({
  ...baseEnvelope,
  type: z.literal("createGame"),
  payload: z.strictObject({
    gameId: GameIdSchema,
    maximumPlayers: z.number().int().min(2).max(4).default(4),
    timeLimitMs: z.number().int().positive().max(86_400_000).nullable().default(null),
  }),
});

export const JoinGameCommandSchema = z.strictObject({
  ...baseEnvelope,
  type: z.literal("joinGame"),
  payload: z.strictObject({}),
});

export const LeaveGameCommandSchema = z.strictObject({
  ...baseEnvelope,
  type: z.literal("leaveGame"),
  payload: z.strictObject({}),
});

export const CancelGameCommandSchema = z.strictObject({
  ...baseEnvelope,
  type: z.literal("cancelGame"),
  payload: z.strictObject({}),
});

export const StartGameCommandSchema = z.strictObject({
  ...baseEnvelope,
  type: z.literal("startGame"),
  payload: z.strictObject({}),
});

export const LifecycleRoomCommandSchema = z.discriminatedUnion("type", [
  CreateGameCommandSchema,
  JoinGameCommandSchema,
  LeaveGameCommandSchema,
  CancelGameCommandSchema,
  StartGameCommandSchema,
]);

export const RoomCommandSchema = z.union([LifecycleRoomCommandSchema, PlayerGameplayCommandSchema]);

export type CreateGameCommand = z.infer<typeof CreateGameCommandSchema>;
export type JoinGameCommand = z.infer<typeof JoinGameCommandSchema>;
export type LeaveGameCommand = z.infer<typeof LeaveGameCommandSchema>;
export type CancelGameCommand = z.infer<typeof CancelGameCommandSchema>;
export type StartGameCommand = z.infer<typeof StartGameCommandSchema>;
export type RoomCommand = z.infer<typeof RoomCommandSchema>;
