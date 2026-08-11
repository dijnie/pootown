import { createHash } from "node:crypto";
import {
  Client,
  Room,
} from "@colyseus/core";
import {
  RoomAdmissionOptionsSchema,
  PlayerPrivateStateMessageSchema,
  PlayerPrivateStateRequestSchema,
  RoomCommandSchema,
  SessionStatusSchema,
  type DomainEventEnvelope,
  type GameplayDomainEventEnvelope,
  type OperationResponse,
} from "@pootown/game-contracts";
import {
  parseGameplaySnapshot,
  parseSnapshot,
  serializeGameplaySnapshot,
  serializeSnapshot,
  type GameState,
  type GameplayAggregateState,
} from "@pootown/game-core";

import {
  RoomSessionFinalizationRequestSchema,
  type RoomSessionFinalizationRequest,
  SessionBootstrapResponse,
  TicketConsumeRequest,
  TicketConsumeResponse,
} from "@pootown/game-contracts/internal";
import { InternalApiRequestError } from "../api/internal-api-client.js";
import {
  TicketAuthenticationError,
  TicketAuthenticator,
  type AuthenticatedRoomPlayer,
} from "../auth/ticket-auth.js";
import {
  InvalidRoomCommandError,
  RoomCommandHandler,
} from "../commands/command-handler.js";
import { sessionFinalizationIdempotencyKey } from "../commands/session-finalization.js";
import {
  CheckpointRepository,
  CorruptCheckpointError,
  checkpointChecksum,
} from "../persistence/checkpoint-repository.js";
import { CommandRepository } from "../persistence/command-repository.js";
import { PresenceRepository } from "../persistence/presence-repository.js";
import {
  RoomLeaseRepository,
  RoomLeaseUnavailableError,
  type RoomLease,
} from "../persistence/room-lease.js";
import {
  operationalErrorType,
  type OperationalErrorType,
  type RealtimeMetrics,
} from "../observability/runtime-metrics.js";
import { SecureRandomSource } from "../random/secure-random-source.js";
import { RoomClock } from "../timers/room-clock.js";
import { createWaitingState } from "./bootstrap-state.js";
import {
  createGameRoomState,
  type GameRoomStateInstance,
  updateGameRoomState,
} from "./game-room-state.js";

const FINISHED_ROOM_RETENTION_MS = 600_000;

export interface GameRoomDependencies {
  readonly api: {
    bootstrap(gameId: string): Promise<SessionBootstrapResponse>;
    consumeTicket(request: TicketConsumeRequest, idempotencyKey: string): Promise<TicketConsumeResponse>;
    markStarted(
      gameId: string,
      request: { readonly contractVersion: 1; readonly roomId: string; readonly stateVersion: number },
      idempotencyKey: string,
    ): Promise<OperationResponse>;
    finalizeSessionCommand(
      gameId: string,
      request: RoomSessionFinalizationRequest,
      idempotencyKey: string,
    ): Promise<OperationResponse>;
    settleSession(
      gameId: string,
      request: {
        readonly contractVersion: 1;
        readonly roomId: string;
        readonly terminalStateVersion: number;
        readonly checkpointChecksum: string;
      },
      idempotencyKey: string,
    ): Promise<OperationResponse>;
  };
  readonly checkpoints: CheckpointRepository;
  readonly commands: CommandRepository;
  readonly crashHooks?: {
    readonly afterAcknowledgement?: () => void | Promise<void>;
  };
  readonly leaseRenewMs: number;
  readonly leases: RoomLeaseRepository;
  readonly metrics?: RealtimeMetrics;
  readonly nowMs?: () => number;
  readonly onLeaseLost?: (error: unknown) => void;
  readonly onOperationalFailure?: (event: {
    readonly errorType: OperationalErrorType;
    readonly kind: "room-finalization-pending" | "settlement-retry-scheduled";
  }) => void;
  readonly presence: PresenceRepository;
}

export type GameRoomConstructor = new () => Room;

type GameClientData = AuthenticatedRoomPlayer & { readonly userData?: never };
type GameClient = Client<GameClientData>;

interface ActiveSession {
  readonly clientSessionId: string;
  joined: boolean;
}

