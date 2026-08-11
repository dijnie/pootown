import { z } from "zod";

import {
  EpochMillisecondsSchema,
  GameIdSchema,
  InMatchCashStringSchema,
  PlayerIdSchema,
  StateVersionSchema,
} from "../primitives";

export const BoardPositionSchema = z.number().int().min(0).max(39);
export const SeatIndexSchema = z.number().int().min(0).max(3);
export const CardDeckSchema = z.enum(["chance", "communityChest"]);
export const BuildingTypeSchema = z.enum(["house", "hotel"]);
export const TaxKindSchema = z.enum(["mev", "priorityFee"]);
export const GameplayRulesetIdSchema = z.literal("pootown-rust-source-v1");
export const GameEndReasonSchema = z.enum([
  "lastPlayerStanding",
  "timeLimit",
  "manual",
  "timeoutForfeit",
]);

export const TradeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "must be an opaque identifier")
  .brand<"TradeId">();

export const DiceResultSchema = z
  .strictObject({
    dieOne: z.number().int().min(1).max(6),
    dieTwo: z.number().int().min(1).max(6),
    total: z.number().int().min(2).max(12),
    isDoubles: z.boolean(),
  })
  .superRefine((dice, context) => {
    if (dice.total !== dice.dieOne + dice.dieTwo) {
      context.addIssue({ code: "custom", message: "dice total must be derived from both dice" });
    }
    if (dice.isDoubles !== (dice.dieOne === dice.dieTwo)) {
      context.addIssue({ code: "custom", message: "isDoubles must be derived from both dice" });
    }
  });

export const GameplayPlayerPublicStateSchema = z.strictObject({
  seatIndex: SeatIndexSchema,
  playerId: PlayerIdSchema,
  status: z.enum(["active", "eliminated"]),
  cash: InMatchCashStringSchema,
  position: BoardPositionSchema,
  inJail: z.boolean(),
  jailTurns: z.number().int().min(0).max(3),
  consecutiveDoubles: z.number().int().min(0).max(2),
  missedTurns: z.number().int().min(0).max(3),
  getOutOfJailCards: z.number().int().min(0).max(255),
  ownedPropertyPositions: z.array(BoardPositionSchema).max(40),
});

const ownableSpaceKinds = z.enum(["street", "railroad", "utility"]);

export const OwnableSpacePublicStateSchema = z
  .strictObject({
    position: BoardPositionSchema,
    kind: ownableSpaceKinds,
    ownerId: PlayerIdSchema.nullable(),
    mortgaged: z.boolean(),
    houses: z.number().int().min(0).max(4),
    hasHotel: z.boolean(),
  })
  .superRefine((space, context) => {
    if (space.kind !== "street" && (space.houses !== 0 || space.hasHotel)) {
      context.addIssue({ code: "custom", message: "only streets can contain buildings" });
    }
    if (space.hasHotel && space.houses !== 0) {
      context.addIssue({ code: "custom", message: "a hotel replaces all houses" });
    }
    if (space.ownerId === null && (space.mortgaged || space.houses !== 0 || space.hasHotel)) {
      context.addIssue({ code: "custom", message: "unowned spaces cannot be developed or mortgaged" });
    }
  });

export const NonOwnableSpacePublicStateSchema = z.strictObject({
  position: BoardPositionSchema,
  kind: z.enum(["tax", "chance", "communityChest", "corner"]),
});

export const BoardSpacePublicStateSchema = z.union([
  OwnableSpacePublicStateSchema,
  NonOwnableSpacePublicStateSchema,
]);

const activeTurnBase = {
  currentSeatIndex: SeatIndexSchema,
  startedAtMs: EpochMillisecondsSchema,
  deadlineAtMs: EpochMillisecondsSchema,
};

export const GameplayTurnStateSchema = z.discriminatedUnion("phase", [
  z.strictObject({ phase: z.literal("notStarted") }),
  z.strictObject({ phase: z.literal("awaitingRoll"), ...activeTurnBase }),
  z.strictObject({
    phase: z.literal("awaitingPropertyDecision"),
    ...activeTurnBase,
    propertyPosition: BoardPositionSchema,
  }),
  z.strictObject({
    phase: z.literal("awaitingRentPayment"),
    ...activeTurnBase,
    propertyPosition: BoardPositionSchema,
  }),
  z.strictObject({
    phase: z.literal("awaitingCardDraw"),
    ...activeTurnBase,
    deck: CardDeckSchema,
  }),
  z.strictObject({
    phase: z.literal("awaitingTaxPayment"),
    ...activeTurnBase,
    taxKind: TaxKindSchema,
  }),
  z.strictObject({ phase: z.literal("awaitingBankruptcy"), ...activeTurnBase }),
  z.strictObject({ phase: z.literal("awaitingEndTurn"), ...activeTurnBase }),
  z.strictObject({ phase: z.literal("finished") }),
]);

