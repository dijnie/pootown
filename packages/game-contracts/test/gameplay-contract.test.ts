import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PlayerGameplayCommandSchema,
} from "../src/realtime/gameplay-commands";
import { InternalGameplayCommandSchema } from "../src/realtime/internal-gameplay-commands";
import { RoomCommandSchema } from "../src/realtime/commands";
import { ServerMessageSchema } from "../src/realtime/messages";
import {
  GameplayDomainEventEnvelopeSchema,
  GameplayEventPayloadSchema,
} from "../src/realtime/gameplay-events";
import { GameplayPublicStateSchema, TradePublicStateSchema } from "../src/state/gameplay-state";

const requestId = "00000000-0000-4000-8000-000000000101";

function command(type: string, payload: Record<string, unknown> = {}) {
  return { requestId, expectedStateVersion: 7, type, payload };
}

function createBoard() {
  const streets = new Set([1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39]);
  const railroads = new Set([5, 15, 25, 35]);
  const utilities = new Set([12, 28]);
  const taxes = new Set([4, 38]);
  const chances = new Set([7, 22, 36]);
  const communities = new Set([2, 17, 33]);
  return Array.from({ length: 40 }, (_, position) => {
    const kind = streets.has(position)
      ? "street"
      : railroads.has(position)
        ? "railroad"
        : utilities.has(position)
          ? "utility"
          : taxes.has(position)
            ? "tax"
            : chances.has(position)
              ? "chance"
              : communities.has(position)
                ? "communityChest"
                : "corner";
    return kind === "street" || kind === "railroad" || kind === "utility"
      ? {
          position,
          kind,
          ownerId: position === 1 ? "player_1" : null,
          mortgaged: false,
          houses: 0,
          hasHotel: false,
        }
      : { position, kind };
  });
}

const activePlayer = {
  seatIndex: 0,
  playerId: "player_1",
  status: "active",
  cash: "1500",
  position: 0,
  inJail: false,
  jailTurns: 0,
  consecutiveDoubles: 0,
  missedTurns: 0,
  getOutOfJailCards: 0,
  ownedPropertyPositions: [1],
};

const publicState = {
  schemaVersion: 1,
  stateVersion: 7,
  gameId: "game_1",
  rulesetId: "pootown-rust-source-v1",
  seats: [activePlayer, null, null, null],
  board: createBoard(),
  turn: { phase: "awaitingRoll", currentSeatIndex: 0, startedAtMs: 100, deadlineAtMs: 90_100 },
  activeTrades: [],
  lastDice: null,
  terminal: null,
};

