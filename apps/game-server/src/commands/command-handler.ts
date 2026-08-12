import {
  CommandRejectionSchema,
  DomainEventEnvelopeSchema,
  GameplayDomainEventEnvelopeSchema,
  GameplayEventPayloadSchema,
  RequestIdSchema,
  RoomCommandSchema,
  type CommandAcknowledgement,
  type CommandRejection,
  type DomainEventEnvelope,
  type GameplayDomainEventEnvelope,
  type PlayerGameplayCommand,
  type RoomCommand,
} from "@pootown/game-contracts";
import {
  InternalGameplayCommandSchema,
  type InternalGameplayCommand,
} from "@pootown/game-contracts/internal";
import {
  initializeGameplayAggregate,
  gameId,
  matchCash,
  playerId,
  serializeGameplaySnapshot,
  serializeSnapshot,
  transition,
  transitionGameplay,
  type DomainEvent,
  type GameCoreError,
  type GameCommand,
  type GameState,
  type GameplayAggregateState,
  type GameplayCommand,
  type GameplayDomainEvent,
  type RandomSource,
} from "@pootown/game-core";

import type { AuthenticatedRoomPlayer } from "../auth/ticket-auth.js";
import type {
  CommandCommit,
  CommandCommitResult,
  CommandRepository,
} from "../persistence/command-repository.js";
import type { RoomLease } from "../persistence/room-lease.js";
import { sessionFinalizationIdempotencyKey } from "./session-finalization.js";
import { SecureRandomSource } from "../random/secure-random-source.js";

export interface RoomCommandStore {
  findReplay(
    lease: RoomLease,
    playerId: string,
    command: unknown,
    now?: Date,
  ): Promise<CommandAcknowledgement | null>;
  commit(lease: RoomLease, value: CommandCommit, now?: Date): Promise<CommandCommitResult>;
}

export type RoomCommandHandlingResult =
  | {
      readonly accepted: true;
      readonly acknowledgement: CommandAcknowledgement;
      readonly events: readonly (DomainEventEnvelope | GameplayDomainEventEnvelope)[];
      readonly replayed: boolean;
    }
  | { readonly accepted: false; readonly rejection: CommandRejection };

export interface RoomCommandHandlerOptions {
  readonly initialState: GameState | GameplayAggregateState;
  readonly initialCommittedAtMs?: number;
  readonly lease: RoomLease;
  readonly nowMs?: () => number;
  readonly onCommitted?: (
    state: GameState | GameplayAggregateState,
    acknowledgement: CommandAcknowledgement,
    events: readonly (DomainEventEnvelope | GameplayDomainEventEnvelope)[],
  ) => void;
  readonly store: RoomCommandStore | CommandRepository;
}

export class InvalidRoomCommandError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidRoomCommandError";
  }
}

function isGameplayState(state: GameState | GameplayAggregateState): state is GameplayAggregateState {
  return "players" in state;
}

type LifecycleRoomCommand = Extract<RoomCommand, {
  type: "createGame" | "joinGame" | "leaveGame" | "cancelGame" | "startGame";
}>;

function isLifecycleCommand(command: RoomCommand): command is LifecycleRoomCommand {
  return command.type === "createGame" || command.type === "joinGame" ||
    command.type === "leaveGame" || command.type === "cancelGame" || command.type === "startGame";
}

function coreLifecycleCommand(command: LifecycleRoomCommand): GameCommand {
  if (command.type === "createGame") {
    return {
      type: command.type,
      expectedStateVersion: command.expectedStateVersion,
      payload: { ...command.payload, gameId: gameId(command.payload.gameId) },
    };
  }
  return {
    type: command.type,
    expectedStateVersion: command.expectedStateVersion,
    payload: command.payload,
  };
}

function rejection(
  requestId: string,
  stateVersion: number,
  error: GameCoreError,
): CommandRejection {
  return CommandRejectionSchema.parse({
    type: "command.reject",
    requestId,
    stateVersion,
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  });
}

function invalidCommand(raw: unknown, stateVersion: number): RoomCommandHandlingResult {
  const requestId = RequestIdSchema.safeParse(
    typeof raw === "object" && raw !== null && !Array.isArray(raw) && "requestId" in raw
      ? raw.requestId
      : undefined,
  );
  if (!requestId.success) throw new InvalidRoomCommandError("Room command has no valid request ID");
  return {
    accepted: false,
    rejection: rejection(requestId.data, stateVersion, {
      code: "INVALID_COMMAND",
      message: "Room command payload is invalid",
      retryable: false,
    }),
  };
}

