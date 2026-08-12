import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GameplayPublicStateSchema,
  PublicGameStateSchema,
} from "@pootown/game-contracts";

import { adaptRoomState } from "../services/room-state-adapter.js";

function createBoard() {
  const streets = new Set([
    1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34,
    37, 39,
  ]);
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

describe("room state adapter", () => {
  it("keeps waiting-room player IDs and cash as server-owned values", () => {
    const state = PublicGameStateSchema.parse({
      schemaVersion: 1,
      stateVersion: 1,
      gameId: "game_1",
      creatorId: "player_1",
      lifecycle: "waitingForPlayers",
      minimumPlayers: 2,
      maximumPlayers: 4,
      seats: [
        {
          seatIndex: 0,
          playerId: "player_1",
          status: "active",
          cash: "9".repeat(78),
          position: 0,
          inJail: false,
        },
        null,
        null,
        null,
      ],
      currentPlayers: 1,
      activePlayers: 1,
      bankCash: "1000000",
      housesRemaining: 32,
      hotelsRemaining: 12,
      createdAtMs: 1,
      startedAtMs: null,
      cancelledAtMs: null,
      gameEndAtMs: null,
      turn: { phase: "notStarted" },
    });
    const adapted = adaptRoomState(state);
    assert.equal(adapted.gameState.creator, "player_1");
    assert.equal(adapted.gameState.currentPlayers, 1);
    assert.equal(adapted.players[0]?.cashBalance, "9".repeat(78));
  });

  it("maps stable gapped seats, tax decisions, properties, and trades without inventing outcomes", () => {
    const state = GameplayPublicStateSchema.parse({
      schemaVersion: 1,
      stateVersion: 7,
      gameId: "game_1",
      rulesetId: "pootown-rust-source-v1",
      seats: [
        {
          seatIndex: 0,
          playerId: "player_1",
          status: "active",
          cash: "1500",
          position: 1,
          inJail: false,
          jailTurns: 0,
          consecutiveDoubles: 0,
          missedTurns: 0,
          getOutOfJailCards: 0,
          ownedPropertyPositions: [1],
        },
        null,
        {
          seatIndex: 2,
          playerId: "player_3",
          status: "active",
          cash: "1200",
          position: 4,
          inJail: false,
          jailTurns: 0,
          consecutiveDoubles: 0,
          missedTurns: 0,
          getOutOfJailCards: 0,
          ownedPropertyPositions: [],
        },
        null,
      ],
      board: createBoard(),
      turn: {
        phase: "awaitingTaxPayment",
        currentSeatIndex: 2,
        taxKind: "mev",
        startedAtMs: 100,
        deadlineAtMs: 90_100,
      },
      activeTrades: [
        {
          tradeId: "trade_1",
          tradeType: "moneyOnly",
          proposerId: "player_1",
          receiverId: "player_3",
          offeredCash: "100",
          requestedCash: "0",
          offeredPropertyPosition: null,
          requestedPropertyPosition: null,
          status: "pending",
          createdAtMs: 100,
          expiresAtMs: 3_600_100,
        },
      ],
      lastDice: null,
      terminal: null,
    });
    const adapted = adaptRoomState(state);
    assert.equal(adapted.gameState.currentTurn, 2);
    assert.deepEqual(adapted.gameState.players, ["player_1", "player_3"]);
    assert.equal(
      adapted.players.find((player) => player.playerId === "player_3")
        ?.pendingSpecialSpacePosition,
      4
    );
    assert.equal(adapted.properties[1]?.owner, "player_1");
    assert.equal(adapted.gameState.activeTrades[0]?.id, "trade_1");
    assert.equal(adapted.gameState.settlementCompleted, false);
  });
});
