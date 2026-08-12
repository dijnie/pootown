import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { SignJWT } from "jose";

import { UserAccessTokenVerifier } from "../src/auth/access-token.verifier";
import type { AccessTokenVerifier } from "../src/auth/auth.types";
import { UserAuthGuard, type AuthenticatedRequest } from "../src/auth/user-auth.guard";

const secret = "access-secret-that-is-at-least-thirty-two-bytes";

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: <T>() => request as T,
      getResponse: <T>() => ({}) as T,
      getNext: <T>() => ({}) as T,
    }),
  } as unknown as ExecutionContext;
}

function verifier(): UserAccessTokenVerifier {
  return new UserAccessTokenVerifier(new ConfigService({
    AUTH_ACCESS_TOKEN_SECRET: secret,
    AUTH_TOKEN_ISSUER: "pootown-api",
    AUTH_ACCESS_TOKEN_AUDIENCE: "pootown-web",
    AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
  }));
}

describe("user access authentication", () => {
  it("extracts only an exact bearer token and binds verified claims", async () => {
    const tokenVerifier: AccessTokenVerifier = {
      async verify(token) {
        assert.equal(token, "header.payload.signature");
        return { userId: "user_1", sessionId: "session_1" };
      },
    };
    const request: AuthenticatedRequest = { headers: { authorization: "Bearer header.payload.signature" } };
    const guard = new UserAuthGuard(new Reflector(), tokenVerifier);
    assert.equal(await guard.canActivate(contextFor(request)), true);
    assert.deepEqual(request.principal, { userId: "user_1", sessionId: "session_1" });
  });

  it("rejects missing, malformed, and failed verification without retaining a token", async () => {
    const tokenVerifier: AccessTokenVerifier = { async verify() { throw new Error("verification failed"); } };
    const guard = new UserAuthGuard(new Reflector(), tokenVerifier);
    for (const authorization of [undefined, "bearer token", "Bearer", "Bearer token extra", "Basic token"]) {
      const request: AuthenticatedRequest = { headers: authorization === undefined ? {} : { authorization } };
      await assert.rejects(guard.canActivate(contextFor(request)), /Bearer access token required/);
      assert.equal(request.principal, undefined);
    }
    await assert.rejects(
      guard.canActivate(contextFor({ headers: { authorization: "Bearer token" } })),
      /Access token invalid/,
    );
  });

  it("cryptographically rejects tampered, expired, premature, and wrong-authority tokens", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const sign = (overrides: { issuer?: string; audience?: string; expiration?: number; issuedAt?: number; notBefore?: number } = {}) => {
      let builder = new SignJWT({ sid: "session_1" })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(overrides.issuer ?? "pootown-api")
        .setAudience(overrides.audience ?? "pootown-web")
        .setSubject("user_1")
        .setIssuedAt(overrides.issuedAt ?? now)
        .setExpirationTime(overrides.expiration ?? now + 60);
      if (overrides.notBefore !== undefined) builder = builder.setNotBefore(overrides.notBefore);
      return builder.sign(new TextEncoder().encode(secret));
    };

    const accessVerifier = verifier();
    const valid = await sign();
    assert.deepEqual(await accessVerifier.verify(valid), { userId: "user_1", sessionId: "session_1" });
    const tamperIndex = valid.length - 10;
    const tampered = `${valid.slice(0, tamperIndex)}${valid[tamperIndex] === "A" ? "B" : "A"}${valid.slice(tamperIndex + 1)}`;
    await assert.rejects(accessVerifier.verify(tampered));
    await assert.rejects(accessVerifier.verify(await sign({ expiration: now - 1 })));
    await assert.rejects(accessVerifier.verify(await sign({ notBefore: now + 60 })));
    await assert.rejects(accessVerifier.verify(await sign({ issuedAt: now + 60, expiration: now + 120 })));
    await assert.rejects(accessVerifier.verify(await sign({ issuer: "attacker" })));
    await assert.rejects(accessVerifier.verify(await sign({ audience: "attacker" })));
  });
});