function coreGameplayCommand(command: PlayerGameplayCommand): GameplayCommand {
  if (command.type !== "createTrade") {
    return {
      type: command.type,
      expectedStateVersion: command.expectedStateVersion,
      payload: command.payload,
    } as GameplayCommand;
  }
  const { receiverId, ...terms } = command.payload;
  const convertedTerms = terms.tradeType === "moneyOnly"
    ? { ...terms, offeredCash: matchCash(BigInt(terms.offeredCash)), requestedCash: matchCash(BigInt(terms.requestedCash)) }
    : terms.tradeType === "moneyForProperty"
      ? { ...terms, offeredCash: matchCash(BigInt(terms.offeredCash)) }
      : terms.tradeType === "propertyForMoney"
        ? { ...terms, requestedCash: matchCash(BigInt(terms.requestedCash)) }
        : terms;
  return {
    type: command.type,
    expectedStateVersion: command.expectedStateVersion,
    payload: { receiverId: playerId(receiverId), terms: convertedTerms },
  } as GameplayCommand;
}

function wireValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(wireValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, wireValue(nested)]));
  }
  return value;
}

function gameplayPayload(
  event: GameplayDomainEvent,
  state: GameplayAggregateState,
): ReturnType<typeof GameplayEventPayloadSchema.parse> {
  if (event.type === "diceRolled") {
    return GameplayEventPayloadSchema.parse({
      ...event,
      dice: {
        dieOne: event.dice.dice[0],
        dieTwo: event.dice.dice[1],
        total: event.dice.total,
        isDoubles: event.dice.isDoubles,
      },
    });
  }
  if (event.type === "gameEnded") {
    return GameplayEventPayloadSchema.parse({
      ...event,
      ranking: event.ranking.map((entry) => {
        const rankedPlayer = state.players[entry.seatIndex];
        if (rankedPlayer === null || rankedPlayer === undefined) {
          throw new InvalidRoomCommandError("Terminal event references an empty seat");
        }
        return { ...entry, playerId: rankedPlayer.playerId, netWorth: entry.netWorth.toString() };
      }),
    });
  }
  return GameplayEventPayloadSchema.parse(wireValue(event));
}

function eventId(requestId: string, index: number): string {
  return `evt_${requestId.replaceAll("-", "")}_${index}`;
}

function lifecycleEvents(
  events: readonly DomainEvent[],
  requestId: string,
  stateVersion: number,
  occurredAtMs: number,
): readonly DomainEventEnvelope[] {
  return events.map((payload, index) => DomainEventEnvelopeSchema.parse({
    type: "domain.event",
    eventId: eventId(requestId, index),
    stateVersion,
    occurredAtMs,
    payload,
  }));
}

function gameplayEvents(
  events: readonly GameplayDomainEvent[],
  state: GameplayAggregateState,
  requestId: string,
  occurredAtMs: number,
): readonly GameplayDomainEventEnvelope[] {
  return events.map((event, index) => GameplayDomainEventEnvelopeSchema.parse({
    type: "domain.event",
    eventId: eventId(requestId, index),
    gameId: state.gameId,
    stateVersion: state.stateVersion,
    occurredAtMs,
    payload: gameplayPayload(event, state),
  }));
}

function resumableRandomSource(state: GameState | GameplayAggregateState): RandomSource | null {
  return new SecureRandomSource().fork(state.rng);
}

function terminalProof(state: GameState | GameplayAggregateState): CommandCommit["terminalProof"] {
  if (!isGameplayState(state) || state.lifecycle !== "finished") return undefined;
  const winner = state.players[state.terminal.winnerSeatIndex];
  if (winner === null || winner === undefined) {
    throw new InvalidRoomCommandError("Terminal winner is unavailable");
  }
  return { endReason: state.terminal.reason, winnerPlayerId: winner.playerId };
}

function committedTimestampFloor(state: GameState | GameplayAggregateState): number {
  if (isGameplayState(state)) {
    return state.lifecycle === "finished"
      ? Math.max(state.startedAtMs, state.terminal.endedAtMs)
      : Math.max(state.startedAtMs, state.turn.startedAtMs);
  }
  return Math.max(
    state.createdAtMs,
    state.startedAtMs ?? state.createdAtMs,
    state.cancelledAtMs ?? state.createdAtMs,
    ...state.seats.flatMap((seat) => seat === null ? [] : [seat.joinedAtMs]),
  );
}