function parseCheckpointState(serializedState: string): GameState | GameplayAggregateState {
  try {
    return parseSnapshot(serializedState);
  } catch {
    try {
      return parseGameplaySnapshot(serializedState);
    } catch {
      throw new CorruptCheckpointError("Room checkpoint cannot be restored");
    }
  }
}

export function createGameRoomClass(dependencies: GameRoomDependencies): GameRoomConstructor {
  return class GameRoom extends Room {
    private readonly activeSessions = new Map<string, ActiveSession>();
    private authenticationsInFlight = 0;
    private readonly authenticationWaiters = new Set<() => void>();
    private authenticator: TicketAuthenticator | undefined;
    private commandDeliveryQueue: Promise<void> = Promise.resolve();
    private commandHandler: RoomCommandHandler | undefined;
    private disposed = false;
    private finishedDisposalScheduled = false;
    private gameId: string | undefined;
    private lease: RoomLease | undefined;
    private leaseLost = false;
    private logicalRoomId: string | undefined;
    private pendingStartPublication: {
      readonly requestId: string;
      readonly events: readonly (DomainEventEnvelope | GameplayDomainEventEnvelope)[];
    } | undefined;
    private pendingSessionFinalization: {
      readonly action: "leave" | "cancel";
      readonly events: readonly (DomainEventEnvelope | GameplayDomainEventEnvelope)[];
      readonly playerId: string;
      readonly requestId: string;
    } | undefined;
    private roomClock: RoomClock | undefined;
    private settlementInFlight = false;
    private settlementRetryTimer: ReturnType<typeof setTimeout> | undefined;
    private starting = false;

    public override async onCreate(rawOptions: unknown): Promise<void> {
      const options = RoomAdmissionOptionsSchema.parse(rawOptions);
      let bootstrap = await dependencies.api.bootstrap(options.gameId);
      if (bootstrap.gameId !== options.gameId) {
        throw new TicketAuthenticationError("Room bootstrap binding does not match admission");
      }
      const lease = await dependencies.leases.acquire(bootstrap.roomId, bootstrap.gameId);
      let privateState: GameState | GameplayAggregateState;
      try {
        const refreshedBootstrap = await dependencies.api.bootstrap(options.gameId);
        if (refreshedBootstrap.gameId !== bootstrap.gameId || refreshedBootstrap.roomId !== bootstrap.roomId) {
          throw new TicketAuthenticationError("Room bootstrap binding changed during lease acquisition");
        }
        bootstrap = refreshedBootstrap;
        const checkpoint = await dependencies.checkpoints.load(lease);
        if (checkpoint === null) {
          const initialState = createWaitingState(bootstrap, new SecureRandomSource());
          await dependencies.checkpoints.initialize(
            lease,
            initialState.stateVersion,
            serializeSnapshot(initialState),
          );
          privateState = initialState;
        } else {
          privateState = parseCheckpointState(checkpoint.serializedState);
          if (String(privateState.gameId) !== String(bootstrap.gameId)) {
            throw new CorruptCheckpointError("Room checkpoint belongs to another game");
          }
        }
        const gameplayCheckpoint = "players" in privateState;
        if (bootstrap.stateVersion > privateState.stateVersion ||
            (!gameplayCheckpoint && bootstrap.lifecycle !== "open")) {
          throw new CorruptCheckpointError("Room checkpoint is behind API lifecycle authority");
        }
        if (gameplayCheckpoint && bootstrap.lifecycle === "open") {
          await dependencies.api.markStarted(bootstrap.gameId, {
            contractVersion: 1,
            roomId: bootstrap.roomId,
            stateVersion: privateState.stateVersion,
          }, startIdempotencyKey(bootstrap.gameId, bootstrap.roomId));
        }
      } catch (error) {
        await dependencies.leases.release(lease).catch(() => false);
        throw error;
      }
      this.gameId = bootstrap.gameId;
      this.logicalRoomId = bootstrap.roomId;
      this.lease = lease;
      this.setState(createGameRoomState(privateState));
      this.commandHandler = new RoomCommandHandler({
        initialState: privateState,
        lease,
        store: dependencies.commands,
        onCommitted: (state) => {
          updateGameRoomState(this.state as GameRoomStateInstance, state);
          this.roomClock?.synchronize(state);
          this.scheduleSettlement(state);
        },
      });
      this.roomClock = new RoomClock({
        dispatch: (command) => this.enqueueInternalCommand(command),
        onFailure: async () => {
          if (this.disposed) return;
          await this.lock();
        },
      });
      this.roomClock.synchronize(privateState);
      this.scheduleSettlement(privateState);
      this.authenticator = new TicketAuthenticator({
        consumeTicket: (request, idempotencyKey) => dependencies.api.consumeTicket(request, idempotencyKey),
      }, lease.instanceId, bootstrap.roomId);
      this.maxClients = bootstrap.maximumPlayers;
      await this.setMetadata({ gameId: bootstrap.gameId, roomId: bootstrap.roomId });
      dependencies.metrics?.increment("rooms_created_total");
      this.onMessage("player.private.sync", (client: GameClient, payload: unknown) => {
        PlayerPrivateStateRequestSchema.parse(payload);
        if (client.userData === undefined) {
          throw new TicketAuthenticationError("Room client is not authenticated");
        }
        const privateMessage = playerPrivateStateMessage(client.userData);
        client.send(privateMessage.type, privateMessage);
      });
      this.onMessage("command", async (client: GameClient, payload: unknown) => {
        await this.enqueueRoomCommand(client, payload);
      });
      this.clock.setInterval(() => {
        void this.renewLease();
      }, dependencies.leaseRenewMs);
    }

    public override async onAuth(client: Client, rawOptions: unknown): Promise<AuthenticatedRoomPlayer> {
      if (this.starting || this.pendingSessionFinalization !== undefined) {
        throw new TicketAuthenticationError("Room lifecycle command is being finalized");
      }
      this.authenticationsInFlight += 1;
      try {
        return await this.authenticateClient(client, rawOptions);
      } catch (error) {
        if (error instanceof RoomLeaseUnavailableError) await this.handleLeaseLoss(error);
        throw error;
      } finally {
        this.authenticationsInFlight -= 1;
        if (this.authenticationsInFlight === 0) {
          for (const resolve of this.authenticationWaiters) resolve();
          this.authenticationWaiters.clear();
        }
      }
    }

    private async authenticateClient(client: Client, rawOptions: unknown): Promise<AuthenticatedRoomPlayer> {
      const options = RoomAdmissionOptionsSchema.parse(rawOptions);
      if (options.gameId !== this.gameId || this.logicalRoomId === undefined || this.authenticator === undefined) {
        throw new TicketAuthenticationError("Admission does not target this room");
      }
      const authenticated = await this.authenticator.authenticate(options);
      const bootstrap = await dependencies.api.bootstrap(authenticated.gameId);
      const admitted = bootstrap.players.find((player) => player.playerId === authenticated.playerId);
      if ((bootstrap.lifecycle !== "open" && bootstrap.lifecycle !== "active") ||
          bootstrap.roomId !== authenticated.roomId || admitted?.seatIndex !== authenticated.seatIndex ||
          this.commandHandler === undefined) {
        throw new TicketAuthenticationError("API admission is not present in the room bootstrap");
      }
      const admissionEvents = await this.commandHandler.ensureAdmittedPlayer(authenticated, admitted.joinedAtMs);
      for (const event of admissionEvents) this.broadcast(event.type, event);
      if (this.activeSessions.has(authenticated.playerId)) {
        throw new TicketAuthenticationError("Player already has an active room connection");
      }
      const pendingSession: ActiveSession = { clientSessionId: client.sessionId, joined: false };
      this.activeSessions.set(authenticated.playerId, pendingSession);
      this.clock.setTimeout(() => {
        if (this.activeSessions.get(authenticated.playerId) === pendingSession && !pendingSession.joined) {
          this.activeSessions.delete(authenticated.playerId);
        }
      }, this.seatReservationTimeout * 1_000);
      return authenticated;
    }

    public override async onJoin(
      client: GameClient,
      _options: unknown,
      authenticated: AuthenticatedRoomPlayer,
    ): Promise<void> {
      const session = this.activeSessions.get(authenticated.playerId);
      if (session === undefined || session.clientSessionId !== client.sessionId) {
        throw new TicketAuthenticationError("Room authentication reservation is no longer active");
      }
      if (this.lease === undefined) throw new TicketAuthenticationError("Room lease is unavailable");
      let previousAllOfflineAt: Date | null;
      try {
        previousAllOfflineAt = await dependencies.presence.markConnected(this.lease);
      } catch (error) {
        if (error instanceof RoomLeaseUnavailableError) await this.handleLeaseLoss(error);
        throw error;
      }
      try {
        const bootstrap = await dependencies.api.bootstrap(authenticated.gameId);
        if (bootstrap.roomId !== authenticated.roomId ||
            (bootstrap.lifecycle !== "open" && bootstrap.lifecycle !== "active")) {
          throw new TicketAuthenticationError("Session is no longer available for attachment");
        }
      } catch (error) {
        if (!this.hasAttachedClient()) {
          try {
            await dependencies.presence.markAllOffline(this.lease, previousAllOfflineAt ?? undefined);
            dependencies.metrics?.increment("all_offline_windows_started_total");
          } catch {
            // Preserve the original authentication failure; reconciliation repairs presence.
          }
        }
        throw error;
      }
      session.joined = true;
      client.userData = authenticated;
    }

    public override async onLeave(client: GameClient): Promise<void> {
      await this.detachClient(client);
    }

    public override async onDrop(client: GameClient): Promise<void> {
      await this.detachClient(client);
    }

    private async detachClient(client: GameClient): Promise<void> {
      const authenticated = client.userData;
      if (authenticated !== undefined &&
          this.activeSessions.get(authenticated.playerId)?.clientSessionId === client.sessionId) {
        this.activeSessions.delete(authenticated.playerId);
        if (!this.hasAttachedClient() && this.lease !== undefined) {
          try {
            await dependencies.presence.markAllOffline(this.lease);
            dependencies.metrics?.increment("all_offline_windows_started_total");
          } catch (error) {
            if (error instanceof RoomLeaseUnavailableError) await this.handleLeaseLoss(error);
            else throw error;
          }
        }
      }
    }

    private hasAttachedClient(): boolean {
      return [...this.activeSessions.values()].some((session) => session.joined);
    }

    public override async onDispose(): Promise<void> {
      this.disposed = true;
      this.roomClock?.stop();
      if (this.settlementRetryTimer !== undefined) clearTimeout(this.settlementRetryTimer);
      const state = this.commandHandler?.currentState();
      if (this.lease !== undefined && state !== undefined && "players" in state && state.lifecycle === "inProgress") {
        try {
          await dependencies.presence.markAllOffline(this.lease);
          dependencies.metrics?.increment("all_offline_windows_started_total");
        } catch {
          // Shutdown continues; API reconciliation repairs presence.
        }
      }
      if (this.lease !== undefined) await dependencies.leases.release(this.lease).catch(() => false);
    }

    private async renewLease(): Promise<void> {
      if (this.lease === undefined || this.leaseLost || this.disposed) return;
      try {
        this.lease = await dependencies.leases.renew(this.lease);
      } catch (error) {
        if (this.disposed) return;
        await this.handleLeaseLoss(error);
      }
    }

    private async handleLeaseLoss(error: unknown): Promise<void> {
      if (this.leaseLost) return;
      this.leaseLost = true;
      dependencies.metrics?.increment("lease_losses_total");
      this.roomClock?.stop();
      dependencies.onLeaseLost?.(error);
      await this.lock().catch(() => undefined);
      await this.disconnect().catch(() => undefined);
    }

    private async handleRoomCommand(client: GameClient, payload: unknown): Promise<void> {
      if (client.userData === undefined || this.commandHandler === undefined) {
        client.error(4401, "Room client is not authenticated");
        return;
      }
      const parsedCommand = RoomCommandSchema.safeParse(payload);
      const startsGame = parsedCommand.success && parsedCommand.data.type === "startGame";
      const parsedRequestId = parsedCommand.success ? parsedCommand.data.requestId : undefined;
      const finalizationAction = parsedCommand.success && parsedCommand.data.type === "leaveGame"
        ? "leave" as const
        : parsedCommand.success && parsedCommand.data.type === "cancelGame"
          ? "cancel" as const
          : undefined;
      if (this.starting && (!startsGame ||
          this.pendingStartPublication?.requestId !== parsedCommand.data.requestId)) {
        client.error(4503, "Room start is awaiting API confirmation");
        return;
      }
      if (this.pendingSessionFinalization !== undefined &&
          (finalizationAction === undefined ||
            this.pendingSessionFinalization.action !== finalizationAction ||
            this.pendingSessionFinalization.playerId !== client.userData.playerId ||
            this.pendingSessionFinalization.requestId !== parsedRequestId)) {
        client.error(4503, "Room lifecycle command is awaiting API confirmation");
        return;
      }
      if (finalizationAction !== undefined && this.pendingSessionFinalization === undefined) {
        this.pendingSessionFinalization = {
          action: finalizationAction,
          events: [],
          playerId: client.userData.playerId,
          requestId: parsedRequestId as string,
        };
      }
      try {
        if (startsGame) {
          this.starting = true;
          await this.waitForAuthentications();
        }
        if (finalizationAction !== undefined) await this.waitForAuthentications();
        const result = await this.commandHandler.handle(client.userData, payload);
        if (!result.accepted) {
          dependencies.metrics?.increment("player_command_handler_rejections_total");
          if (startsGame) {
            this.starting = false;
          }
          if (finalizationAction !== undefined) this.pendingSessionFinalization = undefined;
          client.send(result.rejection.type, result.rejection);
          return;
        }
        dependencies.metrics?.increment(result.replayed
          ? "player_commands_replayed_total"
          : "player_commands_committed_total");
        let events = result.events;
        if (finalizationAction !== undefined) {
          if (this.gameId === undefined || this.logicalRoomId === undefined) {
            throw new InvalidRoomCommandError("Room finalization binding is unavailable");
          }
          if (!result.replayed) {
            this.pendingSessionFinalization = {
              action: finalizationAction,
              events: result.events,
              playerId: client.userData.playerId,
              requestId: result.acknowledgement.requestId,
            };
          } else if (this.pendingSessionFinalization?.requestId === result.acknowledgement.requestId) {
            events = this.pendingSessionFinalization.events;
          }
          try {
            await dependencies.api.finalizeSessionCommand(this.gameId, RoomSessionFinalizationRequestSchema.parse({
              contractVersion: 1,
              roomId: this.logicalRoomId,
              playerId: client.userData.playerId,
              reservationId: client.userData.reservationId,
              action: finalizationAction,
            }), sessionFinalizationIdempotencyKey(
              this.gameId,
              this.logicalRoomId,
              client.userData.playerId,
              result.acknowledgement.requestId,
              finalizationAction,
            ));
          } catch (error) {
            dependencies.metrics?.increment("room_finalization_failures_total");
            dependencies.onOperationalFailure?.({
              errorType: operationalErrorType(error),
              kind: "room-finalization-pending",
            });
            throw error;
          }
          this.pendingSessionFinalization = undefined;
        }
        if (startsGame) {
          if (this.gameId === undefined || this.logicalRoomId === undefined) {
            throw new InvalidRoomCommandError("Started room binding is unavailable");
          }
          if (!result.replayed) {
            this.pendingStartPublication = {
              requestId: result.acknowledgement.requestId,
              events: result.events,
            };
          } else if (this.pendingStartPublication?.requestId === result.acknowledgement.requestId) {
            events = this.pendingStartPublication.events;
          }
          await dependencies.api.markStarted(this.gameId, {
            contractVersion: 1,
            roomId: this.logicalRoomId,
            stateVersion: result.acknowledgement.stateVersion,
          }, startIdempotencyKey(this.gameId, this.logicalRoomId));
          this.starting = false;
          this.pendingStartPublication = undefined;
        }
        client.send(result.acknowledgement.type, result.acknowledgement);
        await dependencies.crashHooks?.afterAcknowledgement?.();
        for (const event of events) this.broadcast(event.type, event);
      } catch (error) {
        if (error instanceof RoomLeaseUnavailableError) {
          await this.handleLeaseLoss(error);
          return;
        }
        if (error instanceof InvalidRoomCommandError) {
          if (startsGame && this.pendingStartPublication === undefined) {
            this.starting = false;
          }
          client.error(4400, "Room command is invalid");
          return;
        }
        if (!startsGame && finalizationAction === undefined) await this.lock();
        const status = SessionStatusSchema.parse({
          type: "session.status",
          status: "reconnecting",
          reason: "command-finalization-pending",
        });
        client.send(status.type, status);
      }
    }

    private enqueueRoomCommand(client: GameClient, payload: unknown): Promise<void> {
      const work = this.commandDeliveryQueue.then(
        () => this.handleRoomCommand(client, payload),
        () => this.handleRoomCommand(client, payload),
      );
      this.commandDeliveryQueue = work.then(() => undefined, () => undefined);
      return work;
    }

    private enqueueInternalCommand(command: unknown): Promise<boolean> {
      const work = this.commandDeliveryQueue.then(async () => {
        if (this.commandHandler === undefined) throw new Error("Room command handler is unavailable");
        const result = await this.commandHandler.handleInternal(command);
        if (!result.accepted) {
          dependencies.metrics?.increment("timer_commands_rejected_total");
          if (result.rejection.code === "STALE_STATE_VERSION") {
            this.roomClock?.synchronize(this.commandHandler.currentState());
            return false;
          }
          throw new Error(`Room timer command rejected: ${result.rejection.code}`);
        }
        dependencies.metrics?.increment("timer_commands_accepted_total");
        for (const event of result.events) this.broadcast(event.type, event);
        return true;
      });
      this.commandDeliveryQueue = work.then(() => undefined, () => undefined);
      return work;
    }

    private scheduleSettlement(state: GameState | GameplayAggregateState): void {
      if (!("players" in state) || state.lifecycle !== "finished" || this.disposed) return;
      this.scheduleFinishedDisposal(state.terminal.endedAtMs);
      if (this.settlementInFlight || this.settlementRetryTimer !== undefined) return;
      this.roomClock?.stop();
      void this.lock();
      void this.settleFinishedState(state);
    }

    private scheduleFinishedDisposal(endedAtMs: number): void {
      if (this.finishedDisposalScheduled) return;
      this.finishedDisposalScheduled = true;
      const nowMs = dependencies.nowMs?.() ?? Date.now();
      const elapsedMs = Math.max(0, nowMs - endedAtMs);
      const remainingMs = Math.max(0, FINISHED_ROOM_RETENTION_MS - elapsedMs);
      this.clock.setTimeout(() => {
        if (!this.disposed) void this.disconnect();
      }, remainingMs);
    }

    private async settleFinishedState(state: Extract<GameplayAggregateState, { lifecycle: "finished" }>): Promise<void> {
      if (this.gameId === undefined || this.logicalRoomId === undefined) return;
      this.settlementInFlight = true;
      try {
        const serializedState = serializeGameplaySnapshot(state);
        await dependencies.api.settleSession(this.gameId, {
          contractVersion: 1,
          roomId: this.logicalRoomId,
          terminalStateVersion: state.stateVersion,
          checkpointChecksum: checkpointChecksum(serializedState).toString("hex"),
        }, settlementIdempotencyKey(this.gameId, this.logicalRoomId));
      } catch (error) {
        if (error instanceof InternalApiRequestError && error.code === "SETTLEMENT_ALREADY_COMMITTED") return;
        if (this.disposed) return;
        this.settlementRetryTimer = setTimeout(() => {
          this.settlementRetryTimer = undefined;
          this.scheduleSettlement(state);
        }, 5_000);
        dependencies.metrics?.increment("settlement_retries_total");
        dependencies.onOperationalFailure?.({
          errorType: operationalErrorType(error),
          kind: "settlement-retry-scheduled",
        });
      } finally {
        this.settlementInFlight = false;
      }
    }

    private waitForAuthentications(): Promise<void> {
      if (this.authenticationsInFlight === 0) return Promise.resolve();
      return new Promise((resolve) => this.authenticationWaiters.add(resolve));
    }
  };
}

function startIdempotencyKey(gameId: string, roomId: string): string {
  return `realtime-start-${createHash("sha256").update(`${gameId}\0${roomId}`).digest("hex")}`;
}

function settlementIdempotencyKey(gameId: string, roomId: string): string {
  return `realtime-settle-${createHash("sha256").update(`${gameId}\0${roomId}`).digest("hex")}`;
}

export function playerPrivateStateMessage(authenticated: AuthenticatedRoomPlayer) {
  return PlayerPrivateStateMessageSchema.parse({
    type: "player.private",
    view: {
      schemaVersion: 1,
      gameId: authenticated.gameId,
      playerId: authenticated.playerId,
      reconnectDeadlineAtMs: null,
    },
  });
}
