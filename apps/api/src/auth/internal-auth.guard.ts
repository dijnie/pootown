import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { extractBearerToken } from "./bearer-token";
import {
  INTERNAL_CALLER_VERIFIER,
  type InternalCallerPrincipal,
  type InternalCallerVerifier,
} from "./internal-caller.types";
import { INTERNAL_ROUTE } from "./internal-route.decorator";
import { ApiHttpException } from "../platform/http/api-http.exception";

export interface InternalAuthenticatedRequest {
  readonly headers: { readonly authorization?: string };
  internalPrincipal?: InternalCallerPrincipal;
}

@Injectable()
export class InternalAuthGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    @Inject(INTERNAL_CALLER_VERIFIER) private readonly verifier: InternalCallerVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const internal = this.reflector.getAllAndOverride<boolean>(INTERNAL_ROUTE, [context.getHandler(), context.getClass()]);
    if (!internal) return true;
    const request = context.switchToHttp().getRequest<InternalAuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (token === null) {
      throw new ApiHttpException("INTERNAL_CALLER_UNAUTHORIZED", 401, "Internal service credential required");
    }
    try {
      request.internalPrincipal = await this.verifier.verify(token);
      return true;
    } catch {
      throw new ApiHttpException("INTERNAL_CALLER_UNAUTHORIZED", 401, "Internal service credential invalid");
    }
  }
}
