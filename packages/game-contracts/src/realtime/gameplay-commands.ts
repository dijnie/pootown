import { z } from "zod";

import { InMatchCashStringSchema, PlayerIdSchema, RequestIdSchema, StateVersionSchema } from "../primitives";
import { BoardPositionSchema, BuildingTypeSchema, TradeIdSchema } from "../state/gameplay-state";

const commandEnvelope = {
  requestId: RequestIdSchema,
  expectedStateVersion: StateVersionSchema,
};

const emptyPlayerCommand = <TType extends string>(type: TType) =>
  z.strictObject({ ...commandEnvelope, type: z.literal(type), payload: z.strictObject({}) });

const positionedPlayerCommand = <TType extends string>(type: TType) =>
  z.strictObject({
    ...commandEnvelope,
    type: z.literal(type),
    payload: z.strictObject({ position: BoardPositionSchema }),
  });

export const RollDiceCommandSchema = emptyPlayerCommand("rollDice");
export const BuyPropertyCommandSchema = positionedPlayerCommand("buyProperty");
export const DeclinePropertyCommandSchema = positionedPlayerCommand("declineProperty");
export const PayRentCommandSchema = positionedPlayerCommand("payRent");
export const EndTurnCommandSchema = emptyPlayerCommand("endTurn");
export const DrawChanceCardCommandSchema = emptyPlayerCommand("drawChanceCard");
export const DrawCommunityChestCardCommandSchema = emptyPlayerCommand("drawCommunityChestCard");
export const PayJailFineCommandSchema = emptyPlayerCommand("payJailFine");
export const UseJailCardCommandSchema = emptyPlayerCommand("useJailCard");
export const BuildHouseCommandSchema = positionedPlayerCommand("buildHouse");
export const BuildHotelCommandSchema = positionedPlayerCommand("buildHotel");
export const PayMevTaxCommandSchema = emptyPlayerCommand("payMevTax");
export const PayPriorityFeeTaxCommandSchema = emptyPlayerCommand("payPriorityFeeTax");
export const DeclareBankruptcyCommandSchema = emptyPlayerCommand("declareBankruptcy");
export const EndGameCommandSchema = emptyPlayerCommand("endGame");

export const SellBuildingCommandSchema = z.strictObject({
  ...commandEnvelope,
  type: z.literal("sellBuilding"),
  payload: z.strictObject({
    position: BoardPositionSchema,
    buildingType: BuildingTypeSchema,
  }),
});

const positiveCash = InMatchCashStringSchema.refine((cash) => cash !== "0", "cash must be positive");

const tradePayload = z.discriminatedUnion("tradeType", [
  z
    .strictObject({
      tradeType: z.literal("moneyOnly"),
      receiverId: PlayerIdSchema,
      offeredCash: InMatchCashStringSchema,
      requestedCash: InMatchCashStringSchema,
    })
    .refine((payload) => payload.offeredCash !== "0" || payload.requestedCash !== "0", "trade cannot be empty"),
  z
    .strictObject({
      tradeType: z.literal("propertyOnly"),
      receiverId: PlayerIdSchema,
      offeredPropertyPosition: BoardPositionSchema.nullable(),
      requestedPropertyPosition: BoardPositionSchema.nullable(),
    })
    .refine(
      (payload) =>
        (payload.offeredPropertyPosition !== null || payload.requestedPropertyPosition !== null) &&
        payload.offeredPropertyPosition !== payload.requestedPropertyPosition,
      "trade must contain at least one distinct property",
    ),
  z.strictObject({
    tradeType: z.literal("moneyForProperty"),
    receiverId: PlayerIdSchema,
    offeredCash: positiveCash,
    requestedPropertyPosition: BoardPositionSchema,
  }),
  z.strictObject({
    tradeType: z.literal("propertyForMoney"),
    receiverId: PlayerIdSchema,
    offeredPropertyPosition: BoardPositionSchema,
    requestedCash: positiveCash,
  }),
]);

export const CreateTradeCommandSchema = z.strictObject({
  ...commandEnvelope,
  type: z.literal("createTrade"),
  payload: tradePayload,
});

const tradeDecisionCommand = <TType extends string>(type: TType) =>
  z.strictObject({
    ...commandEnvelope,
    type: z.literal(type),
    payload: z.strictObject({ tradeId: TradeIdSchema }),
  });

export const AcceptTradeCommandSchema = tradeDecisionCommand("acceptTrade");
export const RejectTradeCommandSchema = tradeDecisionCommand("rejectTrade");
export const CancelTradeCommandSchema = tradeDecisionCommand("cancelTrade");

export const PlayerGameplayCommandSchema = z.discriminatedUnion("type", [
  RollDiceCommandSchema,
  BuyPropertyCommandSchema,
  DeclinePropertyCommandSchema,
  PayRentCommandSchema,
  EndTurnCommandSchema,
  DrawChanceCardCommandSchema,
  DrawCommunityChestCardCommandSchema,
  PayJailFineCommandSchema,
  UseJailCardCommandSchema,
  BuildHouseCommandSchema,
  BuildHotelCommandSchema,
  SellBuildingCommandSchema,
  PayMevTaxCommandSchema,
  PayPriorityFeeTaxCommandSchema,
  DeclareBankruptcyCommandSchema,
  EndGameCommandSchema,
  CreateTradeCommandSchema,
  AcceptTradeCommandSchema,
  RejectTradeCommandSchema,
  CancelTradeCommandSchema,
]);

export type PlayerGameplayCommand = z.infer<typeof PlayerGameplayCommandSchema>;
