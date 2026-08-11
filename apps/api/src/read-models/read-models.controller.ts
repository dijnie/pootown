import { Controller, Get, Headers, Query, Req } from "@nestjs/common";
import type { LeaderboardResponse, SessionHistoryResponse } from "@pootown/game-contracts";

import { ReadModelsService } from "./read-models.service";
import type { AuthenticatedRequest } from "../auth/privy-auth.guard";
import { Public } from "../auth/public.decorator";
import { ApiHttpException } from "../platform/http/api-http.exception";
import { requireContractVersion, type HttpHeaders } from "../platform/http/contract-headers";

function boundedPage(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ApiHttpException("REQUEST_INVALID", 400, "Pagination is invalid");
  }
  return parsed;
}

@Controller("v1/leaderboard")
export class LeaderboardController {
  public constructor(private readonly readModels: ReadModelsService) {}

  @Public()
  @Get("top-players")
  public list(
    @Headers() headers: HttpHeaders,
    @Query("page") rawPage?: string,
    @Query("limit") rawLimit?: string,
  ): Promise<LeaderboardResponse> {
    requireContractVersion(headers);
    const page = boundedPage(rawPage, 1, 10_000_000);
    const limit = boundedPage(rawLimit, 20, 100);
    if ((page - 1) * limit > Number.MAX_SAFE_INTEGER - limit) {
      throw new ApiHttpException("REQUEST_INVALID", 400, "Pagination is invalid");
    }
    return this.readModels.leaderboard(page, limit);
  }
}

@Controller("v1/me/history")
export class SessionHistoryController {
  public constructor(private readonly readModels: ReadModelsService) {}

  @Get()
  public list(
    @Req() request: AuthenticatedRequest,
    @Headers() headers: HttpHeaders,
    @Query("limit") rawLimit?: string,
    @Query("cursor") cursor?: string,
  ): Promise<SessionHistoryResponse> {
    requireContractVersion(headers);
    if (request.principal === undefined) {
      throw new ApiHttpException("AUTH_TOKEN_INVALID", 401, "Authenticated principal is unavailable");
    }
    if (cursor !== undefined && cursor.length > 512) {
      throw new ApiHttpException("REQUEST_INVALID", 400, "History cursor is invalid");
    }
    return this.readModels.history(request.principal, boundedPage(rawLimit, 20, 100), cursor);
  }
}
