import { z } from "zod";

import {
  EpochMillisecondsSchema,
  GameIdSchema,
  InMatchCashStringSchema,
  PlayerIdSchema,
  StateVersionSchema,
} from "../primitives";

export const PlayerPublicStateSchema = z.strictObject({
  seatIndex: z.number().int().min(0).max(3),
  playerId: PlayerIdSchema,
  status: z.enum(["active", "eliminated"]),
  cash: InMatchCashStringSchema,
  position: z.number().int().min(0).max(39),
  inJail: z.boolean(),
});

export const TurnStateSchema = z.discriminatedUnion("phase", [
  z.strictObject({ phase: z.literal("notStarted") }),
  z.strictObject({
    phase: z.literal("awaitingRoll"),
    currentSeatIndex: z.number().int().min(0).max(3),
    startedAtMs: EpochMillisecondsSchema,
    deadlineAtMs: EpochMillisecondsSchema,
  }),
  z.strictObject({ phase: z.literal("finished") }),
]);

export const PublicGameStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    stateVersion: StateVersionSchema,
    gameId: GameIdSchema,
    creatorId: PlayerIdSchema,
    lifecycle: z.enum(["waitingForPlayers", "inProgress", "cancelled", "finished"]),
    minimumPlayers: z.literal(2),
    maximumPlayers: z.number().int().min(2).max(4),
    seats: z.array(PlayerPublicStateSchema.nullable()).length(4),
    currentPlayers: z.number().int().min(0).max(4),
    activePlayers: z.number().int().min(0).max(4),
    bankCash: InMatchCashStringSchema,
    housesRemaining: z.number().int().min(0).max(32),
    hotelsRemaining: z.number().int().min(0).max(12),
    createdAtMs: EpochMillisecondsSchema,
    startedAtMs: EpochMillisecondsSchema.nullable(),
    cancelledAtMs: EpochMillisecondsSchema.nullable(),
    gameEndAtMs: EpochMillisecondsSchema.nullable(),
    turn: TurnStateSchema,
  })
  .superRefine((state, context) => {
    const occupiedSeats = state.seats.filter((seat) => seat !== null);
    const activeSeats = occupiedSeats.filter((seat) => seat.status === "active");
    const playerIds = occupiedSeats.map((seat) => seat.playerId);

    if (state.currentPlayers !== occupiedSeats.length) {
      context.addIssue({ code: "custom", message: "currentPlayers must be derived from seats" });
    }
    if (state.activePlayers !== activeSeats.length) {
      context.addIssue({ code: "custom", message: "activePlayers must be derived from seats" });
    }
    if (new Set(playerIds).size !== playerIds.length) {
      context.addIssue({ code: "custom", message: "player IDs must be unique" });
    }
    if (state.seats[0]?.playerId !== state.creatorId) {
      context.addIssue({ code: "custom", message: "creator must occupy seat zero" });
    }
    state.seats.forEach((seat, index) => {
      if (seat !== null && seat.seatIndex !== index) {
        context.addIssue({ code: "custom", message: "seatIndex must match its stable slot" });
      }
      if (index >= state.maximumPlayers && seat !== null) {
        context.addIssue({ code: "custom", message: "seats outside configured capacity must be empty" });
      }
    });

    const lifecycleIsConsistent =
      (state.lifecycle === "waitingForPlayers" &&
        state.turn.phase === "notStarted" &&
        state.startedAtMs === null &&
        state.cancelledAtMs === null &&
        state.gameEndAtMs === null) ||
      (state.lifecycle === "inProgress" &&
        state.turn.phase === "awaitingRoll" &&
        state.startedAtMs !== null &&
        state.cancelledAtMs === null) ||
      (state.lifecycle === "cancelled" &&
        state.turn.phase === "finished" &&
        state.startedAtMs === null &&
        state.cancelledAtMs !== null &&
        state.gameEndAtMs === null) ||
      (state.lifecycle === "finished" &&
        state.turn.phase === "finished" &&
        state.startedAtMs !== null &&
        state.cancelledAtMs === null &&
        state.gameEndAtMs !== null);
    if (!lifecycleIsConsistent) {
      context.addIssue({ code: "custom", message: "lifecycle timestamps and turn phase are inconsistent" });
    }
    if (
      state.turn.phase === "awaitingRoll" &&
      (state.turn.deadlineAtMs < state.turn.startedAtMs ||
        state.startedAtMs === null ||
        state.turn.startedAtMs < state.startedAtMs)
    ) {
      context.addIssue({ code: "custom", message: "turn deadlines are inconsistent" });
    }
    if (state.lifecycle === "inProgress" && state.turn.phase === "awaitingRoll") {
      if (occupiedSeats.length < state.minimumPlayers) {
        context.addIssue({ code: "custom", message: "active games require at least two players" });
      }
      const currentSeat = state.seats[state.turn.currentSeatIndex];
      if (currentSeat === null || currentSeat === undefined || currentSeat.status !== "active") {
        context.addIssue({ code: "custom", message: "current turn must reference an active occupied seat" });
      }
    }
    if (state.startedAtMs !== null && state.startedAtMs < state.createdAtMs) {
      context.addIssue({ code: "custom", message: "game start predates creation" });
    }
    if (state.cancelledAtMs !== null && state.cancelledAtMs < state.createdAtMs) {
      context.addIssue({ code: "custom", message: "game cancellation predates creation" });
    }
    if (
      state.gameEndAtMs !== null &&
      state.startedAtMs !== null &&
      state.gameEndAtMs < state.startedAtMs
    ) {
      context.addIssue({ code: "custom", message: "game end predates start" });
    }
  });

export const PlayerPrivateViewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  gameId: GameIdSchema,
  playerId: PlayerIdSchema,
  reconnectDeadlineAtMs: EpochMillisecondsSchema.nullable(),
});

export type PlayerPublicState = z.infer<typeof PlayerPublicStateSchema>;
export type TurnState = z.infer<typeof TurnStateSchema>;
export type PublicGameState = z.infer<typeof PublicGameStateSchema>;
export type PlayerPrivateView = z.infer<typeof PlayerPrivateViewSchema>;
