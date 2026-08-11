import {
  Client,
  Room,
} from "@colyseus/core";
import {
  RoomAdmissionOptionsSchema,
  PlayerPrivateStateMessageSchema,
  PlayerPrivateStateRequestSchema,
} from "@pootown/game-contracts";
import {
  parseGameplaySnapshot,
  parseSnapshot,
  serializeSnapshot,
  type GameState,
  type GameplayAggregateState,
} from "@pootown/game-core";

import type { SessionBootstrapResponse, TicketConsumeRequest, TicketConsumeResponse } from "@pootown/game-contracts/internal";
import {
  TicketAuthenticationError,
  TicketAuthenticator,
  type AuthenticatedRoomPlayer,
} from "../auth/ticket-auth.js";
import { CheckpointRepository, CorruptCheckpointError } from "../persistence/checkpoint-repository.js";
import { RoomLeaseRepository, type RoomLease } from "../persistence/room-lease.js";
import { SecureRandomSource } from "../random/secure-random-source.js";
import { createWaitingState } from "./bootstrap-state.js";
import {
  createGameRoomState,
} from "./game-room-state.js";

export interface GameRoomDependencies {
  readonly api: {
    bootstrap(gameId: string): Promise<SessionBootstrapResponse>;
    consumeTicket(request: TicketConsumeRequest, idempotencyKey: string): Promise<TicketConsumeResponse>;
  };
  readonly checkpoints: CheckpointRepository;
  readonly leaseRenewMs: number;
  readonly leases: RoomLeaseRepository;
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
    private authenticator: TicketAuthenticator | undefined;
    private gameId: string | undefined;
    private lease: RoomLease | undefined;
    private logicalRoomId: string | undefined;

    public override async onCreate(rawOptions: unknown): Promise<void> {
      const options = RoomAdmissionOptionsSchema.parse(rawOptions);
      const bootstrap = await dependencies.api.bootstrap(options.gameId);
      if (bootstrap.gameId !== options.gameId) {
        throw new TicketAuthenticationError("Room bootstrap binding does not match admission");
      }
      const lease = await dependencies.leases.acquire(bootstrap.roomId, bootstrap.gameId);
      let privateState: GameState | GameplayAggregateState;
      try {
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
      } catch (error) {
        await dependencies.leases.release(lease).catch(() => false);
        throw error;
      }
      this.gameId = bootstrap.gameId;
      this.logicalRoomId = bootstrap.roomId;
      this.lease = lease;
      this.setState(createGameRoomState(privateState));
      this.authenticator = new TicketAuthenticator({
        consumeTicket: (request, idempotencyKey) => dependencies.api.consumeTicket(request, idempotencyKey),
      }, lease.instanceId, bootstrap.roomId);
      this.maxClients = bootstrap.maximumPlayers;
      await this.setMetadata({ gameId: bootstrap.gameId, roomId: bootstrap.roomId });
      this.onMessage("player.private.sync", (client: GameClient, payload: unknown) => {
        PlayerPrivateStateRequestSchema.parse(payload);
        if (client.userData === undefined) {
          throw new TicketAuthenticationError("Room client is not authenticated");
        }
        const privateMessage = playerPrivateStateMessage(client.userData);
        client.send(privateMessage.type, privateMessage);
      });
      this.clock.setInterval(() => {
        void this.renewLease();
      }, dependencies.leaseRenewMs);
    }

    public override async onAuth(client: Client, rawOptions: unknown): Promise<AuthenticatedRoomPlayer> {
      const options = RoomAdmissionOptionsSchema.parse(rawOptions);
      if (options.gameId !== this.gameId || this.logicalRoomId === undefined || this.authenticator === undefined) {
        throw new TicketAuthenticationError("Admission does not target this room");
      }
      const authenticated = await this.authenticator.authenticate(options);
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

    public override onJoin(
      client: GameClient,
      _options: unknown,
      authenticated: AuthenticatedRoomPlayer,
    ): void {
      const session = this.activeSessions.get(authenticated.playerId);
      if (session === undefined || session.clientSessionId !== client.sessionId) {
        throw new TicketAuthenticationError("Room authentication reservation is no longer active");
      }
      session.joined = true;
      client.userData = authenticated;
    }

    public override onLeave(client: GameClient): void {
      const authenticated = client.userData;
      if (authenticated !== undefined &&
          this.activeSessions.get(authenticated.playerId)?.clientSessionId === client.sessionId) {
        this.activeSessions.delete(authenticated.playerId);
      }
    }

    public override async onDispose(): Promise<void> {
      if (this.lease !== undefined) await dependencies.leases.release(this.lease).catch(() => false);
    }

    private async renewLease(): Promise<void> {
      if (this.lease === undefined) return;
      try {
        this.lease = await dependencies.leases.renew(this.lease);
      } catch {
        await this.lock();
        await this.disconnect();
      }
    }
  };
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
