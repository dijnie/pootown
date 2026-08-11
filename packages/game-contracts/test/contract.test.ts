import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AccountCoinStringSchema,
  AccountCoinViewSchema,
  CreateGameRequestSchema,
  InMatchCashStringSchema,
  PlayerPrivateViewSchema,
  PublicGameStateSchema,
  RoomCommandSchema,
  lifecycleContractFixture,
  type AccountCoinString,
  type InMatchCashString,
} from "../src";

describe("game contracts", () => {
  it("strictly parses supported lifecycle commands", () => {
    assert.equal(RoomCommandSchema.parse(lifecycleContractFixture.create).type, "createGame");
    assert.equal(RoomCommandSchema.parse(lifecycleContractFixture.join).type, "joinGame");
    assert.equal(RoomCommandSchema.parse(lifecycleContractFixture.leave).type, "leaveGame");
    assert.equal(RoomCommandSchema.parse(lifecycleContractFixture.start).type, "startGame");
    assert.equal(RoomCommandSchema.parse(lifecycleContractFixture.cancel).type, "cancelGame");

    assert.equal(
      RoomCommandSchema.safeParse({ ...lifecycleContractFixture.join, unexpected: true }).success,
      false,
    );
    assert.equal(
      RoomCommandSchema.safeParse({ ...lifecycleContractFixture.join, type: "rollDice" }).success,
      false,
    );
    assert.equal(
      RoomCommandSchema.safeParse({ ...lifecycleContractFixture.join, requestId: "not-a-uuid" }).success,
      false,
    );
  });

  it("rejects unknown, oversized, and non-canonical transport values", () => {
    const validCreateRequest = {
      contractVersion: 1,
      maximumPlayers: 4,
      entryCoin: "0",
      timeLimitMs: null,
    };
    assert.equal(CreateGameRequestSchema.safeParse(validCreateRequest).success, true);
    assert.equal(CreateGameRequestSchema.safeParse({ ...validCreateRequest, contractVersion: 2 }).success, false);
    assert.equal(CreateGameRequestSchema.safeParse({ ...validCreateRequest, maximumPlayers: 5 }).success, false);
    assert.equal(CreateGameRequestSchema.safeParse({ ...validCreateRequest, entryCoin: "01" }).success, false);
    assert.equal(CreateGameRequestSchema.safeParse({ ...validCreateRequest, extra: true }).success, false);
    assert.equal(AccountCoinStringSchema.safeParse("9".repeat(79)).success, false);
    assert.equal(InMatchCashStringSchema.safeParse("-1").success, false);

    assert.equal(
      RoomCommandSchema.safeParse({
        ...lifecycleContractFixture.create,
        payload: { ...lifecycleContractFixture.create.payload, gameId: "bad id" },
      }).success,
      false,
    );
    assert.equal(
      RoomCommandSchema.safeParse({
        ...lifecycleContractFixture.create,
        payload: { ...lifecycleContractFixture.create.payload, unknown: true },
      }).success,
      false,
    );
    for (const expectedStateVersion of [-1, 1.5, 2_147_483_648]) {
      assert.equal(
        RoomCommandSchema.safeParse({
          ...lifecycleContractFixture.join,
          expectedStateVersion,
        }).success,
        false,
      );
    }
  });

  it("keeps public and per-player state free of secret transport fields", () => {
    const publicState = {
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
          cash: "1500",
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
    };

    assert.equal(PublicGameStateSchema.safeParse(publicState).success, true);
    assert.equal(PublicGameStateSchema.safeParse({ ...publicState, rngState: "secret" }).success, false);
    assert.equal(
      PublicGameStateSchema.safeParse({
        ...publicState,
        lifecycle: "inProgress",
        startedAtMs: null,
      }).success,
      false,
    );
    const onePlayerActive = {
      ...publicState,
      lifecycle: "inProgress",
      stateVersion: 2,
      startedAtMs: 2,
      turn: { phase: "awaitingRoll", currentSeatIndex: 0, startedAtMs: 2, deadlineAtMs: 32_002 },
    };
    assert.equal(PublicGameStateSchema.safeParse(onePlayerActive).success, false);
    assert.equal(
      PublicGameStateSchema.safeParse({
        ...onePlayerActive,
        seats: [
          publicState.seats[0],
          {
            seatIndex: 1,
            playerId: "player_2",
            status: "active",
            cash: "1500",
            position: 0,
            inJail: false,
          },
          null,
          null,
        ],
        currentPlayers: 2,
        activePlayers: 2,
        turn: { phase: "awaitingRoll", currentSeatIndex: 3, startedAtMs: 2, deadlineAtMs: 32_002 },
      }).success,
      false,
    );
    assert.equal(
      PlayerPrivateViewSchema.safeParse({
        schemaVersion: 1,
        gameId: "game_1",
        playerId: "player_1",
        reconnectDeadlineAtMs: null,
        ticket: "secret",
      }).success,
      false,
    );
  });

  it("keeps account coin and in-match cash nominally distinct", () => {
    const accountCoin: AccountCoinString = AccountCoinStringSchema.parse("1000");
    const inMatchCash: InMatchCashString = InMatchCashStringSchema.parse("1500");
    assert.equal(accountCoin, "1000");
    assert.equal(inMatchCash, "1500");

    // @ts-expect-error Account coin cannot be assigned to in-match cash.
    const invalidCash: InMatchCashString = accountCoin;
    assert.equal(invalidCash, "1000");

    assert.deepEqual(
      AccountCoinViewSchema.parse({ availableCoin: "900", reservedCoin: "100" }),
      { availableCoin: "900", reservedCoin: "100" },
    );
    assert.equal(
      AccountCoinViewSchema.safeParse({ availableCoin: "900", reservedCoin: "100", cash: "1500" }).success,
      false,
    );
  });
});
