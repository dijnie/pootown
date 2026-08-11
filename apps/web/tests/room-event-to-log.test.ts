import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameplayEventPayloadSchema, LifecycleEventPayloadSchema } from "@pootown/game-contracts";

import { mapRoomEventToLog } from "../services/room-event-to-log.js";

describe("room event log adapter", () => {
  it("maps lifecycle identities from canonical events", () => {
    const payload = LifecycleEventPayloadSchema.parse({
      type: "playerJoined",
      playerId: "player_2",
      seatIndex: 1,
      totalPlayers: 2,
    });
    const log = mapRoomEventToLog(payload, "game_1", "event_1");
    assert.equal(log?.type, "PlayerJoined");
    assert.equal(log?.playerId, "player_2");
    assert.equal(log?.signature, "event_1");
  });

  it("keeps canonical 78-digit match cash lossless", () => {
    const amount = "9".repeat(78);
    const payload = GameplayEventPayloadSchema.parse({
      type: "rentPaid",
      payerId: "player_1",
      ownerId: "player_2",
      position: 1,
      amount,
    });
    const log = mapRoomEventToLog(payload, "game_1", "event_2");
    assert.equal(log?.details?.amount, amount);
    assert.equal(log?.details?.owner, "player_2");
  });

  it("maps frozen card IDs without trusting a client-provided effect", () => {
    const payload = GameplayEventPayloadSchema.parse({
      type: "cardDrawn",
      playerId: "player_1",
      deck: "chance",
      cardId: 1,
      effect: "moveToNearest",
    });
    const log = mapRoomEventToLog(payload, "game_1", "event_3");
    assert.equal(log?.type, "ChanceCardDrawn");
    assert.equal(log?.details?.cardIndex, 0);
  });
});
