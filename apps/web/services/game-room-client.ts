import {
  CommandAcknowledgementSchema,
  CommandRejectionSchema,
  GameplayPublicStateSchema,
  PublicGameStateSchema,
  RoomAdmissionOptionsSchema,
  RoomCommandSchema,
  ServerMessageSchema,
  type CommandAcknowledgement,
  type CommandRejection,
  type RoomAdmissionOptions,
  type RoomCommand,
  type ServerMessage,
} from "@pootown/game-contracts";

type RoomWireState = {
  publicStateJson: string;
  stateVersion: number;
};

export type RoomPublicState =
  | ReturnType<typeof PublicGameStateSchema.parse>
  | ReturnType<typeof GameplayPublicStateSchema.parse>;

export type RoomTransport = {
  leave(consented?: boolean): Promise<unknown>;
  onError(handler: (code: number, message?: string) => void): unknown;
  onLeave(handler: (code: number) => void): unknown;
  onMessage(type: "*", handler: (type: string | number, message: unknown) => void): unknown;
  onStateChange(handler: (state: RoomWireState) => void): unknown;
  send(type: string, message: unknown): void;
  state: RoomWireState;
};

export type RoomConnector = (options: RoomAdmissionOptions) => Promise<RoomTransport>;

export type GameRoomClientHandlers = {
  onMessage?: (message: ServerMessage) => void;
  onProtocolError?: () => void;
  onState?: (state: RoomPublicState) => void;
  onTransportError?: (code: number) => void;
  onUnexpectedDisconnect?: (code: number) => void;
};

type PendingCommand = {
  reject: (error: Error) => void;
  resolve: (acknowledgement: CommandAcknowledgement) => void;
};

export class CommandRejectedError extends Error {
  public constructor(public readonly rejection: CommandRejection) {
    super(rejection.message);
    this.name = "CommandRejectedError";
  }
}

export class RoomTransportError extends Error {
  public constructor(public readonly code: number) {
    super("Room command failed");
    this.name = "RoomTransportError";
  }
}

function parsePublicState(wire: RoomWireState): RoomPublicState {
  let decoded: unknown;
  try {
    decoded = JSON.parse(wire.publicStateJson);
  } catch {
    throw new Error("Room state is invalid");
  }
  const lifecycle = PublicGameStateSchema.safeParse(decoded);
  const gameplay = lifecycle.success ? null : GameplayPublicStateSchema.safeParse(decoded);
  const state = lifecycle.success ? lifecycle.data : gameplay?.success === true ? gameplay.data : null;
  if (state === null || state.stateVersion !== wire.stateVersion) {
    throw new Error("Room state is invalid");
  }
  return state;
}

export function createColyseusRoomConnector(endpoint: string): RoomConnector {
  const parsed = new URL(endpoint);
  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") ||
      parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") {
    throw new Error("Game server endpoint must be a safe WebSocket URL");
  }
  const client = import("@colyseus/sdk").then(({ Client }) =>
    new Client(parsed.toString().replace(/\/$/, "")));
  return async (rawOptions) => {
    const options = RoomAdmissionOptionsSchema.parse(rawOptions);
    return (await client).joinOrCreate<RoomWireState>("game", options) as unknown as RoomTransport;
  };
}

export class GameRoomClient {
  private connectingGeneration: number | null = null;
  private generation = 0;
  private room: RoomTransport | null = null;
  private readonly pending = new Map<string, PendingCommand>();

  public constructor(
    private readonly connector: RoomConnector,
    private readonly handlers: GameRoomClientHandlers = {},
  ) {}

