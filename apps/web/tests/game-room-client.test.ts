import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AdmissionResponseSchema,
  GameIdSchema,
  RealtimeTicketSchema,
  RequestIdSchema,
  type RoomAdmissionOptions,
  type RoomCommand,
} from "@pootown/game-contracts";

import {
  CommandRejectedError,
  GameRoomClient,
  type RoomTransport,
} from "../services/game-room-client.js";
import { openRoomConnection } from "../services/room-connection.js";

function fixture() {
  const state = {
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
  let messageHandler: ((type: string, message: unknown) => void) | undefined;
  let stateHandler:
    | ((state: { stateVersion: number; publicStateJson: string }) => void)
    | undefined;
  let errorHandler: ((code: number) => void) | undefined;
  let leaveHandler: ((code: number) => void) | undefined;
  const sent: Array<{ type: string; message: unknown }> = [];
  let leaves = 0;
  const room = {
    state: { stateVersion: 1, publicStateJson: JSON.stringify(state) },
    onMessage(_type: "*", handler: (type: string, message: unknown) => void) {
      messageHandler = handler;
    },
    onStateChange(handler: (wire: typeof room.state) => void) {
      stateHandler = handler;
    },
    onError(handler: (code: number) => void) {
      errorHandler = handler;
    },
    onLeave(handler: (code: number) => void) {
      leaveHandler = handler;
    },
    send(type: string, message: unknown) {
      sent.push({ type, message });
    },
    async leave() {
      leaves += 1;
    },
  } as unknown as RoomTransport;
  return {
    leaves: () => leaves,
    error: (code: number) => errorHandler?.(code),
    leave: (code: number) => leaveHandler?.(code),
    message: (value: unknown) => messageHandler?.("wire", value),
    room,
    sent,
    state,
    stateHandler,
  };
}

const admission = {
  contractVersion: 1,
  gameId: GameIdSchema.parse("game_1"),
  ticket: RealtimeTicketSchema.parse("A".repeat(43)),
} satisfies RoomAdmissionOptions;

const admissionResponse = AdmissionResponseSchema.parse({
  contractVersion: 1,
  session: {
    contractVersion: 1,
    gameId: "game_1",
    gameDefinitionId: "definition_1",
    roomId: "room_1",
    lifecycle: "open",
    currentPlayers: 1,
    maximumPlayers: 4,
    entryCoin: "100",
    createdAtMs: 1,
    startedAtMs: null,
    finishedAtMs: null,
    players: [{ playerId: "player_1", seatIndex: 0 }],
  },
  admission: {
    contractVersion: 1,
    gameId: "game_1",
    roomId: "room_1",
    reservationId: "reservation_1",
    playerId: "player_1",
    role: "player",
    ticket: "A".repeat(43),
    expiresAtMs: 2,
  },
});

describe("game room client", () => {
  it("passes the ticket only to admission and replaces state from strict canonical snapshots", async () => {
    const wire = fixture();
    const states: unknown[] = [];
    let capturedAdmission: RoomAdmissionOptions | undefined;
    const client = new GameRoomClient(
      async (options) => {
        capturedAdmission = options;
        return wire.room;
      },
      { onState: (state) => states.push(state) }
    );
    const initial = await client.connect(admission);
    assert.equal(initial.stateVersion, 1);
    assert.deepEqual(capturedAdmission, admission);
    assert.deepEqual(wire.sent, [{ type: "player.private.sync", message: {} }]);
    assert.equal(JSON.stringify(states).includes(admission.ticket), false);
  });

  it("waits for the Colyseus initial schema snapshot before validating it", async () => {
    const wire = fixture();
    const initialWire = { ...wire.room.state };
    Object.assign(wire.room.state, {
      publicStateJson: undefined,
      stateVersion: undefined,
    });
    setTimeout(() => Object.assign(wire.room.state, initialWire), 20);
    const client = new GameRoomClient(async () => wire.room);
    assert.equal((await client.connect(admission)).stateVersion, 1);
  });

  it("correlates acknowledgement and rejection without optimistic state", async () => {
    const wire = fixture();
    const client = new GameRoomClient(async () => wire.room);
    await openRoomConnection(client, admissionResponse, true);
    const requestId = RequestIdSchema.parse(
      "00000000-0000-4000-8000-000000000010"
    );
    const command = {
      requestId,
      expectedStateVersion: 1,
      type: "startGame",
      payload: {},
    } satisfies RoomCommand;
    const accepted = client.send(command);
    wire.message({
      type: "command.ack",
      requestId,
      stateVersion: 2,
      eventIds: [],
    });
    assert.equal((await accepted).stateVersion, 2);

    const rejectedId = RequestIdSchema.parse(
      "00000000-0000-4000-8000-000000000011"
    );
    const rejected = client.send({
      ...command,
      requestId: rejectedId,
      expectedStateVersion: 2,
    });
    wire.message({
      type: "command.reject",
      requestId: rejectedId,
      stateVersion: 2,
      code: "STALE_STATE_VERSION",
      message: "State version is stale",
      retryable: true,
    });
    await assert.rejects(
      rejected,
      (error: unknown) =>
        error instanceof CommandRejectedError &&
        error.rejection.code === "STALE_STATE_VERSION"
    );
  });

  it("fails closed on corrupt or version-mismatched room state", async () => {
    for (const state of [
      { stateVersion: 1, publicStateJson: "not-json" },
      { stateVersion: 2, publicStateJson: JSON.stringify(fixture().state) },
    ]) {
      const wire = fixture();
      Object.assign(wire.room.state, state);
      const client = new GameRoomClient(async () => wire.room);
      await assert.rejects(client.connect(admission), /Room state is invalid/);
      assert.equal(wire.leaves(), 1);
    }
  });

  it("replays a pending command with the same request ID after an unexpected disconnect", async () => {
    const first = fixture();
    const second = fixture();
    let connection = 0;
    const client = new GameRoomClient(async () =>
      connection++ === 0 ? first.room : second.room
    );
    await openRoomConnection(client, admissionResponse, true);
    const requestId = RequestIdSchema.parse(
      "00000000-0000-4000-8000-000000000012"
    );
    const pending = client.send({
      requestId,
      expectedStateVersion: 1,
      type: "startGame",
      payload: {},
    });
    first.leave(1006);
    await openRoomConnection(client, admissionResponse, false);
    assert.deepEqual(
      second.sent.map((item) => item.type),
      ["player.private.sync", "command"]
    );
    assert.equal((second.sent[1]?.message as RoomCommand).requestId, requestId);
    second.message({
      type: "command.ack",
      requestId,
      stateVersion: 2,
      eventIds: [],
    });
    assert.equal((await pending).stateVersion, 2);

    const explicit = client.send({
      requestId: RequestIdSchema.parse("00000000-0000-4000-8000-000000000015"),
      expectedStateVersion: 2,
      type: "endTurn",
      payload: {},
    });
    await client.disconnect();
    await assert.rejects(explicit, /disconnected/);
  });

  it("fences stale transports and cancels an in-flight connection", async () => {
    const first = fixture();
    const second = fixture();
    const connectionResolvers: Array<(room: RoomTransport) => void> = [];
    const client = new GameRoomClient(
      () =>
        new Promise<RoomTransport>((resolve) => {
          connectionResolvers.push(resolve);
        })
    );
    const connecting = client.connect(admission);
    await client.disconnect();
    const reconnecting = client.connect(admission);
    connectionResolvers[0]?.(first.room);
    await assert.rejects(connecting, /cancelled/);
    assert.equal(first.leaves(), 1);
    connectionResolvers[1]?.(second.room);
    await reconnecting;
    await client.disconnect();

    const states: number[] = [];
    let connection = 0;
    const observed = new GameRoomClient(
      async () => (connection++ === 0 ? first.room : second.room),
      {
        onState: (state) => states.push(state.stateVersion),
      }
    );
    await observed.connect(admission);
    await observed.disconnect();
    await observed.connect(admission);
    const newerState = { ...first.state, stateVersion: 2 };
    first.stateHandler?.({
      stateVersion: 2,
      publicStateJson: JSON.stringify(newerState),
    });
    first.leave(1006);
    assert.deepEqual(states, [1, 1]);
  });

  it("rejects pending work on transport errors and closes malformed protocol messages", async () => {
    const wire = fixture();
    let protocolErrors = 0;
    const client = new GameRoomClient(async () => wire.room, {
      onProtocolError: () => {
        protocolErrors += 1;
      },
    });
    await client.connect(admission);
    const command = {
      requestId: RequestIdSchema.parse("00000000-0000-4000-8000-000000000013"),
      expectedStateVersion: 1,
      type: "startGame",
      payload: {},
    } satisfies RoomCommand;
    const transportFailure = client.send(command);
    wire.error(4503);
    await assert.rejects(transportFailure, /Room command failed/);

    const malformed = client.send({
      ...command,
      requestId: RequestIdSchema.parse("00000000-0000-4000-8000-000000000014"),
    });
    wire.message({
      type: "command.ack",
      requestId: "forged",
      stateVersion: -1,
      eventIds: [],
    });
    await assert.rejects(malformed, /Room protocol is invalid/);
    assert.equal(protocolErrors, 1);
    assert.equal(wire.leaves(), 1);
  });
});
