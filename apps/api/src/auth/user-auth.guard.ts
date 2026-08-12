import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ACCESS_TOKEN_VERIFIER, type AccessTokenVerifier } from "./auth.types";
import { extractBearerToken } from "./bearer-token";
import { INTERNAL_ROUTE } from "./internal-route.decorator";
import { PUBLIC_ROUTE } from "./public.decorator";
import { ApiHttpException } from "../platform/http/api-http.exception";

export interface AuthenticatedRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  principal?: Awaited<ReturnType<AccessTokenVerifier["verify"]>>;
}

@Injectable()
export class UserAuthGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(INTERNAL_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = extractBearerToken(typeof authorization === "string" ? authorization : undefined);
    if (token === null) {
      throw new ApiHttpException("AUTH_TOKEN_MISSING", 401, "Bearer access token required");
    }
    try {
      request.principal = await this.verifier.verify(token);
      return true;
    } catch {
      throw new ApiHttpException("AUTH_TOKEN_INVALID", 401, "Access token invalid");
    }
  }
}