export const TradePublicStateSchema = z
  .strictObject({
    tradeId: TradeIdSchema,
    tradeType: z.enum(["moneyOnly", "propertyOnly", "moneyForProperty", "propertyForMoney"]),
    proposerId: PlayerIdSchema,
    receiverId: PlayerIdSchema,
    offeredCash: InMatchCashStringSchema,
    requestedCash: InMatchCashStringSchema,
    offeredPropertyPosition: BoardPositionSchema.nullable(),
    requestedPropertyPosition: BoardPositionSchema.nullable(),
    status: z.literal("pending"),
    createdAtMs: EpochMillisecondsSchema,
    expiresAtMs: EpochMillisecondsSchema,
  })
  .superRefine((trade, context) => {
    if (trade.proposerId === trade.receiverId) {
      context.addIssue({ code: "custom", message: "trade participants must differ" });
    }
    if (trade.expiresAtMs < trade.createdAtMs) {
      context.addIssue({ code: "custom", message: "trade expiry cannot predate creation" });
    }
    if (
      trade.offeredPropertyPosition !== null &&
      trade.offeredPropertyPosition === trade.requestedPropertyPosition
    ) {
      context.addIssue({ code: "custom", message: "the same property cannot be offered by both sides" });
    }
    const validShape =
      (trade.tradeType === "moneyOnly" &&
        trade.offeredPropertyPosition === null &&
        trade.requestedPropertyPosition === null &&
        (trade.offeredCash !== "0" || trade.requestedCash !== "0")) ||
      (trade.tradeType === "propertyOnly" &&
        trade.offeredCash === "0" &&
        trade.requestedCash === "0" &&
        (trade.offeredPropertyPosition !== null || trade.requestedPropertyPosition !== null)) ||
      (trade.tradeType === "moneyForProperty" &&
        trade.offeredCash !== "0" &&
        trade.requestedCash === "0" &&
        trade.offeredPropertyPosition === null &&
        trade.requestedPropertyPosition !== null) ||
      (trade.tradeType === "propertyForMoney" &&
        trade.offeredCash === "0" &&
        trade.requestedCash !== "0" &&
        trade.offeredPropertyPosition !== null &&
        trade.requestedPropertyPosition === null);
    if (!validShape) {
      context.addIssue({ code: "custom", message: "trade terms must match the frozen trade type" });
    }
  });

export const TerminalRankingEntrySchema = z.strictObject({
  rank: z.number().int().min(1).max(4),
  seatIndex: SeatIndexSchema,
  playerId: PlayerIdSchema,
  netWorth: InMatchCashStringSchema,
});

export const GameplayTerminalStateSchema = z
  .strictObject({
    reason: GameEndReasonSchema,
    winnerId: PlayerIdSchema,
    endedAtMs: EpochMillisecondsSchema,
    ranking: z.array(TerminalRankingEntrySchema).min(1).max(4),
    settlementEntitlement: z.strictObject({
      winnerId: PlayerIdSchema,
      status: z.enum(["pending", "submitted", "settled"]),
    }),
  })
  .superRefine((terminal, context) => {
    if (terminal.ranking[0]?.rank !== 1 || terminal.ranking[0]?.playerId !== terminal.winnerId) {
      context.addIssue({ code: "custom", message: "winner must be the first ranked player" });
    }
    if (terminal.settlementEntitlement.winnerId !== terminal.winnerId) {
      context.addIssue({ code: "custom", message: "settlement entitlement must use the winner" });
    }
    const ranks = terminal.ranking.map((entry) => entry.rank);
    const players = terminal.ranking.map((entry) => entry.playerId);
    if (new Set(ranks).size !== ranks.length || new Set(players).size !== players.length) {
      context.addIssue({ code: "custom", message: "terminal ranking entries must be unique" });
    }
    if (terminal.ranking.some((entry, index) => entry.rank !== index + 1)) {
      context.addIssue({ code: "custom", message: "terminal ranking must be contiguous and ordered" });
    }
  });

