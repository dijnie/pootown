import { createHash } from "node:crypto";
import {
  RoomAdmissionOptionsSchema,
  type RoomAdmissionOptions,
} from "@pootown/game-contracts";
import type {
  TicketConsumeRequest,
  TicketConsumeResponse,
} from "@pootown/game-contracts/internal";

export interface TicketAdmissionApi {
  consumeTicket(
    request: TicketConsumeRequest,
    idempotencyKey: string,
  ): Promise<TicketConsumeResponse>;
}

export interface AuthenticatedRoomPlayer {
  readonly gameId: string;
  readonly playerId: string;
  readonly reservationId: string;
  readonly role: "player";
  readonly roomId: string;
  readonly seatIndex: number;
  readonly userId: string;
}

export class TicketAuthenticationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TicketAuthenticationError";
  }
}

export class TicketAuthenticator {
  public constructor(
    private readonly api: TicketAdmissionApi,
    private readonly roomInstanceId: string,
    private readonly roomId: TicketConsumeRequest["roomId"],
  ) {}

  public async authenticate(rawOptions: unknown): Promise<AuthenticatedRoomPlayer> {
    const parsed = RoomAdmissionOptionsSchema.safeParse(rawOptions);
    if (!parsed.success) throw new TicketAuthenticationError("Realtime admission options are invalid");
    const options: RoomAdmissionOptions = parsed.data;
    const idempotencyKey = `realtime-consume-${createHash("sha256")
      .update(`${this.roomInstanceId}\0${options.gameId}\0${this.roomId}\0${options.ticket}`)
      .digest("hex")}`;
    const consumed = await this.api.consumeTicket({
      contractVersion: options.contractVersion,
      ticket: options.ticket,
      gameId: options.gameId,
      roomId: this.roomId,
      roomInstanceId: this.roomInstanceId,
    }, idempotencyKey);
    if (consumed.gameId !== options.gameId || consumed.roomId !== this.roomId || consumed.role !== "player") {
      throw new TicketAuthenticationError("Realtime admission binding does not match the requested room");
    }
    return Object.freeze({
      gameId: consumed.gameId,
      playerId: consumed.playerId,
      reservationId: consumed.reservationId,
      role: consumed.role,
      roomId: consumed.roomId,
      seatIndex: consumed.seatIndex,
      userId: consumed.userId,
    });
  }
}
