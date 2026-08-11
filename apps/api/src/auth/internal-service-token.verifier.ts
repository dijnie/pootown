import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { importSPKI, jwtVerify, type KeyLike, type JWTPayload } from "jose";

import type { InternalCallerPrincipal, InternalCallerVerifier } from "./internal-caller.types";

const MAX_INTERNAL_TOKEN_LIFETIME_SECONDS = 300;
const INTERNAL_TOKEN_CLOCK_SKEW_SECONDS = 5;
const serviceIdPattern = /^[A-Za-z0-9._:-]+$/;

async function verifyWithKey(
  token: string,
  issuer: string,
  audience: string,
  key: KeyLike,
): Promise<JWTPayload> {
  const result = await jwtVerify(token, key, {
    typ: "JWT",
    algorithms: ["ES256"],
    issuer,
    audience,
  });
  return result.payload;
}

export async function verifyInternalToken(
  token: string,
  issuer: string,
  audience: string,
  verificationKey: string,
): Promise<InternalCallerPrincipal> {
  const key = await importSPKI(verificationKey, "ES256");
  return verifiedInternalPrincipal(await verifyWithKey(token, issuer, audience, key));
}

function verifiedInternalPrincipal(payload: JWTPayload): InternalCallerPrincipal {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    payload.sub.length > 128 ||
    !serviceIdPattern.test(payload.sub) ||
    typeof payload.jti !== "string" ||
    payload.jti.length === 0 ||
    payload.jti.length > 128 ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    payload.iat > nowSeconds + INTERNAL_TOKEN_CLOCK_SKEW_SECONDS ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > MAX_INTERNAL_TOKEN_LIFETIME_SECONDS
  ) {
    throw new Error("Internal service token claims are invalid");
  }
  return { serviceId: payload.sub, jwtId: payload.jti };
}

@Injectable()
export class InternalServiceTokenVerifier implements InternalCallerVerifier, OnModuleInit {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly verificationKey: string;
  private key: KeyLike | undefined;

  public constructor(config: ConfigService) {
    this.issuer = config.getOrThrow<string>("INTERNAL_JWT_ISSUER");
    this.audience = config.getOrThrow<string>("INTERNAL_JWT_AUDIENCE");
    this.verificationKey = config.getOrThrow<string>("INTERNAL_JWT_PUBLIC_KEY");
  }

  public async onModuleInit(): Promise<void> {
    this.key = await importSPKI(this.verificationKey, "ES256");
  }

  public async verify(token: string): Promise<InternalCallerPrincipal> {
    if (this.key === undefined) throw new Error("Internal caller verifier is not initialized");
    return verifiedInternalPrincipal(await verifyWithKey(token, this.issuer, this.audience, this.key));
  }
}