export const GameplayPublicStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    stateVersion: StateVersionSchema,
    gameId: GameIdSchema,
    rulesetId: GameplayRulesetIdSchema,
    seats: z.array(GameplayPlayerPublicStateSchema.nullable()).length(4),
    board: z.array(BoardSpacePublicStateSchema).length(40),
    turn: GameplayTurnStateSchema,
    activeTrades: z.array(TradePublicStateSchema).max(20),
    lastDice: DiceResultSchema.nullable(),
    terminal: GameplayTerminalStateSchema.nullable(),
  })
  .superRefine((state, context) => {
    const playerIds = state.seats.flatMap((seat) => (seat === null ? [] : [seat.playerId]));
    const playerIdSet = new Set(playerIds);
    if (new Set(playerIds).size !== playerIds.length) {
      context.addIssue({ code: "custom", message: "player IDs must be unique" });
    }
    state.seats.forEach((seat, index) => {
      if (seat !== null && seat.seatIndex !== index) {
        context.addIssue({ code: "custom", message: "seatIndex must match its stable slot" });
      }
      if (seat !== null && new Set(seat.ownedPropertyPositions).size !== seat.ownedPropertyPositions.length) {
        context.addIssue({ code: "custom", message: "owned property positions must be unique" });
      }
    });
    state.board.forEach((space, index) => {
      if (space.position !== index) {
        context.addIssue({ code: "custom", message: "board positions must match their stable index" });
      }
      if ("ownerId" in space && space.ownerId !== null && !playerIdSet.has(space.ownerId)) {
        context.addIssue({ code: "custom", message: "property owner must occupy a game seat" });
      }
      const expectedKind =
        [1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39].includes(index)
          ? "street"
          : [5, 15, 25, 35].includes(index)
            ? "railroad"
            : [12, 28].includes(index)
              ? "utility"
              : [4, 38].includes(index)
                ? "tax"
                : [7, 22, 36].includes(index)
                  ? "chance"
                  : [2, 17, 33].includes(index)
                    ? "communityChest"
                    : "corner";
      if (space.kind !== expectedKind) {
        context.addIssue({ code: "custom", message: "board kind must match the frozen board position" });
      }
    });
    state.seats.forEach((seat) => {
      if (seat === null) return;
      const derivedPositions = state.board.flatMap((space) =>
        "ownerId" in space && space.ownerId === seat.playerId ? [space.position] : [],
      );
      if (
        derivedPositions.length !== seat.ownedPropertyPositions.length ||
        derivedPositions.some((position) => !seat.ownedPropertyPositions.includes(position))
      ) {
        context.addIssue({ code: "custom", message: "owned property positions must match board ownership" });
      }
    });
    state.activeTrades.forEach((trade) => {
      if (!playerIdSet.has(trade.proposerId) || !playerIdSet.has(trade.receiverId)) {
        context.addIssue({ code: "custom", message: "trade participants must occupy game seats" });
      }
    });
    if (state.turn.phase !== "notStarted" && state.turn.phase !== "finished") {
      const currentSeat = state.seats[state.turn.currentSeatIndex];
      if (currentSeat === null || currentSeat === undefined || currentSeat.status !== "active") {
        context.addIssue({ code: "custom", message: "active turn must reference an active occupied seat" });
      }
      if (state.turn.deadlineAtMs < state.turn.startedAtMs) {
        context.addIssue({ code: "custom", message: "turn deadline cannot predate turn start" });
      }
    }
    if ((state.turn.phase === "finished") !== (state.terminal !== null)) {
      context.addIssue({ code: "custom", message: "finished turn and terminal state must agree" });
    }
    if (
      state.terminal !== null &&
      state.terminal.ranking.some((entry) => !playerIdSet.has(entry.playerId))
    ) {
      context.addIssue({ code: "custom", message: "terminal ranking players must occupy game seats" });
    }
  });

export type BoardPosition = z.infer<typeof BoardPositionSchema>;
export type TradeId = z.infer<typeof TradeIdSchema>;
export type DiceResult = z.infer<typeof DiceResultSchema>;
export type GameplayPlayerPublicState = z.infer<typeof GameplayPlayerPublicStateSchema>;
export type BoardSpacePublicState = z.infer<typeof BoardSpacePublicStateSchema>;
export type GameplayTurnState = z.infer<typeof GameplayTurnStateSchema>;
export type TradePublicState = z.infer<typeof TradePublicStateSchema>;
export type GameplayTerminalState = z.infer<typeof GameplayTerminalStateSchema>;
export type GameplayPublicState = z.infer<typeof GameplayPublicStateSchema>;
