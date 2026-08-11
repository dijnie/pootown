import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ACCESS_TOKEN_VERIFIER, type AccessTokenVerifier } from "./auth.types";
import { PUBLIC_ROUTE } from "./public.decorator";
import { ApiHttpException } from "../platform/http/api-http.exception";

export interface AuthenticatedRequest {
  readonly headers: { readonly authorization?: string };
  principal?: Awaited<ReturnType<AccessTokenVerifier["verify"]>>;
}

function bearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  return match?.[1] ?? null;
}

@Injectable()
export class PrivyAuthGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
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