  public async connect(rawOptions: RoomAdmissionOptions): Promise<RoomPublicState> {
    if (this.room !== null || this.connectingGeneration !== null) {
      throw new Error("Room client is already connected");
    }
    const options = RoomAdmissionOptionsSchema.parse(rawOptions);
    const generation = ++this.generation;
    this.connectingGeneration = generation;
    let room: RoomTransport;
    try {
      room = await this.connector(options);
    } finally {
      if (this.connectingGeneration === generation) this.connectingGeneration = null;
    }
    if (generation !== this.generation) {
      await room.leave(true).catch(() => undefined);
      throw new Error("Room connection was cancelled");
    }
    let state: RoomPublicState;
    try {
      state = parsePublicState(room.state);
    } catch (error) {
      await room.leave(true).catch(() => undefined);
      throw error;
    }
    this.room = room;
    const publishState = (wire: RoomWireState) => {
      if (!this.isActive(room, generation)) return;
      try {
        const nextState = parsePublicState(wire);
        try {
          this.handlers.onState?.(nextState);
        } catch {
          // Consumer rendering errors do not change the verified room protocol state.
        }
      } catch {
        this.terminateProtocol(room, generation);
      }
    };
    room.onStateChange(publishState);
    room.onMessage("*", (_type: string | number, rawMessage: unknown) => {
      if (!this.isActive(room, generation)) return;
      this.handleMessage(rawMessage, room, generation);
    });
    room.onError((code: number) => {
      if (!this.isActive(room, generation)) return;
      this.rejectPending(new RoomTransportError(code));
      try {
        this.handlers.onTransportError?.(code);
      } catch {
        // Operational UI callbacks cannot alter room ownership.
      }
    });
    room.onLeave((code: number) => {
      if (!this.isActive(room, generation)) return;
      this.room = null;
      this.generation += 1;
      this.rejectPending(new Error("Room disconnected before command result"));
      if (code !== 1000) {
        try {
          this.handlers.onUnexpectedDisconnect?.(code);
        } catch {
          // Operational UI callbacks cannot alter room ownership.
        }
      }
    });
    try {
      this.handlers.onState?.(state);
    } catch {
      // Consumer rendering errors do not change the verified room protocol state.
    }
    if (!this.isActive(room, generation)) throw new Error("Room connection was cancelled");
    room.send("player.private.sync", {});
    return state;
  }

  public send(rawCommand: RoomCommand): Promise<CommandAcknowledgement> {
    if (this.room === null) return Promise.reject(new Error("Room client is not connected"));
    const command = RoomCommandSchema.parse(rawCommand);
    if (this.pending.has(command.requestId)) {
      return Promise.reject(new Error("Command request is already pending"));
    }
    const pending = new Promise<CommandAcknowledgement>((resolve, rejectError) => {
      this.pending.set(command.requestId, {
        resolve,
        reject: rejectError,
      });
    });
    this.room.send("command", command);
    return pending;
  }

  public async disconnect(): Promise<void> {
    this.generation += 1;
    this.connectingGeneration = null;
    const room = this.room;
    this.room = null;
    this.rejectPending(new Error("Room client disconnected"));
    if (room !== null) await room.leave(true);
  }

  private handleMessage(rawMessage: unknown, room: RoomTransport, generation: number): void {
    const parsed = ServerMessageSchema.safeParse(rawMessage);
    if (!parsed.success) {
      this.terminateProtocol(room, generation);
      return;
    }
    const message = parsed.data;
    if (message.type === "command.ack") {
      const acknowledgement = CommandAcknowledgementSchema.parse(message);
      const pending = this.pending.get(acknowledgement.requestId);
      if (pending === undefined) return;
      this.pending.delete(acknowledgement.requestId);
      pending.resolve(acknowledgement);
    } else if (message.type === "command.reject") {
      const rejection = CommandRejectionSchema.parse(message);
      const pending = this.pending.get(rejection.requestId);
      if (pending === undefined) return;
      this.pending.delete(rejection.requestId);
      pending.reject(new CommandRejectedError(rejection));
    }
    try {
      this.handlers.onMessage?.(message);
    } catch {
      // Consumer effects cannot break protocol processing.
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private isActive(room: RoomTransport, generation: number): boolean {
    return this.room === room && this.generation === generation;
  }

  private terminateProtocol(room: RoomTransport, generation: number): void {
    if (!this.isActive(room, generation)) return;
    this.room = null;
    this.generation += 1;
    this.rejectPending(new Error("Room protocol is invalid"));
    try {
      this.handlers.onProtocolError?.();
    } catch {
      // Operational UI callbacks cannot alter room ownership.
    }
    void room.leave(true).catch(() => undefined);
  }
}
