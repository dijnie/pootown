import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  CreateSessionRequestSchema,
  GameIdSchema,
  JoinIntentRequestSchema,
  type AdmissionResponse,
  type SessionDetail,
} from "@pootown/game-contracts";

import { GameSessionsService } from "./game-sessions.service";
import type { AuthenticatedRequest } from "../auth/privy-auth.guard";
import { Public } from "../auth/public.decorator";
import { ApiHttpException } from "../platform/http/api-http.exception";
import {
  requireContractVersion,
  requireMutationHeaders,
  type HttpHeaders,
} from "../platform/http/contract-headers";
import { ZodValidationPipe } from "../platform/http/zod-validation.pipe";

function principalFrom(request: AuthenticatedRequest) {
  if (request.principal === undefined) throw new ApiHttpException("AUTH_TOKEN_INVALID", 401, "Authenticated principal is unavailable");
  return request.principal;
}

@Controller("v1/game-sessions")
export class GameSessionsController {
  public constructor(private readonly sessions: GameSessionsService) {}

  @Public()
  @Get()
  public list(
    @Headers() headers: HttpHeaders,
    @Query("limit") rawLimit?: string,
    @Query("cursor") cursor?: string,
  ) {
    requireContractVersion(headers);
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor !== undefined && cursor.length > 512)) {
      throw new ApiHttpException("REQUEST_INVALID", 400, "Session pagination is invalid");
    }
    return this.sessions.listSessions(limit, cursor);
  }

  @Public()
  @Get(":gameId")
  public detail(
    @Headers() headers: HttpHeaders,
    @Param("gameId") rawGameId: string,
  ): Promise<SessionDetail> {
    requireContractVersion(headers);
    const gameId = GameIdSchema.safeParse(rawGameId);
    if (!gameId.success) throw new ApiHttpException("REQUEST_INVALID", 400, "Game ID is invalid");
    return this.sessions.getSession(gameId.data);
  }

  @Post()
  public create(
    @Req() request: AuthenticatedRequest,
    @Headers() headers: HttpHeaders,
    @Body(new ZodValidationPipe(CreateSessionRequestSchema)) body: { readonly gameDefinitionId: string },
  ): Promise<AdmissionResponse> {
    const mutation = requireMutationHeaders(headers);
    return this.sessions.createSession(principalFrom(request), body.gameDefinitionId, mutation.idempotencyKey);
  }

  @Post(":gameId/join-intents")
  public join(
    @Req() request: AuthenticatedRequest,
    @Headers() headers: HttpHeaders,
    @Param("gameId") rawGameId: string,
    @Body(new ZodValidationPipe(JoinIntentRequestSchema)) _body: unknown,
  ): Promise<AdmissionResponse> {
    const mutation = requireMutationHeaders(headers);
    const gameId = GameIdSchema.safeParse(rawGameId);
    if (!gameId.success) throw new ApiHttpException("REQUEST_INVALID", 400, "Game ID is invalid");
    return this.sessions.joinSession(principalFrom(request), gameId.data, mutation.idempotencyKey);
  }
}
