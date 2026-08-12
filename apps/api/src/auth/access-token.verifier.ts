import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { jwtVerify } from "jose";

import type { AccessTokenVerifier, AuthenticatedPrincipal } from "./auth.types";

@Injectable()
export class UserAccessTokenVerifier implements AccessTokenVerifier {
  private readonly secret: Uint8Array;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly maximumTtlSeconds: number;

  public constructor(config: ConfigService) {
    this.secret = new TextEncoder().encode(config.getOrThrow<string>("AUTH_ACCESS_TOKEN_SECRET"));
    this.issuer = config.getOrThrow<string>("AUTH_TOKEN_ISSUER");
    this.audience = config.getOrThrow<string>("AUTH_ACCESS_TOKEN_AUDIENCE");
    this.maximumTtlSeconds = config.getOrThrow<number>("AUTH_ACCESS_TOKEN_TTL_SECONDS");
  }

  public async verify(token: string): Promise<AuthenticatedPrincipal> {
    const { payload, protectedHeader } = await jwtVerify(token, this.secret, {
      algorithms: ["HS256"],
      issuer: this.issuer,
      audience: this.audience,
      requiredClaims: ["sub", "sid", "iat", "exp"],
    });
    if (
      protectedHeader.typ !== "JWT"
      || typeof payload.sub !== "string"
      || payload.sub.length === 0
      || payload.sub.length > 128
      || typeof payload.sid !== "string"
      || payload.sid.length === 0
      || payload.sid.length > 128
      || typeof payload.iat !== "number"
      || typeof payload.exp !== "number"
      || payload.iat > Math.floor(Date.now() / 1_000) + 5
      || payload.exp - payload.iat > this.maximumTtlSeconds
    ) {
      throw new Error("Access token claims are invalid");
    }
    return { userId: payload.sub, sessionId: payload.sid };
  }
}