export class RoomCommandHandler {
  private state: GameState | GameplayAggregateState;
  private committedAtMs: number;
  private queue: Promise<void> = Promise.resolve();

  public constructor(private readonly options: RoomCommandHandlerOptions) {
    this.state = options.initialState;
    const initialFloor = options.initialCommittedAtMs ?? committedTimestampFloor(options.initialState);
    if (!Number.isSafeInteger(initialFloor) || initialFloor < committedTimestampFloor(options.initialState)) {
      throw new InvalidRoomCommandError("Initial committed timestamp is invalid");
    }
    this.committedAtMs = initialFloor;
  }

  public handle(
    authenticated: AuthenticatedRoomPlayer,
    rawCommand: unknown,
  ): Promise<RoomCommandHandlingResult> {
    const work = this.queue.then(
      () => this.handleSerial(authenticated, rawCommand),
      () => this.handleSerial(authenticated, rawCommand),
    );
    this.queue = work.then(() => undefined, () => undefined);
    return work;
  }

  public handleInternal(rawCommand: unknown): Promise<RoomCommandHandlingResult> {
    const work = this.queue.then(
      () => this.handleInternalSerial(rawCommand),
      () => this.handleInternalSerial(rawCommand),
    );
    this.queue = work.then(() => undefined, () => undefined);
    return work;
  }

  public ensureAdmittedPlayer(
    authenticated: AuthenticatedRoomPlayer,
    joinedAtMs: number,
  ): Promise<readonly DomainEventEnvelope[]> {
    const work = this.queue.then(
      () => this.ensureAdmittedPlayerSerial(authenticated, joinedAtMs),
      () => this.ensureAdmittedPlayerSerial(authenticated, joinedAtMs),
    );
    this.queue = work.then(() => undefined, () => undefined);
    return work;
  }

  public currentState(): GameState | GameplayAggregateState {
    return this.state;
  }

