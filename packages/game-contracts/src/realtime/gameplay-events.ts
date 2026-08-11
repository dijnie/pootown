import { z } from "zod";

import {
  EpochMillisecondsSchema,
  EventIdSchema,
  GameIdSchema,
  InMatchCashStringSchema,
  PlayerIdSchema,
  StateVersionSchema,
} from "../primitives";
import {
  BoardPositionSchema,
  BuildingTypeSchema,
  CardDeckSchema,
  DiceResultSchema,
  GameEndReasonSchema,
  TaxKindSchema,
  TerminalRankingEntrySchema,
  TradeIdSchema,
} from "../state/gameplay-state";

const playerAndPosition = {
  playerId: PlayerIdSchema,
  position: BoardPositionSchema,
};

const cardDrawnEvent = z
  .strictObject({
    type: z.literal("cardDrawn"),
    playerId: PlayerIdSchema,
    deck: CardDeckSchema,
    cardId: z.number().int().min(1).max(5),
    effect: z.enum([
      "money",
      "move",
      "getOutOfJailFree",
      "collectFromPlayers",
      "moveToNearest",
      "repairFree",
    ]),
  })
  .superRefine((event, context) => {
    const effects = event.deck === "chance"
      ? (["moveToNearest", "money", "money", "move", "getOutOfJailFree"] as const)
      : (["collectFromPlayers", "money", "move", "repairFree", "money"] as const);
    if (event.effect !== effects[event.cardId - 1]) {
      context.addIssue({ code: "custom", message: "card effect must match the frozen deck and card ID" });
    }
  });

const tradeCreatedEvent = z
  .strictObject({
    type: z.literal("tradeCreated"),
    tradeId: TradeIdSchema,
    tradeType: z.enum(["moneyOnly", "propertyOnly", "moneyForProperty", "propertyForMoney"]),
    proposerId: PlayerIdSchema,
    receiverId: PlayerIdSchema,
    offeredCash: InMatchCashStringSchema,
    requestedCash: InMatchCashStringSchema,
    offeredPropertyPosition: BoardPositionSchema.nullable(),
    requestedPropertyPosition: BoardPositionSchema.nullable(),
    expiresAtMs: EpochMillisecondsSchema,
  })
  .superRefine((event, context) => {
    const validShape =
      (event.tradeType === "moneyOnly" &&
        event.offeredPropertyPosition === null &&
        event.requestedPropertyPosition === null &&
        (event.offeredCash !== "0" || event.requestedCash !== "0")) ||
      (event.tradeType === "propertyOnly" &&
        event.offeredCash === "0" &&
        event.requestedCash === "0" &&
        (event.offeredPropertyPosition !== null || event.requestedPropertyPosition !== null)) ||
      (event.tradeType === "moneyForProperty" &&
        event.offeredCash !== "0" &&
        event.requestedCash === "0" &&
        event.offeredPropertyPosition === null &&
        event.requestedPropertyPosition !== null) ||
      (event.tradeType === "propertyForMoney" &&
        event.offeredCash === "0" &&
        event.requestedCash !== "0" &&
        event.offeredPropertyPosition !== null &&
        event.requestedPropertyPosition === null);
    if (!validShape) {
      context.addIssue({ code: "custom", message: "trade terms must match the frozen trade type" });
    }
  });

