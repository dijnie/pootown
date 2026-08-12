import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { GameIdSchema, type OperationResponse } from "@pootown/game-contracts";
import {
  AbortSessionRequestSchema,
  ReconciliationRequestSchema,
  RoomSessionFinalizationRequestSchema,
  SessionStartedRequestSchema,
  SettlementRequestSchema,
  TicketConsumeRequestSchema,
  type AbortSessionRequest,
  type ReconciliationResponse,
  type RoomSessionFinalizationRequest,
  type SessionBootstrapResponse,
  type SettlementRequest,
  type TicketConsumeRequest,
  type TicketConsumeResponse,
} from "@pootown/game-contracts/internal";

import { InternalSettlementService } from "./internal-settlement.service";
import { InternalSessionService } from "./internal-session.service";
import { ReconciliationService } from "./reconciliation.service";
import { GameSessionsService } from "../game-sessions/game-sessions.service";
import { InternalRoute } from "../auth/internal-route.decorator";
import { ApiHttpException } from "../platform/http/api-http.exception";
import { requireContractVersion, requireMutationHeaders, type HttpHeaders } from "../platform/http/contract-headers";
import { ZodValidationPipe } from "../platform/http/zod-validation.pipe";

@InternalRoute()
@Throttle({ default: { limit: 1_000, ttl: 60_000 } })
@Controller("internal/v1")
export class InternalController {
  public constructor(
    private readonly sessions: InternalSessionService,
    private readonly settlements: InternalSettlementService,
    private readonly reconciliation: ReconciliationService,
    private readonly gameSessions: GameSessionsService,
  ) {}

  @Get("game-sessions/:gameId/bootstrap")
  public bootstrapSession(
    @Headers() headers: HttpHeaders,
    @Param("gameId") rawGameId: string,
  ): Promise<SessionBootstrapResponse> {
    requireContractVersion(headers);
    const gameId = GameIdSchema.safeParse(rawGameId);
    if (!gameId.success) throw new ApiHttpException("REQUEST_INVALID", 400, "Game ID is invalid");
    return this.sessions.bootstrap(gameId.data);
  }

  @Post("tickets/consume")
  public consumeTicket(
    @Headers() headers: HttpHeaders,
    @Body(new ZodValidationPipe(TicketConsumeRequestSchema)) body: TicketConsumeRequest,
  ): Promise<TicketConsumeResponse> {
    const mutation = requireMutationHeaders(headers);
    return this.sessions.consumeTicket(body, mutation.idempotencyKey);
  }

  @Post("game-sessions/:gameId/started")
  public markStarted(
    @Headers() headers: HttpHeaders,
    @Param("gameId") rawGameId: string,
    @Body(new ZodValidationPipe(SessionStartedRequestSchema)) body: {
      readonly roomId: string;
      readonly stateVersion: number;
    },
  ): Promise<OperationResponse> {
    const mutation = requireMutationHeaders(headers);
    const gameId = GameIdSchema.safeParse(rawGameId);
    if (!gameId.success) throw new ApiHttpException("REQUEST_INVALID", 400, "Game ID is invalid");
    return this.sessions.markStarted(gameId.data, body.roomId, body.stateVersion, mutation.idempotencyKey);
  }

  @Post("game-sessions/:gameId/settlement")
  public settleSession(
    @Headers() headers: HttpHeaders,
    @Param("gameId") rawGameId: string,
    @Body(new ZodValidationPipe(SettlementRequestSchema)) body: SettlementRequest,
  ): Promise<OperationResponse> {
    const mutation = requireMutationHeaders(headers);
    const gameId = GameIdSchema.safeParse(rawGameId);
    if (!gameId.success) throw new ApiHttpException("REQUEST_INVALID", 400, "Game ID is invalid");
    return this.settlements.settle(gameId.data, body, mutation.idempotencyKey);
  }

  @Post("game-sessions/:gameId/finalization")
  public finalizeSessionCommand(
    @Headers() headers: HttpHeaders,
    @Param("gameId") rawGameId: string,
    @Body(new ZodValidationPipe(RoomSessionFinalizationRequestSchema)) body: RoomSessionFinalizationRequest,
  ): Promise<OperationResponse> {
    const mutation = requireMutationHeaders(headers);
    const gameId = GameIdSchema.safeParse(rawGameId);
    if (!gameId.success) throw new ApiHttpException("REQUEST_INVALID", 400, "Game ID is invalid");
    return this.gameSessions.finalizeRoomCommand(gameId.data, body, mutation.idempotencyKey);
  }

  @Post("game-sessions/:gameId/abort")
  public abortSession(
    @Headers() headers: HttpHeaders,
    @Param("gameId") rawGameId: string,
    @Body(new ZodValidationPipe(AbortSessionRequestSchema)) body: AbortSessionRequest,
  ): Promise<OperationResponse> {
    const mutation = requireMutationHeaders(headers);
    const gameId = GameIdSchema.safeParse(rawGameId);
    if (!gameId.success) throw new ApiHttpException("REQUEST_INVALID", 400, "Game ID is invalid");
    return this.settlements.abort(gameId.data, body, mutation.idempotencyKey);
  }

  @Post("reconciliation/run")
  public runReconciliation(
    @Headers() headers: HttpHeaders,
    @Body(new ZodValidationPipe(ReconciliationRequestSchema)) _body: { readonly contractVersion: 1 },
  ): Promise<ReconciliationResponse> {
    requireMutationHeaders(headers);
    return this.reconciliation.run();
  }
}
