import { z } from "zod";

import { RequestIdSchema, StateVersionSchema } from "./primitives";

export const GameErrorCodeSchema = z.enum([
  "INVALID_COMMAND",
  "INVALID_STATE",
  "STALE_STATE_VERSION",
  "GAME_NOT_FOUND",
  "GAME_ALREADY_EXISTS",
  "GAME_NOT_WAITING",
  "MINIMUM_PLAYERS_NOT_MET",
  "UNAUTHORIZED_ACTOR",
  "PLAYER_ALREADY_JOINED",
  "PLAYER_NOT_FOUND",
  "GAME_FULL",
  "CREATOR_CANNOT_LEAVE",
  "COMMAND_UNSUPPORTED",
]);

const safeDetailKey = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (key) => !/(authorization|token|ticket|secret|stack|rng|seed|private)/i.test(key),
    "sensitive detail keys are forbidden",
  );

export const ErrorDetailsSchema = z.record(
  safeDetailKey,
  z.union([z.string().max(256), z.number().finite(), z.boolean(), z.null()]),
);

export const ApiErrorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: GameErrorCodeSchema,
    message: z.string().min(1).max(256),
    requestId: RequestIdSchema,
    details: ErrorDetailsSchema.optional(),
  }),
});

export const CommandRejectionSchema = z.strictObject({
  type: z.literal("command.reject"),
  requestId: RequestIdSchema,
  stateVersion: StateVersionSchema,
  code: GameErrorCodeSchema,
  message: z.string().min(1).max(256),
  retryable: z.boolean(),
});

export type GameErrorCode = z.infer<typeof GameErrorCodeSchema>;
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
export type CommandRejection = z.infer<typeof CommandRejectionSchema>;