const gameplayEventPayloads = [
  z.strictObject({ type: z.literal("diceRolled"), playerId: PlayerIdSchema, dice: DiceResultSchema }),
  z.strictObject({
    type: z.literal("playerMoved"),
    playerId: PlayerIdSchema,
    fromPosition: BoardPositionSchema,
    toPosition: BoardPositionSchema,
    passedGo: z.boolean(),
    salaryCollected: InMatchCashStringSchema,
  }),
  z.strictObject({
    type: z.literal("propertyPurchased"),
    ...playerAndPosition,
    price: InMatchCashStringSchema,
  }),
  z.strictObject({
    type: z.literal("propertyDeclined"),
    ...playerAndPosition,
    price: InMatchCashStringSchema,
  }),
  z.strictObject({
    type: z.literal("rentPaid"),
    payerId: PlayerIdSchema,
    ownerId: PlayerIdSchema,
    position: BoardPositionSchema,
    amount: InMatchCashStringSchema,
  }),
  z.strictObject({
    type: z.literal("buildingBuilt"),
    ...playerAndPosition,
    buildingType: BuildingTypeSchema,
    houseCount: z.number().int().min(0).max(4),
    cost: InMatchCashStringSchema,
  }),
  z.strictObject({
    type: z.literal("buildingSold"),
    ...playerAndPosition,
    buildingType: BuildingTypeSchema,
    salePrice: InMatchCashStringSchema,
  }),
  cardDrawnEvent,
  z.strictObject({
    type: z.literal("jailEntered"),
    playerId: PlayerIdSchema,
    reason: z.enum(["space", "threeDoubles"]),
  }),
  z.strictObject({
    type: z.literal("jailExited"),
    playerId: PlayerIdSchema,
    method: z.enum(["doubles", "fine", "card"]),
  }),
  z.strictObject({
    type: z.literal("taxPaid"),
    ...playerAndPosition,
    taxKind: TaxKindSchema,
    amount: InMatchCashStringSchema,
  }),
  tradeCreatedEvent,
  z.strictObject({
    type: z.literal("tradeAccepted"),
    tradeId: TradeIdSchema,
    proposerId: PlayerIdSchema,
    receiverId: PlayerIdSchema,
  }),
  z.strictObject({ type: z.literal("tradeRejected"), tradeId: TradeIdSchema, rejecterId: PlayerIdSchema }),
  z.strictObject({ type: z.literal("tradeCancelled"), tradeId: TradeIdSchema, cancellerId: PlayerIdSchema }),
  z.strictObject({ type: z.literal("tradeExpired"), tradeId: TradeIdSchema }),
  z.strictObject({
    type: z.literal("playerBankrupt"),
    playerId: PlayerIdSchema,
    creditorId: PlayerIdSchema.nullable(),
    liquidationValue: InMatchCashStringSchema,
    cashTransferred: InMatchCashStringSchema,
  }),
  z.strictObject({
    type: z.literal("timeoutWarning"),
    playerId: PlayerIdSchema,
    remainingSeconds: z.union([z.literal(30), z.literal(10)]),
  }),
  z.strictObject({
    type: z.literal("timeoutPenalty"),
    playerId: PlayerIdSchema,
    missedTurns: z.number().int().min(1).max(3),
  }),
  z.strictObject({
    type: z.literal("forcedTurnEnd"),
    timedOutPlayerId: PlayerIdSchema,
    nextPlayerId: PlayerIdSchema,
  }),
  z.strictObject({
    type: z.literal("timeoutForfeit"),
    playerId: PlayerIdSchema,
    totalMissedTurns: z.literal(3),
  }),
  z.strictObject({
    type: z.literal("gameEnded"),
    reason: GameEndReasonSchema,
    winnerId: PlayerIdSchema,
    ranking: z.array(TerminalRankingEntrySchema).min(1).max(4),
  }),
  z.strictObject({
    type: z.literal("settlementEntitled"),
    winnerId: PlayerIdSchema,
    reason: GameEndReasonSchema,
    entitlementKey: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
  }),
] as const;

export const GameplayEventPayloadSchema = z.discriminatedUnion("type", gameplayEventPayloads);

export const GameplayDomainEventEnvelopeSchema = z.strictObject({
  type: z.literal("domain.event"),
  eventId: EventIdSchema,
  gameId: GameIdSchema,
  stateVersion: StateVersionSchema,
  occurredAtMs: EpochMillisecondsSchema,
  payload: GameplayEventPayloadSchema,
});

export type GameplayEventPayload = z.infer<typeof GameplayEventPayloadSchema>;
export type GameplayDomainEventEnvelope = z.infer<typeof GameplayDomainEventEnvelopeSchema>;
