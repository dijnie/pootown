import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { GameIdSchema, type OperationResponse } from "@pootown/game-contracts";
import {
  AbortSessionRequestSchema,
  SessionStartedRequestSchema,
  SettlementRequestSchema,
  TicketConsumeRequestSchema,
  type AbortSessionRequest,
  type SettlementRequest,
  type TicketConsumeRequest,
  type TicketConsumeResponse,
} from "@pootown/game-contracts/internal";

import { InternalSettlementService } from "./internal-settlement.service";
import { InternalSessionService } from "./internal-session.service";
import { InternalRoute } from "../auth/internal-route.decorator";
import { ApiHttpException } from "../platform/http/api-http.exception";
import { requireMutationHeaders, type HttpHeaders } from "../platform/http/contract-headers";
import { ZodValidationPipe } from "../platform/http/zod-validation.pipe";

@InternalRoute()
@Controller("internal/v1")
export class InternalController {
  public constructor(
    private readonly sessions: InternalSessionService,
    private readonly settlements: InternalSettlementService,
  ) {}

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
}