  private commandTimestampMs(): number {
    const timestamp = this.options.nowMs?.() ?? Date.now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new InvalidRoomCommandError("Room clock returned an invalid timestamp");
    }
    return Math.max(timestamp, committedTimestampFloor(this.state), this.committedAtMs);
  }

  private async ensureAdmittedPlayerSerial(
    authenticated: AuthenticatedRoomPlayer,
    joinedAtMs: number,
  ): Promise<readonly DomainEventEnvelope[]> {
    if (!Number.isSafeInteger(joinedAtMs) || joinedAtMs < 0) {
      throw new InvalidRoomCommandError("Admission time is invalid");
    }
    const players = isGameplayState(this.state) ? this.state.players : this.state.seats;
    const currentSeat = players[authenticated.seatIndex];
    if (currentSeat?.playerId === authenticated.playerId) return [];
    if (currentSeat !== null && currentSeat !== undefined) {
      throw new InvalidRoomCommandError("Admission seat is occupied by another player");
    }
    if (players.some((candidate) => candidate?.playerId === authenticated.playerId)) {
      throw new InvalidRoomCommandError("Admission player is bound to another seat");
    }
    if (isGameplayState(this.state) || this.state.lifecycle !== "waitingForPlayers") {
      throw new InvalidRoomCommandError("Admission player is missing from a started room");
    }
    const randomSource = resumableRandomSource(this.state);
    if (randomSource === null) throw new InvalidRoomCommandError("Room random checkpoint cannot be resumed");
    const requestId = admissionRequestId(authenticated);
    const command = RoomCommandSchema.parse({
      requestId,
      expectedStateVersion: this.state.stateVersion,
      type: "joinGame",
      payload: {},
    });
    const replay = await this.options.store.findReplay(
      this.options.lease,
      authenticated.playerId,
      command,
    );
    if (replay !== null) {
      throw new InvalidRoomCommandError("Admission checkpoint is behind its committed command");
    }
    const committedAtMs = Math.max(joinedAtMs, this.committedAtMs, committedTimestampFloor(this.state));
    const result = transition(this.state, coreLifecycleCommand(command as LifecycleRoomCommand), {
      actorId: playerId(authenticated.playerId),
      nowMs: joinedAtMs,
      randomSource,
    });
    if (!result.ok || result.state === null || result.state.lifecycle !== "waitingForPlayers") {
      throw new InvalidRoomCommandError(result.ok ? "Admission produced an invalid room state" : result.error.message);
    }
    if (result.state.seats[authenticated.seatIndex]?.playerId !== authenticated.playerId) {
      throw new InvalidRoomCommandError("Core admission seat does not match API authority");
    }
    const events = lifecycleEvents(result.events, requestId, result.state.stateVersion, committedAtMs);
    const acknowledgement: CommandAcknowledgement = {
      type: "command.ack",
      requestId: command.requestId,
      stateVersion: result.state.stateVersion,
      eventIds: events.map((event) => event.eventId),
    };
    const committed = await this.options.store.commit(this.options.lease, {
      acknowledgement,
      events,
      playerId: authenticated.playerId,
      command,
      serializedState: serializeSnapshot(result.state),
      stateVersion: result.state.stateVersion,
    });
    if (committed.duplicate) {
      throw new InvalidRoomCommandError("Admission checkpoint did not restore a committed duplicate");
    }
    this.state = result.state;
    this.committedAtMs = committedAtMs;
    this.options.onCommitted?.(result.state, acknowledgement, events);
    return events;
  }

  private async handleSerial(
    authenticated: AuthenticatedRoomPlayer,
    rawCommand: unknown,
  ): Promise<RoomCommandHandlingResult> {
    const parsed = RoomCommandSchema.safeParse(rawCommand);
    if (!parsed.success) return invalidCommand(rawCommand, this.state.stateVersion);
    const command: RoomCommand = parsed.data;
    const nowMs = this.commandTimestampMs();
    const now = new Date(nowMs);
    const replay = await this.options.store.findReplay(
      this.options.lease,
      authenticated.playerId,
      command,
      now,
    );
    if (replay !== null) {
      return { accepted: true, acknowledgement: replay, events: [], replayed: true };
    }

    const randomSource = resumableRandomSource(this.state);
    if (randomSource === null) {
      return {
        accepted: false,
        rejection: rejection(command.requestId, this.state.stateVersion, {
          code: "INVALID_STATE",
          message: "Room random checkpoint cannot be resumed",
          retryable: false,
        }),
      };
    }

    let nextState: GameState | GameplayAggregateState;
    let events: readonly (DomainEventEnvelope | GameplayDomainEventEnvelope)[];
    if (isGameplayState(this.state)) {
      if (isLifecycleCommand(command)) {
        return {
          accepted: false,
          rejection: rejection(command.requestId, this.state.stateVersion, {
            code: "INVALID_PHASE",
            message: "Lifecycle command is unavailable after gameplay starts",
            retryable: false,
          }),
        };
      }
      const result = transitionGameplay(this.state, coreGameplayCommand(command), {
        actor: { kind: "player", playerId: playerId(authenticated.playerId) },
        nowMs,
        randomSource,
        ...(command.type === "createTrade" ? { tradeId: `trade_${command.requestId.replaceAll("-", "")}` } : {}),
      });
      if (!result.ok) {
        return { accepted: false, rejection: rejection(command.requestId, this.state.stateVersion, result.error) };
      }
      nextState = result.state;
      events = gameplayEvents(result.events, result.state, command.requestId, nowMs);
    } else {
      if (!isLifecycleCommand(command)) {
        return {
          accepted: false,
          rejection: rejection(command.requestId, this.state.stateVersion, {
            code: "INVALID_PHASE",
            message: "Gameplay command is unavailable before the game starts",
            retryable: false,
          }),
        };
      }
      const result = transition(this.state, coreLifecycleCommand(command), {
        actorId: playerId(authenticated.playerId),
        nowMs,
        randomSource,
      });
      if (!result.ok || result.state === null) {
        const error = result.ok
          ? { code: "INVALID_STATE" as const, message: "Lifecycle transition produced no state", retryable: false }
          : result.error;
        return { accepted: false, rejection: rejection(command.requestId, this.state.stateVersion, error) };
      }
      const initialized = result.state.lifecycle === "inProgress"
        ? initializeGameplayAggregate(result.state)
        : result.state;
      if (initialized === null) {
        return {
          accepted: false,
          rejection: rejection(command.requestId, this.state.stateVersion, {
            code: "INVALID_STATE",
            message: "Started lifecycle state cannot initialize gameplay",
            retryable: false,
          }),
        };
      }
      nextState = initialized;
      events = lifecycleEvents(result.events, command.requestId, nextState.stateVersion, nowMs);
    }

    const acknowledgement: CommandAcknowledgement = {
      type: "command.ack",
      requestId: command.requestId,
      stateVersion: nextState.stateVersion,
      eventIds: events.map((event) => event.eventId),
    };
    const serializedState = isGameplayState(nextState)
      ? serializeGameplaySnapshot(nextState)
      : serializeSnapshot(nextState);
    const proof = terminalProof(nextState);
    const sessionFinalization = command.type === "leaveGame"
      ? {
          action: "leave" as const,
          idempotencyKey: sessionFinalizationIdempotencyKey(
            authenticated.gameId,
            authenticated.roomId,
            authenticated.playerId,
            command.requestId,
            "leave",
          ),
          reservationId: authenticated.reservationId,
        }
      : command.type === "cancelGame"
        ? {
            action: "cancel" as const,
            idempotencyKey: sessionFinalizationIdempotencyKey(
              authenticated.gameId,
              authenticated.roomId,
              authenticated.playerId,
              command.requestId,
              "cancel",
            ),
            reservationId: authenticated.reservationId,
          }
        : undefined;
    const committed = await this.options.store.commit(this.options.lease, {
      acknowledgement,
      events,
      playerId: authenticated.playerId,
      command,
      serializedState,
      stateVersion: nextState.stateVersion,
      ...(proof === undefined ? {} : { terminalProof: proof }),
      ...(sessionFinalization === undefined ? {} : { sessionFinalization }),
    }, now);
    if (committed.duplicate) {
      return { accepted: true, acknowledgement: committed.acknowledgement, events: [], replayed: true };
    }
    this.state = nextState;
    this.committedAtMs = nowMs;
    this.options.onCommitted?.(nextState, acknowledgement, events);
    return { accepted: true, acknowledgement, events, replayed: false };
  }

  private async handleInternalSerial(rawCommand: unknown): Promise<RoomCommandHandlingResult> {
    const parsed = InternalGameplayCommandSchema.safeParse(rawCommand);
    if (!parsed.success) return invalidCommand(rawCommand, this.state.stateVersion);
    const command: InternalGameplayCommand = parsed.data;
    const nowMs = this.commandTimestampMs();
    const now = new Date(nowMs);
    const systemActorId = "system_timer";
    const replay = await this.options.store.findReplay(this.options.lease, systemActorId, command, now);
    if (replay !== null) {
      return { accepted: true, acknowledgement: replay, events: [], replayed: true };
    }
    if (!isGameplayState(this.state)) {
      return {
        accepted: false,
        rejection: rejection(command.requestId, this.state.stateVersion, {
          code: "INVALID_PHASE",
          message: "Internal gameplay command is unavailable before the game starts",
          retryable: false,
        }),
      };
    }
    const randomSource = resumableRandomSource(this.state);
    if (randomSource === null) {
      return {
        accepted: false,
        rejection: rejection(command.requestId, this.state.stateVersion, {
          code: "INVALID_STATE",
          message: "Room random checkpoint cannot be resumed",
          retryable: false,
        }),
      };
    }
    const { requestId: _requestId, ...coreCommand } = command;
    const result = transitionGameplay(this.state, coreCommand as GameplayCommand, {
      actor: { kind: "internal" },
      nowMs,
      randomSource,
    });
    if (!result.ok) {
      return { accepted: false, rejection: rejection(command.requestId, this.state.stateVersion, result.error) };
    }
    const events = gameplayEvents(result.events, result.state, command.requestId, nowMs);
    const proof = terminalProof(result.state);
    const acknowledgement: CommandAcknowledgement = {
      type: "command.ack",
      requestId: command.requestId,
      stateVersion: result.state.stateVersion,
      eventIds: events.map((event) => event.eventId),
    };
    const committed = await this.options.store.commit(this.options.lease, {
      acknowledgement,
      events,
      playerId: systemActorId,
      command,
      serializedState: serializeGameplaySnapshot(result.state),
      stateVersion: result.state.stateVersion,
      ...(proof === undefined ? {} : { terminalProof: proof }),
    }, now);
    if (committed.duplicate) {
      return { accepted: true, acknowledgement: committed.acknowledgement, events: [], replayed: true };
    }
    this.state = result.state;
    this.committedAtMs = nowMs;
    this.options.onCommitted?.(result.state, acknowledgement, events);
    return { accepted: true, acknowledgement, events, replayed: false };
  }
}

function admissionRequestId(authenticated: AuthenticatedRoomPlayer): string {
  const bytes = createHash("sha256")
    .update(`${authenticated.gameId}\0${authenticated.playerId}\0${authenticated.reservationId}\0admission`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
import { createHash } from "node:crypto";
