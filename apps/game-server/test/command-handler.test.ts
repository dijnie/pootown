import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGameplaySnapshot } from "@pootown/game-core";
import { RoomCommandSchema, type CommandAcknowledgement } from "@pootown/game-contracts";
import { InternalGameplayCommandSchema } from "@pootown/game-contracts/internal";

import type { AuthenticatedRoomPlayer } from "../src/auth/ticket-auth.js";
import {
  InvalidRoomCommandError,
  RoomCommandHandler,
  type RoomCommandStore,
} from "../src/commands/command-handler.js";
import type { CommandCommit } from "../src/persistence/command-repository.js";
import type { RoomLease } from "../src/persistence/room-lease.js";
import { SecureRandomSource } from "../src/random/secure-random-source.js";
import { createWaitingState } from "../src/rooms/bootstrap-state.js";

const lease: RoomLease = {
  roomId: "room_handler",
  gameId: "game_handler",
  instanceId: "handler-instance:boot",
  leaseUntil: new Date("2026-08-11T21:01:00.000Z"),
  fencingToken: 1n,
};

const owner: AuthenticatedRoomPlayer = Object.freeze({
  gameId: lease.gameId,
  playerId: "player_owner",
  reservationId: "reservation_owner",
  role: "player",
  roomId: lease.roomId,
  seatIndex: 0,
  userId: "user_owner",
});

const second: AuthenticatedRoomPlayer = Object.freeze({
  gameId: lease.gameId,
  playerId: "player_second",
  reservationId: "reservation_second",
  role: "player",
  roomId: lease.roomId,
  seatIndex: 1,
  userId: "user_second",
});

const bootstrap = {
  contractVersion: 1 as const,
  gameId: lease.gameId as never,
  gameDefinitionId: "classic_100" as never,
  gameDefinitionVersion: 1,
  rulesetId: "pootown-rust-source-v1" as const,
  roomId: lease.roomId as never,
  lifecycle: "open" as const,
  stateVersion: 0,
  creatorPlayerId: owner.playerId as never,
  maximumPlayers: 4,
  timeLimitMs: 3_600_000,
  createdAtMs: Date.parse("2026-08-11T21:00:00.000Z"),
  startedAtMs: null,
  players: [
    { playerId: owner.playerId as never, seatIndex: 0, joinedAtMs: Date.parse("2026-08-11T21:00:00.000Z") },
    { playerId: second.playerId as never, seatIndex: 1, joinedAtMs: Date.parse("2026-08-11T21:00:00.001Z") },
  ],
};

class FakeStore implements RoomCommandStore {
  public readonly commits: CommandCommit[] = [];
  public replay: CommandAcknowledgement | null = null;
  public commitStarted = false;

  public async findReplay(): Promise<CommandAcknowledgement | null> {
    return this.replay;
  }

  public async commit(_lease: RoomLease, value: CommandCommit) {
    this.commitStarted = true;
    this.commits.push(value);
    return { acknowledgement: value.acknowledgement as CommandAcknowledgement, duplicate: false };
  }
}

function waitingState() {
  return createWaitingState(bootstrap, new SecureRandomSource(Buffer.alloc(32, 4)));
}

function creatorOnlyWaitingState() {
  return createWaitingState({ ...bootstrap, players: [bootstrap.players[0]!] }, new SecureRandomSource(Buffer.alloc(32, 4)));
}

