import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AdmissionResponseSchema,
  CoinBalanceResponseSchema,
  CoinOperationViewSchema,
  CreateSessionRequestSchema,
  LeaderboardResponseSchema,
  MutationHeadersSchema,
  PublicMutationContractSchemas,
  RescueGrantResponseSchema,
  SessionHistoryEntrySchema,
  TicketGrantSchema,
  UserViewSchema,
} from "../src";
import {
  InternalMutationContractSchemas,
  ReconciliationResponseSchema,
  RoomSessionFinalizationRequestSchema,
  SessionBootstrapResponseSchema,
  SessionStartedRequestSchema,
  SettlementRequestSchema,
  TicketConsumeRequestSchema,
} from "../src/internal";

const requestId = "00000000-0000-4000-8000-000000000401";
const ticket = "A".repeat(43);

describe("HTTP API contracts", () => {
  it("requires strict versioned idempotency headers", () => {
    const headers = { contractVersion: 1, idempotencyKey: "create:client-1" };
    assert.equal(MutationHeadersSchema.safeParse(headers).success, true);
    assert.equal(MutationHeadersSchema.safeParse({ ...headers, contractVersion: 2 }).success, false);
    assert.equal(MutationHeadersSchema.safeParse({ ...headers, idempotencyKey: "bad key" }).success, false);
    assert.equal(MutationHeadersSchema.safeParse({ ...headers, authorization: "secret" }).success, false);
  });

  it("allows only a server-owned game definition selector on create", () => {
    const request = { contractVersion: 1, gameDefinitionId: "classic_100" };
    assert.equal(CreateSessionRequestSchema.safeParse(request).success, true);
    for (const forged of [
      { ...request, entryCoin: "1" },
      { ...request, maximumPlayers: 4 },
      { ...request, timeLimitMs: 1 },
      { ...request, payoutCoin: "999999" },
    ]) {
      assert.equal(CreateSessionRequestSchema.safeParse(forged).success, false);
    }
  });

  it("keeps account coin views separate and rejects identity injection", () => {
    assert.equal(
      CoinBalanceResponseSchema.safeParse({
        contractVersion: 1,
        availableCoin: "900",
        reservedCoin: "100",
        version: 2,
      }).success,
      true,
    );
    assert.equal(
      CoinBalanceResponseSchema.safeParse({
        contractVersion: 1,
        availableCoin: "900",
        reservedCoin: "100",
        version: 2,
        cash: "1500",
      }).success,
      false,
    );
    assert.equal(
      UserViewSchema.safeParse({
        contractVersion: 1,
        userId: "user_1",
        createdAtMs: 1,
        lastSeenAtMs: 2,
        walletAddress: "not-part-of-identity",
      }).success,
      false,
    );
  });

  it("bounds tickets and keeps internal settlement amounts server-derived", () => {
    const grant = {
      contractVersion: 1,
      gameId: "game_1",
      roomId: "room_1",
      reservationId: "reservation_1",
      playerId: "player_1",
      role: "player",
      ticket,
      expiresAtMs: 60_000,
    };
    assert.equal(TicketGrantSchema.safeParse(grant).success, true);
    assert.equal(TicketGrantSchema.safeParse({ ...grant, ticket: "short" }).success, false);
    assert.equal(TicketGrantSchema.safeParse({ ...grant, ticket: `${"A".repeat(42)}_` }).success, false);
    assert.equal(TicketGrantSchema.safeParse({ ...grant, role: "spectator" }).success, false);

    const consume = {
      contractVersion: 1,
      ticket,
      gameId: "game_1",
      roomId: "room_1",
      roomInstanceId: "instance_1",
    };
    assert.equal(TicketConsumeRequestSchema.safeParse(consume).success, true);
    assert.equal(TicketConsumeRequestSchema.safeParse({ ...consume, userId: "user_2" }).success, false);

    const started = { contractVersion: 1, roomId: "room_1", stateVersion: 1 };
    assert.equal(SessionStartedRequestSchema.safeParse(started).success, true);
    assert.equal(SessionStartedRequestSchema.safeParse({ ...started, stateVersion: 0 }).success, false);
    assert.equal(SessionStartedRequestSchema.safeParse({ ...started, roomInstanceId: "forged" }).success, false);

    const settlement = {
      contractVersion: 1,
      roomId: "room_1",
      terminalStateVersion: 9,
      checkpointChecksum: "a".repeat(64),
    };
    assert.equal(SettlementRequestSchema.safeParse(settlement).success, true);
    assert.equal(SettlementRequestSchema.safeParse({ ...settlement, terminalStateVersion: 0 }).success, false);
    assert.equal(SettlementRequestSchema.safeParse({ ...settlement, winnerCoin: "999" }).success, false);
    assert.equal(SettlementRequestSchema.safeParse({ ...settlement, winnerId: "player_2" }).success, false);
  });

  it("couples every public and internal mutation body to idempotency headers", () => {
    assert.deepEqual(Object.keys(PublicMutationContractSchemas).sort(), [
      "cancelSession",
      "createSession",
      "joinIntent",
      "reconnectTicket",
      "releaseJoinIntent",
      "rescueGrant",
    ]);
    assert.deepEqual(Object.keys(InternalMutationContractSchemas).sort(), [
      "abortSession",
      "consumeTicket",
      "finalizeSessionCommand",
      "markStarted",
      "runReconciliation",
      "settleSession",
    ]);
    for (const contract of [
      ...Object.values(PublicMutationContractSchemas),
      ...Object.values(InternalMutationContractSchemas),
    ]) {
      assert.equal(contract.headers.safeParse({ contractVersion: 1 }).success, false);
      assert.equal(contract.headers.safeParse({ contractVersion: 1, idempotencyKey: "operation:1" }).success, true);
    }
  });

  it("binds room finalization without accepting identity or coin amounts", () => {
    const request = {
      contractVersion: 1,
      roomId: "room_1",
      playerId: "player_1",
      reservationId: "reservation_1",
      action: "leave",
    };
    assert.equal(RoomSessionFinalizationRequestSchema.safeParse(request).success, true);
    assert.equal(RoomSessionFinalizationRequestSchema.safeParse({ ...request, userId: "user_1" }).success, false);
    assert.equal(RoomSessionFinalizationRequestSchema.safeParse({ ...request, amount: "100" }).success, false);
    assert.equal(RoomSessionFinalizationRequestSchema.safeParse({ ...request, action: "refund" }).success, false);
  });

  it("strictly versions reconciliation requests and bounded counters", () => {
    const reconciliation = InternalMutationContractSchemas.runReconciliation.body;
    assert.equal(reconciliation.safeParse({ contractVersion: 1 }).success, true);
    assert.equal(reconciliation.safeParse({ contractVersion: 2 }).success, false);
    assert.equal(reconciliation.safeParse({ contractVersion: 1, actorId: "forged" }).success, false);
    const response = {
      contractVersion: 1,
      waitingSessionsCancelled: 1,
      expiredAdmissionsReleased: 2,
      terminalSettlementsCommitted: 3,
      roomCommandsFinalized: 2,
      offlineSessionsAborted: 2,
      sessionsMarkedForRecovery: 4,
      alreadyRunning: false,
    };
    assert.equal(ReconciliationResponseSchema.safeParse(response).success, true);
    assert.equal(ReconciliationResponseSchema.safeParse({ ...response, sessionsMarkedForRecovery: -1 }).success, false);
    assert.equal(ReconciliationResponseSchema.safeParse({ ...response, offlineSessionsAborted: -1 }).success, false);
    assert.equal(ReconciliationResponseSchema.safeParse({ ...response, privateCheckpoint: {} }).success, false);
  });

  it("binds realtime bootstrap policy to stable seats without account identity", () => {
    const bootstrap = {
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
      players: [{ playerId: "player_1", seatIndex: 0, joinedAtMs: 1 }],
    };
    assert.equal(SessionBootstrapResponseSchema.safeParse(bootstrap).success, true);
    assert.equal(SessionBootstrapResponseSchema.safeParse({ ...bootstrap, userId: "private" }).success, false);
    assert.equal(SessionBootstrapResponseSchema.safeParse({ ...bootstrap, entryCoin: "100" }).success, false);
    assert.equal(SessionBootstrapResponseSchema.safeParse({ ...bootstrap, creatorPlayerId: "player_2" }).success, false);
    assert.equal(SessionBootstrapResponseSchema.safeParse({ ...bootstrap, stateVersion: 1 }).success, false);
    assert.equal(SessionBootstrapResponseSchema.safeParse({ ...bootstrap, lifecycle: "cancelled" }).success, false);
    assert.equal(SessionBootstrapResponseSchema.safeParse({
      ...bootstrap,
      players: [{ playerId: "player_1", seatIndex: 0, joinedAtMs: 0 }],
    }).success, false);
    assert.equal(SessionBootstrapResponseSchema.safeParse({
      ...bootstrap,
      lifecycle: "active",
      stateVersion: 1,
      startedAtMs: 2,
    }).success, false);
    assert.equal(SessionBootstrapResponseSchema.safeParse({
      ...bootstrap,
      lifecycle: "active",
      stateVersion: 1,
      startedAtMs: 2,
      players: [
        bootstrap.players[0],
        { playerId: "player_2", seatIndex: 2, joinedAtMs: 2 },
      ],
    }).success, true);
  });

  it("keeps rescue policy and identity server-owned", () => {
    const response = {
      contractVersion: 1,
      availableCoin: "100",
      reservedCoin: "0",
      version: 3,
      granted: true,
      operationId: "operation_1",
    };
    assert.equal(RescueGrantResponseSchema.safeParse(response).success, true);
    assert.equal(RescueGrantResponseSchema.safeParse({ ...response, amount: "100" }).success, false);
    assert.equal(RescueGrantResponseSchema.safeParse({ ...response, operationId: null }).success, false);
    assert.equal(RescueGrantResponseSchema.safeParse({ ...response, granted: false }).success, false);
    assert.equal(RescueGrantResponseSchema.safeParse({ ...response, granted: false, operationId: null }).success, true);
    assert.equal(
      PublicMutationContractSchemas.rescueGrant.body.safeParse({ contractVersion: 1, userId: "user_2" }).success,
      false,
    );
  });

  it("preserves only the useful legacy leaderboard envelope without wallet or SOL fields", () => {
    const response = {
      success: true,
      data: {
        data: [
          {
            rank: 1,
            playerId: "player_1",
            displayName: null,
            gamesPlayed: 3,
            gamesWon: 2,
            accountCoinWon: "100",
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
      requestId,
      timestamp: 1,
    };
    assert.equal(LeaderboardResponseSchema.safeParse(response).success, true);
    assert.equal(
      LeaderboardResponseSchema.safeParse({
        ...response,
        data: {
          ...response.data,
          data: [{ ...response.data.data[0], walletAddress: "wallet", totalWinningsSol: 1 }],
        },
      }).success,
      false,
    );
  });

  it("strictly validates the atomic admission envelope", () => {
    const session = {
      contractVersion: 1,
      gameId: "game_1",
      gameDefinitionId: "classic_100",
      roomId: "room_1",
      lifecycle: "open",
      currentPlayers: 1,
      maximumPlayers: 4,
      entryCoin: "100",
      createdAtMs: 1,
      startedAtMs: null,
      finishedAtMs: null,
      players: [{ playerId: "player_1", seatIndex: 0 }],
    };
    const admission = {
      contractVersion: 1,
      session,
      admission: {
        contractVersion: 1,
        gameId: "game_1",
        roomId: "room_1",
        reservationId: "reservation_1",
        playerId: "player_1",
        role: "player",
        ticket,
        expiresAtMs: 60_000,
      },
    };
    assert.equal(AdmissionResponseSchema.safeParse(admission).success, true);
    assert.equal(AdmissionResponseSchema.safeParse({ ...admission, ticket }).success, false);
    assert.equal(
      AdmissionResponseSchema.safeParse({
        ...admission,
        session: { ...session, currentPlayers: 2 },
      }).success,
      false,
    );
    assert.equal(
      AdmissionResponseSchema.safeParse({
        ...admission,
        admission: { ...admission.admission, roomId: "room_2" },
      }).success,
      false,
    );
    assert.equal(
      AdmissionResponseSchema.safeParse({
        ...admission,
        session: {
          ...session,
          currentPlayers: 2,
          players: [session.players[0], session.players[0]],
        },
      }).success,
      false,
    );
  });

  it("rejects negative zero in account operation and history deltas", () => {
    const operation = {
      operationId: "operation_1",
      kind: "reserve",
      availableDelta: "-0",
      reservedDelta: "0",
      createdAtMs: 1,
    };
    const operationSchema = PublicMutationContractSchemas.createSession.headers;
    assert.equal(operationSchema.safeParse({ contractVersion: 1, idempotencyKey: "operation:1" }).success, true);
    assert.equal(CoinOperationViewSchema.safeParse(operation).success, false);
    for (const boundary of ["9".repeat(78), `-${"9".repeat(78)}`]) {
      assert.equal(
        CoinOperationViewSchema.safeParse({
          ...operation,
          availableDelta: boundary,
        }).success,
        true,
      );
    }
    for (const overflow of ["9".repeat(79), `-${"9".repeat(79)}`]) {
      assert.equal(
        CoinOperationViewSchema.safeParse({
          ...operation,
          availableDelta: overflow,
        }).success,
        false,
      );
    }
    assert.equal(
      SessionHistoryEntrySchema.safeParse({
        gameId: "game_1",
        playerId: "player_1",
        result: "won",
        accountCoinDelta: "-0",
        finishedAtMs: 1,
      }).success,
      false,
    );
  });
});
