import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeSnapshot } from "@pootown/game-core";
import { SessionBootstrapResponseSchema } from "@pootown/game-contracts/internal";

import { SecureRandomSource } from "../src/random/secure-random-source.js";
import { createWaitingState } from "../src/rooms/bootstrap-state.js";

const bootstrap = SessionBootstrapResponseSchema.parse({
  contractVersion: 1,
  gameId: "game_1",
  gameDefinitionId: "classic_100",
  gameDefinitionVersion: 1,
  rulesetId: "pootown-rust-source-v1",
  roomId: "room_1",
  lifecycle: "open",
  stateVersion: 0,
  creatorPlayerId: "player_1",
  maximumPlayers: 4,
  timeLimitMs: 3_600_000,
  createdAtMs: 1,
  startedAtMs: null,
  players: [
    { playerId: "player_1", seatIndex: 0, joinedAtMs: 1 },
    { playerId: "player_3", seatIndex: 2, joinedAtMs: 2 },
  ],
});

describe("room bootstrap state", () => {
  it("materializes stable gapped seats into a complete core snapshot", () => {
    const state = createWaitingState(bootstrap, new SecureRandomSource(Buffer.alloc(32, 1)));
    assert.equal(state.stateVersion, 1);
    assert.equal(state.seats[0]?.playerId, "player_1");
    assert.equal(state.seats[1], null);
    assert.equal(state.seats[2]?.playerId, "player_3");
    assert.equal(state.seats[3], null);
    assert.equal(state.bankCash, 1_000_000n);
    assert.equal(serializeSnapshot(state).includes("hmac-sha256-v1"), true);
    assert.equal(Object.isFrozen(state), true);
  });

  it("does not guess state for active or versioned sessions without a checkpoint", () => {
    assert.throws(() => createWaitingState({ ...bootstrap, lifecycle: "active" }, new SecureRandomSource()));
    assert.throws(() => createWaitingState({ ...bootstrap, stateVersion: 1 }, new SecureRandomSource()));
  });
});
