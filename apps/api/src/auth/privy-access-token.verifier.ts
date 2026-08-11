import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { importSPKI, jwtVerify, type KeyLike } from "jose";

import type { AccessTokenVerifier, AuthenticatedPrincipal } from "./auth.types";

interface VerifiedPrivyClaims {
  readonly appId: string;
  readonly issuer: string;
  readonly issuedAt: number;
  readonly expiration: number;
  readonly sessionId: string;
  readonly userId: string;
}

type VerifyPrivyToken = (token: string, appId: string, verificationKey: string) => Promise<VerifiedPrivyClaims>;

async function verifyEs256PrivyToken(
  token: string,
  appId: string,
  verificationKey: string,
): Promise<VerifiedPrivyClaims> {
  const key = await importSPKI(verificationKey, "ES256");
  return verifyEs256PrivyTokenWithKey(token, appId, key);
}

async function verifyEs256PrivyTokenWithKey(
  token: string,
  appId: string,
  key: KeyLike,
): Promise<VerifiedPrivyClaims> {
  const { payload } = await jwtVerify(token, key, {
    typ: "JWT",
    algorithms: ["ES256"],
    issuer: "privy.io",
    audience: appId,
  });
  if (
    payload.aud !== appId ||
    payload.iss !== "privy.io" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    typeof payload.sid !== "string" ||
    typeof payload.sub !== "string"
  ) {
    throw new Error("Privy token payload is invalid");
  }
  return {
    appId: payload.aud,
    issuer: payload.iss,
    issuedAt: payload.iat,
    expiration: payload.exp,
    sessionId: payload.sid,
    userId: payload.sub,
  };
}

export async function verifyPrivyToken(
  token: string,
  appId: string,
  verificationKey: string,
  verify: VerifyPrivyToken = verifyEs256PrivyToken,
): Promise<AuthenticatedPrincipal> {
  const claims = await verify(token, appId, verificationKey);
  if (claims.issuer !== "privy.io" || claims.appId !== appId) {
    throw new Error("Privy token claims do not match configured authority");
  }
  if (claims.userId.length === 0 || claims.userId.length > 256) {
    throw new Error("Privy token user ID is invalid");
  }
  if (claims.sessionId.length === 0 || claims.sessionId.length > 256) {
    throw new Error("Privy token session ID is invalid");
  }
  return { privyDid: claims.userId, privySessionId: claims.sessionId };
}

@Injectable()
export class PrivyAccessTokenVerifier implements AccessTokenVerifier, OnModuleInit {
  private readonly appId: string;
  private readonly verificationKey: string;
  private key: KeyLike | undefined;

  public constructor(config: ConfigService) {
    this.appId = config.getOrThrow<string>("PRIVY_APP_ID");
    this.verificationKey = config.getOrThrow<string>("PRIVY_VERIFICATION_KEY");
  }

  public async onModuleInit(): Promise<void> {
    this.key = await importSPKI(this.verificationKey, "ES256");
  }

  public async verify(token: string): Promise<AuthenticatedPrincipal> {
    if (this.key === undefined) throw new Error("Privy verifier is not initialized");
    const claims = await verifyEs256PrivyTokenWithKey(token, this.appId, this.key);
    if (claims.userId.length === 0 || claims.userId.length > 256) {
      throw new Error("Privy token user ID is invalid");
    }
    if (claims.sessionId.length === 0 || claims.sessionId.length > 256) {
      throw new Error("Privy token session ID is invalid");
    }
    return { privyDid: claims.userId, privySessionId: claims.sessionId };
  }
}
