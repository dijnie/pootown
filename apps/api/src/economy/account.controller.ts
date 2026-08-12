import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  RescueGrantRequestSchema,
  type CoinBalanceResponse,
  type CoinOperationsResponse,
  type RescueGrantResponse,
  type UserView,
} from "@pootown/game-contracts";

import { EconomyService } from "./economy.service";
import type { AuthenticatedRequest } from "../auth/user-auth.guard";
import { ApiHttpException } from "../platform/http/api-http.exception";
import {
  requireContractVersion,
  requireMutationHeaders,
  type HttpHeaders,
} from "../platform/http/contract-headers";
import { ZodValidationPipe } from "../platform/http/zod-validation.pipe";

function principalFrom(request: AuthenticatedRequest) {
  if (request.principal === undefined) {
    throw new ApiHttpException("AUTH_TOKEN_INVALID", 401, "Authenticated principal is unavailable");
  }
  return request.principal;
}

@Controller("v1/me")
export class AccountController {
  public constructor(private readonly economy: EconomyService) {}

  @Get()
  public async me(
    @Req() request: AuthenticatedRequest,
    @Headers() headers: HttpHeaders,
  ): Promise<UserView> {
    requireContractVersion(headers);
    return (await this.economy.provisionPrincipal(principalFrom(request))).user;
  }

  @Get("coins")
  public async balance(
    @Req() request: AuthenticatedRequest,
    @Headers() headers: HttpHeaders,
  ): Promise<CoinBalanceResponse> {
    requireContractVersion(headers);
    return (await this.economy.provisionPrincipal(principalFrom(request))).balance;
  }

  @Get("coin-operations")
  public operations(
    @Req() request: AuthenticatedRequest,
    @Headers() headers: HttpHeaders,
    @Query("limit") rawLimit?: string,
    @Query("cursor") cursor?: string,
  ): Promise<CoinOperationsResponse> {
    requireContractVersion(headers);
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor !== undefined && cursor.length > 512)) {
      throw new ApiHttpException("REQUEST_INVALID", 400, "Operation pagination is invalid");
    }
    return this.economy.listOperations(principalFrom(request), limit, cursor);
  }

  @Post("coins/rescue")
  public rescue(
    @Req() request: AuthenticatedRequest,
    @Headers() headers: HttpHeaders,
    @Body(new ZodValidationPipe(RescueGrantRequestSchema)) _body: unknown,
  ): Promise<RescueGrantResponse> {
    const mutation = requireMutationHeaders(headers);
    return this.economy.rescue(principalFrom(request), mutation.idempotencyKey);
  }
}
