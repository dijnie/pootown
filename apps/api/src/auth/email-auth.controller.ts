import { Body, Controller, Headers, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import {
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshSessionRequestSchema,
  RegisterRequestSchema,
  type AuthSessionResponse,
  type LoginRequest,
  type LogoutResponse,
  type RegisterRequest,
} from "@pootown/game-contracts";

import { EmailAuthService } from "./email-auth.service";
import { Public } from "./public.decorator";
import type { HttpHeaders } from "../platform/http/contract-headers";
import { requireContractVersion } from "../platform/http/contract-headers";
import { ApiHttpException } from "../platform/http/api-http.exception";
import { ZodValidationPipe } from "../platform/http/zod-validation.pipe";

const REFRESH_COOKIE = "pootown_refresh";

interface CookieRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

interface HeaderReply {
  header(name: string, value: string): unknown;
}

function refreshCookie(request: CookieRequest): string | null {
  const header = request.headers.cookie;
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === REFRESH_COOKIE && value.length > 0) return value.join("=");
  }
  return null;
}

@Public()
@Controller("v1/auth")
export class EmailAuthController {
  private readonly secureCookie: boolean;

  public constructor(private readonly auth: EmailAuthService, config: ConfigService) {
    this.secureCookie = config.getOrThrow<string>("NODE_ENV") === "production";
  }

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  public async register(
    @Headers() headers: HttpHeaders,
    @Body(new ZodValidationPipe(RegisterRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) reply: HeaderReply,
  ): Promise<AuthSessionResponse> {
    requireContractVersion(headers);
    const issued = await this.auth.register(body);
    this.setRefreshCookie(reply, issued.refreshToken, issued.refreshExpiresAt);
    return issued.response;
  }

  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  public async login(
    @Headers() headers: HttpHeaders,
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) reply: HeaderReply,
  ): Promise<AuthSessionResponse> {
    requireContractVersion(headers);
    const issued = await this.auth.login(body);
    this.setRefreshCookie(reply, issued.refreshToken, issued.refreshExpiresAt);
    return issued.response;
  }

  @Post("refresh")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  public async refresh(
    @Headers() headers: HttpHeaders,
    @Body(new ZodValidationPipe(RefreshSessionRequestSchema)) _body: unknown,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) reply: HeaderReply,
  ): Promise<AuthSessionResponse> {
    requireContractVersion(headers);
    const token = refreshCookie(request);
    if (token === null) throw new ApiHttpException("AUTH_SESSION_INVALID", 401, "Session is invalid");
    const issued = await this.auth.refresh(token);
    this.setRefreshCookie(reply, issued.refreshToken, issued.refreshExpiresAt);
    return issued.response;
  }

  @Post("logout")
  public async logout(
    @Headers() headers: HttpHeaders,
    @Body(new ZodValidationPipe(LogoutRequestSchema)) _body: unknown,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) reply: HeaderReply,
  ): Promise<LogoutResponse> {
    requireContractVersion(headers);
    const response = await this.auth.logout(refreshCookie(request));
    this.clearRefreshCookie(reply);
    return response;
  }

  private setRefreshCookie(reply: HeaderReply, token: string, expiresAt: Date): void {
    const secure = this.secureCookie ? "; Secure" : "";
    reply.header(
      "Set-Cookie",
      `${REFRESH_COOKIE}=${token}; Path=/v1/auth; HttpOnly; SameSite=Strict${secure}; Expires=${expiresAt.toUTCString()}`,
    );
  }

  private clearRefreshCookie(reply: HeaderReply): void {
    const secure = this.secureCookie ? "; Secure" : "";
    reply.header(
      "Set-Cookie",
      `${REFRESH_COOKIE}=; Path=/v1/auth; HttpOnly; SameSite=Strict${secure}; Max-Age=0`,
    );
  }
}