describe("gameplay transport contracts", () => {
  it("accepts only the executed player intent command inventory", () => {
    const validCommands = [
      command("rollDice"),
      command("buyProperty", { position: 1 }),
      command("declineProperty", { position: 1 }),
      command("payRent", { position: 1 }),
      command("endTurn"),
      command("drawChanceCard"),
      command("drawCommunityChestCard"),
      command("payJailFine"),
      command("useJailCard"),
      command("buildHouse", { position: 1 }),
      command("buildHotel", { position: 1 }),
      command("sellBuilding", { position: 1, buildingType: "house" }),
      command("payMevTax"),
      command("payPriorityFeeTax"),
      command("declareBankruptcy"),
      command("endGame"),
      command("createTrade", {
        tradeType: "moneyForProperty",
        receiverId: "player_2",
        offeredCash: "100",
        requestedPropertyPosition: 3,
      }),
      command("acceptTrade", { tradeId: "trade_1" }),
      command("rejectTrade", { tradeId: "trade_1" }),
      command("cancelTrade", { tradeId: "trade_1" }),
    ];

    for (const candidate of validCommands) {
      assert.equal(PlayerGameplayCommandSchema.safeParse(candidate).success, true, candidate.type);
      assert.equal(RoomCommandSchema.safeParse(candidate).success, true, candidate.type);
    }

    for (const type of ["startAuction", "placeBid", "mortgageProperty", "unmortgageProperty", "claimReward"] ) {
      assert.equal(PlayerGameplayCommandSchema.safeParse(command(type)).success, false, type);
    }

    const tradeShapes = [
      { tradeType: "moneyOnly", receiverId: "player_2", offeredCash: "100", requestedCash: "0" },
      {
        tradeType: "propertyOnly",
        receiverId: "player_2",
        offeredPropertyPosition: 1,
        requestedPropertyPosition: null,
      },
      { tradeType: "moneyForProperty", receiverId: "player_2", offeredCash: "100", requestedPropertyPosition: 3 },
      { tradeType: "propertyForMoney", receiverId: "player_2", offeredPropertyPosition: 1, requestedCash: "100" },
    ];
    for (const payload of tradeShapes) {
      assert.equal(PlayerGameplayCommandSchema.safeParse(command("createTrade", payload)).success, true);
    }
  });

  it("keeps server-owned actors, outcomes, and randomness out of client payloads", () => {
    const forgedCommands = [
      command("rollDice", { dice: [6, 6] }),
      command("rollDice", { actorId: "player_2" }),
      command("rollDice", { randomSeed: "seed" }),
      command("drawChanceCard", { cardId: 4 }),
      command("drawCommunityChestCard", { cardIndex: 0, effect: "money" }),
      command("buyProperty", { position: 1, price: "1" }),
      command("payRent", { position: 1, ownerId: "player_2", rent: "1" }),
      command("endGame", { winnerId: "player_1", reward: "999999" }),
      command("declareBankruptcy", { creditorId: "player_2" }),
      command("acceptTrade", { tradeId: "trade_1", proposerId: "player_1" }),
    ];

    for (const candidate of forgedCommands) {
      assert.equal(PlayerGameplayCommandSchema.safeParse(candidate).success, false, candidate.type);
    }
  });

  it("strictly bounds command identifiers, board positions, money, and envelopes", () => {
    assert.equal(PlayerGameplayCommandSchema.safeParse(command("buyProperty", { position: 40 })).success, false);
    assert.equal(PlayerGameplayCommandSchema.safeParse(command("buyProperty", { position: -1 })).success, false);
    assert.equal(
      PlayerGameplayCommandSchema.safeParse(
        command("createTrade", {
          tradeType: "moneyOnly",
          receiverId: "player_2",
          offeredCash: "9".repeat(79),
          requestedCash: "1",
        }),
      ).success,
      false,
    );
    assert.equal(
      PlayerGameplayCommandSchema.safeParse(command("acceptTrade", { tradeId: "t".repeat(129) })).success,
      false,
    );
    assert.equal(
      PlayerGameplayCommandSchema.safeParse({ ...command("endTurn"), expectedStateVersion: 2_147_483_648 }).success,
      false,
    );
    assert.equal(PlayerGameplayCommandSchema.safeParse({ ...command("endTurn"), unexpected: true }).success, false);
    assert.equal(
      PlayerGameplayCommandSchema.safeParse({ ...command("endTurn"), requestId: "not-a-uuid" }).success,
      false,
    );
    assert.equal(
      PlayerGameplayCommandSchema.safeParse(command("createTrade", {
        tradeType: "moneyForProperty",
        receiverId: "player_2",
        offeredCash: "1",
        requestedCash: "1",
        requestedPropertyPosition: 3,
      })).success,
      false,
    );
    assert.equal(
      PlayerGameplayCommandSchema.safeParse(command("createTrade", {
        tradeType: "moneyOnly",
        receiverId: "player_2",
        offeredCash: "100",
        requestedCash: "0",
      })).success,
      true,
    );
  });

  it("keeps timer and randomness resolution internal without accepting outcomes", () => {
    const validInternal = [
      command("resolveRandomDice"),
      command("resolveRandomCard", { deck: "chance" }),
      command("warnTurnThirtySeconds"),
      command("warnTurnTenSeconds"),
      command("handleTurnTimeout"),
      command("cleanupExpiredTrades"),
      command("enforceGameTimeLimit"),
    ];
    for (const candidate of validInternal) {
      assert.equal(InternalGameplayCommandSchema.safeParse(candidate).success, true, candidate.type);
    }

    assert.equal(InternalGameplayCommandSchema.safeParse(command("resolveRandomDice", { dice: [1, 2] })).success, false);
    assert.equal(
      InternalGameplayCommandSchema.safeParse(
        command("resolveRandomCard", { deck: "chance", cardId: 1, rngState: "secret" }),
      ).success,
      false,
    );
    assert.equal(PlayerGameplayCommandSchema.safeParse(command("handleTurnTimeout")).success, false);
  });

  it("freezes the four executed trade shapes across commands and public state", () => {
    const moneyGift = {
      tradeId: "trade_1",
      tradeType: "moneyOnly",
      proposerId: "player_1",
      receiverId: "player_2",
      offeredCash: "100",
      requestedCash: "0",
      offeredPropertyPosition: null,
      requestedPropertyPosition: null,
      status: "pending",
      createdAtMs: 100,
      expiresAtMs: 3_600_100,
    };
    assert.equal(TradePublicStateSchema.safeParse(moneyGift).success, true);
    assert.equal(TradePublicStateSchema.safeParse({ ...moneyGift, status: "accepted" }).success, false);
    assert.equal(
      TradePublicStateSchema.safeParse({ ...moneyGift, offeredPropertyPosition: 1 }).success,
      false,
    );
  });

  it("validates bounded public gameplay state without secret or account-coin fields", () => {
    assert.equal(GameplayPublicStateSchema.safeParse(publicState).success, true);
    assert.equal(GameplayPublicStateSchema.safeParse({ ...publicState, rngState: "secret" }).success, false);
    assert.equal(GameplayPublicStateSchema.safeParse({ ...publicState, availableCoin: "1000" }).success, false);
    assert.equal(GameplayPublicStateSchema.safeParse({ ...publicState, rulesetId: "invented-rules" }).success, false);
    assert.equal(GameplayPublicStateSchema.safeParse({ ...publicState, seats: [...publicState.seats, null] }).success, false);
    assert.equal(GameplayPublicStateSchema.safeParse({ ...publicState, board: publicState.board.slice(0, 39) }).success, false);
    assert.equal(
      GameplayPublicStateSchema.safeParse({
        ...publicState,
        board: publicState.board.map((space, index) => (index === 2 ? { ...space, position: 3 } : space)),
      }).success,
      false,
    );
    assert.equal(
      GameplayPublicStateSchema.safeParse({
        ...publicState,
        board: publicState.board.map((space, index) =>
          index === 1 && "ownerId" in space ? { ...space, ownerId: "not_seated" } : space,
        ),
      }).success,
      false,
    );
    assert.equal(
      GameplayPublicStateSchema.safeParse({
        ...publicState,
        seats: [{ ...activePlayer, ownedPropertyPositions: [] }, null, null, null],
      }).success,
      false,
    );
    assert.equal(
      GameplayPublicStateSchema.safeParse({
        ...publicState,
        lastDice: { dieOne: 6, dieTwo: 5, total: 12, isDoubles: false },
      }).success,
      false,
    );
  });

  it("accepts derived public events and rejects forged or oversized event values", () => {
    const diceEvent = {
      type: "diceRolled",
      playerId: "player_1",
      dice: { dieOne: 3, dieTwo: 4, total: 7, isDoubles: false },
    };
    const purchaseEvent = { type: "propertyPurchased", playerId: "player_1", position: 1, price: "60" };
    const cardEvent = {
      type: "cardDrawn",
      playerId: "player_1",
      deck: "chance",
      cardId: 1,
      effect: "moveToNearest",
    };
    const endedEvent = {
      type: "gameEnded",
      reason: "timeLimit",
      winnerId: "player_1",
      ranking: [{ rank: 1, seatIndex: 0, playerId: "player_1", netWorth: "1800" }],
    };
    for (const candidate of [diceEvent, purchaseEvent, cardEvent, endedEvent]) {
      assert.equal(GameplayEventPayloadSchema.safeParse(candidate).success, true, candidate.type);
    }

    assert.equal(GameplayEventPayloadSchema.safeParse({ ...diceEvent, rngState: "secret" }).success, false);
    assert.equal(GameplayEventPayloadSchema.safeParse({ ...cardEvent, cardId: 6 }).success, false);
    assert.equal(GameplayEventPayloadSchema.safeParse({ ...cardEvent, effect: "payPerProperty" }).success, false);
    assert.equal(GameplayEventPayloadSchema.safeParse({ ...cardEvent, effect: "unimplemented" }).success, false);
    assert.equal(GameplayEventPayloadSchema.safeParse({ ...cardEvent, deck: "communityChest" }).success, false);
    assert.equal(GameplayEventPayloadSchema.safeParse({ ...purchaseEvent, price: "01" }).success, false);
    assert.equal(
      GameplayEventPayloadSchema.safeParse({ ...purchaseEvent, price: "9".repeat(79) }).success,
      false,
    );
    assert.equal(
      GameplayDomainEventEnvelopeSchema.safeParse({
        type: "domain.event",
        eventId: "event_1",
        gameId: "game_1",
        stateVersion: 8,
        occurredAtMs: 200,
        payload: purchaseEvent,
      }).success,
      true,
    );
    assert.equal(
      ServerMessageSchema.safeParse({
        type: "domain.event",
        eventId: "event_1",
        gameId: "game_1",
        stateVersion: 8,
        occurredAtMs: 200,
        payload: purchaseEvent,
      }).success,
      true,
    );
    assert.equal(
      GameplayDomainEventEnvelopeSchema.safeParse({
        type: "domain.event",
        eventId: "event_1",
        gameId: "game_1",
        stateVersion: 8,
        occurredAtMs: 200,
        payload: purchaseEvent,
        reward: "1000",
      }).success,
      false,
    );
  });
});