describe("server-authoritative room command handler", () => {
  it("persists an API-authorized late admission before socket attachment", async () => {
    const store = new FakeStore();
    const handler = new RoomCommandHandler({ initialState: creatorOnlyWaitingState(), lease, store });
    const events = await handler.ensureAdmittedPlayer(second, bootstrap.players[1]!.joinedAtMs);
    assert.equal(events[0]?.payload.type, "playerJoined");
    const state = handler.currentState();
    assert.equal("seats" in state && state.seats[1]?.playerId, second.playerId);
    assert.equal(store.commits.length, 1);
    assert.equal(RoomCommandSchema.parse(store.commits[0]?.command).type, "joinGame");
    assert.equal(store.commits[0]?.stateVersion, 2);
  });

  it("commits a full started checkpoint before publishing state and events", async () => {
    const store = new FakeStore();
    let published = false;
    const handler = new RoomCommandHandler({
      initialState: waitingState(),
      lease,
      nowMs: () => Date.parse("2026-08-11T21:00:01.000Z"),
      store,
      onCommitted(state, acknowledgement, events) {
        assert.equal(store.commitStarted, true);
        assert.equal("players" in state, true);
        assert.equal(acknowledgement.stateVersion, 2);
        assert.equal(events[0]?.payload.type, "gameStarted");
        published = true;
      },
    });
    const result = await handler.handle(owner, {
      requestId: "00000000-0000-4000-8000-000000000201",
      expectedStateVersion: 1,
      type: "startGame",
      payload: {},
    });
    assert.equal(result.accepted, true);
    assert.equal(published, true);
    assert.equal(store.commits.length, 1);
    assert.equal(parseGameplaySnapshot(store.commits[0]!.serializedState).stateVersion, 2);
    assert.equal("players" in handler.currentState(), true);
  });

  it("returns an exact stored acknowledgement before stale-version evaluation", async () => {
    const store = new FakeStore();
    store.replay = {
      type: "command.ack",
      requestId: "00000000-0000-4000-8000-000000000202" as never,
      stateVersion: 9,
      eventIds: [],
    };
    const handler = new RoomCommandHandler({ initialState: waitingState(), lease, store });
    const result = await handler.handle(owner, {
      requestId: store.replay.requestId,
      expectedStateVersion: 0,
      type: "startGame",
      payload: {},
    });
    assert.equal(result.accepted && result.replayed, true);
    assert.equal(store.commits.length, 0);
    assert.equal(handler.currentState().stateVersion, 1);
  });

  it("persists the authenticated reservation binding with leave and cancel commands", async () => {
    const leaveStore = new FakeStore();
    const nowMs = () => Date.parse("2026-08-11T21:00:01.000Z");
    const leaveHandler = new RoomCommandHandler({ initialState: waitingState(), lease, nowMs, store: leaveStore });
    const left = await leaveHandler.handle(second, {
      requestId: "00000000-0000-4000-8000-000000000212",
      expectedStateVersion: 1,
      type: "leaveGame",
      payload: {},
    });
    assert.equal(left.accepted, true);
    assert.equal(leaveStore.commits[0]?.sessionFinalization?.action, "leave");
    assert.equal(leaveStore.commits[0]?.sessionFinalization?.reservationId, second.reservationId);
    assert.match(leaveStore.commits[0]?.sessionFinalization?.idempotencyKey ?? "", /^realtime-finalize-[a-f0-9]{64}$/);

    const cancelStore = new FakeStore();
    const cancelHandler = new RoomCommandHandler({ initialState: waitingState(), lease, nowMs, store: cancelStore });
    const cancelled = await cancelHandler.handle(owner, {
      requestId: "00000000-0000-4000-8000-000000000213",
      expectedStateVersion: 1,
      type: "cancelGame",
      payload: {},
    });
    assert.equal(cancelled.accepted, true);
    assert.equal(cancelStore.commits[0]?.sessionFinalization?.action, "cancel");
    assert.equal(cancelStore.commits[0]?.sessionFinalization?.reservationId, owner.reservationId);
    assert.match(cancelStore.commits[0]?.sessionFinalization?.idempotencyKey ?? "", /^realtime-finalize-[a-f0-9]{64}$/);
  });

  it("rejects unauthorized, stale, and malformed commands without mutation", async () => {
    const store = new FakeStore();
    const handler = new RoomCommandHandler({
      initialState: waitingState(),
      lease,
      nowMs: () => Date.parse("2026-08-11T21:00:01.000Z"),
      store,
    });
    const original = handler.currentState();
    const unauthorized = await handler.handle(second, {
      requestId: "00000000-0000-4000-8000-000000000203",
      expectedStateVersion: 1,
      type: "startGame",
      payload: {},
    });
    assert.equal(!unauthorized.accepted && unauthorized.rejection.code, "UNAUTHORIZED_ACTOR");
    const malformed = await handler.handle(owner, {
      requestId: "00000000-0000-4000-8000-000000000204",
      expectedStateVersion: 1,
      type: "rollDice",
      payload: { forgedDice: [6, 6] },
    });
    assert.equal(!malformed.accepted && malformed.rejection.code, "INVALID_COMMAND");
    await assert.rejects(handler.handle(owner, { type: "rollDice", payload: {} }), InvalidRoomCommandError);
    assert.equal(handler.currentState(), original);
    assert.equal(store.commits.length, 0);
  });

  it("serializes commands from one revision so only the first can commit", async () => {
    const store = new FakeStore();
    const handler = new RoomCommandHandler({
      initialState: waitingState(),
      lease,
      nowMs: () => Date.parse("2026-08-11T21:00:01.000Z"),
      store,
    });
    const started = await handler.handle(owner, {
      requestId: "00000000-0000-4000-8000-000000000205",
      expectedStateVersion: 1,
      type: "startGame",
      payload: {},
    });
    assert.equal(started.accepted, true);
    const [first, secondResult] = await Promise.all([
      handler.handle(owner, {
        requestId: "00000000-0000-4000-8000-000000000206",
        expectedStateVersion: 2,
        type: "rollDice",
        payload: {},
      }),
      handler.handle(owner, {
        requestId: "00000000-0000-4000-8000-000000000207",
        expectedStateVersion: 2,
        type: "rollDice",
        payload: {},
      }),
    ]);
    assert.equal(first.accepted, true);
    assert.equal(!secondResult.accepted && secondResult.rejection.code, "STALE_STATE_VERSION");
    assert.equal(store.commits.length, 2);
    assert.equal(handler.currentState().stateVersion, 3);
  });

  it("commits trusted timer commands with the internal actor before publication", async () => {
    const store = new FakeStore();
    let nowMs = Date.parse("2026-08-11T21:00:01.000Z");
    const handler = new RoomCommandHandler({
      initialState: waitingState(),
      lease,
      nowMs: () => nowMs,
      store,
    });
    const started = await handler.handle(owner, {
      requestId: "00000000-0000-4000-8000-000000000208",
      expectedStateVersion: 1,
      type: "startGame",
      payload: {},
    });
    assert.equal(started.accepted, true);
    nowMs += 60_000;
    const warning = await handler.handleInternal({
      requestId: "00000000-0000-4000-8000-000000000209",
      expectedStateVersion: 2,
      type: "warnTurnThirtySeconds",
      payload: {},
    });
    assert.equal(warning.accepted, true, JSON.stringify(warning));
    assert.equal(warning.accepted && warning.events[0]?.payload.type, "timeoutWarning");
    assert.equal(store.commits[1]?.playerId, "system_timer");
    assert.equal(InternalGameplayCommandSchema.parse(store.commits[1]?.command).type, "warnTurnThirtySeconds");
    assert.equal(handler.currentState().stateVersion, 3);
  });

  it("stores terminal proof in the same commit as a finished checkpoint", async () => {
    const store = new FakeStore();
    let nowMs = Date.parse("2026-08-11T21:00:01.000Z");
    const handler = new RoomCommandHandler({ initialState: waitingState(), lease, nowMs: () => nowMs, store });
    const started = await handler.handle(owner, {
      requestId: "00000000-0000-4000-8000-000000000210",
      expectedStateVersion: 1,
      type: "startGame",
      payload: {},
    });
    assert.equal(started.accepted, true);
    nowMs += 3_600_000;
    const finished = await handler.handleInternal({
      requestId: "00000000-0000-4000-8000-000000000211",
      expectedStateVersion: 2,
      type: "enforceGameTimeLimit",
      payload: {},
    });
    assert.equal(finished.accepted, true, JSON.stringify(finished));
    assert.equal("players" in handler.currentState() && handler.currentState().lifecycle, "finished");
    assert.equal(store.commits[1]?.terminalProof?.endReason, "timeLimit");
    assert.match(store.commits[1]?.terminalProof?.winnerPlayerId ?? "", /^player_/);
  });
});
