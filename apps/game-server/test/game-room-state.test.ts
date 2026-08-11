import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initializeGameplayAggregate,
  playerId,
  transition,
} from "@pootown/game-core";
import {
  GameplayPublicStateSchema,
  PublicGameStateSchema,
} from "@pootown/game-contracts";

import { SecureRandomSource } from "../src/random/secure-random-source.js";
import { createWaitingState } from "../src/rooms/bootstrap-state.js";
import { createGameRoomState, toRoomPublicState } from "../src/rooms/game-room-state.js";

const bootstrap = {
  contractVersion: 1 as const,
  gameId: "game_public" as never,
  gameDefinitionId: "classic_100" as never,
  gameDefinitionVersion: 1,
  rulesetId: "pootown-rust-source-v1" as const,
  roomId: "room_public" as never,
  lifecycle: "open" as const,
  stateVersion: 0,
  creatorPlayerId: "player_owner" as never,
  maximumPlayers: 4,
  timeLimitMs: 3_600_000,
  createdAtMs: 1_000,
  startedAtMs: null,
  players: [
    { playerId: "player_owner" as never, seatIndex: 0, joinedAtMs: 1_000 },
    { playerId: "player_second" as never, seatIndex: 2, joinedAtMs: 1_001 },
  ],
};

describe("public Colyseus room state", () => {
  it("maps waiting state without exposing private checkpoint or identity data", () => {
    const privateState = createWaitingState(bootstrap, new SecureRandomSource(Buffer.alloc(32, 1)));
    const publicState = toRoomPublicState(privateState);
    assert.equal(PublicGameStateSchema.safeParse(publicState).success, true);
    const synchronized = createGameRoomState(privateState);
    assert.equal(synchronized.stateVersion, privateState.stateVersion);
    assert.deepEqual(JSON.parse(synchronized.publicStateJson), publicState);
    assert.doesNotMatch(synchronized.publicStateJson, /rng|seed|ticket|reservation|userId/i);
  });

  it("maps active gameplay board, stable seats, and dice through the strict public contract", () => {
    const waiting = createWaitingState(bootstrap, new SecureRandomSource(Buffer.alloc(32, 2)));
    const source = new SecureRandomSource(Buffer.alloc(32, 2));
    const started = transition(waiting, {
      type: "startGame",
      expectedStateVersion: waiting.stateVersion,
      payload: {},
    }, {
      actorId: playerId("player_owner"),
      nowMs: 2_000,
      randomSource: source,
    });
    assert.equal(started.ok, true);
    if (!started.ok || started.state.lifecycle !== "inProgress") return;
    const gameplay = initializeGameplayAggregate(started.state);
    assert.notEqual(gameplay, null);
    if (gameplay === null) return;
    const publicState = toRoomPublicState(gameplay);
    const parsed = GameplayPublicStateSchema.parse(publicState);
    assert.equal(parsed.seats[1], null);
    assert.equal(parsed.seats[2]?.playerId, "player_second");
    assert.equal(parsed.board.length, 40);
    const serialized = JSON.stringify(publicState);
    assert.doesNotMatch(serialized, /rng|seed|ticket|reservation|userId|joinedAtMs|emittedWarnings/i);
  });
});
