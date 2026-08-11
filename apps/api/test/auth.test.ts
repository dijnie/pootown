import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";

import type { AccessTokenVerifier } from "../src/auth/auth.types";
import { PrivyAuthGuard, type AuthenticatedRequest } from "../src/auth/privy-auth.guard";
import { verifyPrivyToken } from "../src/auth/privy-access-token.verifier";

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

describe("Privy authentication", () => {
  it("extracts only an exact bearer token and binds verified claims", async () => {
    const verifier: AccessTokenVerifier = {
      async verify(token) {
        assert.equal(token, "header.payload.signature");
        return { privyDid: "did:privy:user_1", privySessionId: "session_1" };
      },
    };
    const request: AuthenticatedRequest = {
      headers: { authorization: "Bearer header.payload.signature" },
    };
    const guard = new PrivyAuthGuard(new Reflector(), verifier);
    assert.equal(await guard.canActivate(contextFor(request)), true);
    assert.deepEqual(request.principal, {
      privyDid: "did:privy:user_1",
      privySessionId: "session_1",
    });
  });

  it("rejects missing, malformed, and failed verification without retaining a token", async () => {
    const verifier: AccessTokenVerifier = { async verify() { throw new Error("verification failed"); } };
    const guard = new PrivyAuthGuard(new Reflector(), verifier);
    for (const authorization of [undefined, "bearer token", "Bearer", "Bearer token extra", "Basic token"]) {
      const request: AuthenticatedRequest = {
        headers: authorization === undefined ? {} : { authorization },
      };
      await assert.rejects(guard.canActivate(contextFor(request)), /Bearer access token required/);
      assert.equal(request.principal, undefined);
    }
    const failed: AuthenticatedRequest = { headers: { authorization: "Bearer token" } };
    await assert.rejects(guard.canActivate(contextFor(failed)), /Access token invalid/);
    assert.equal(failed.principal, undefined);
  });

  it("fails closed when Privy claims have a wrong issuer or app", async () => {
    const baseClaims = {
      appId: "app_1",
      issuer: "privy.io",
      issuedAt: 1,
      expiration: 2,
      sessionId: "session_1",
      userId: "did:privy:user_1",
    };
    await assert.rejects(
      verifyPrivyToken("token", "app_1", "key", async () => ({ ...baseClaims, issuer: "attacker" })),
      /configured authority/,
    );
    await assert.rejects(
      verifyPrivyToken("token", "app_1", "key", async () => ({ ...baseClaims, appId: "app_2" })),
      /configured authority/,
    );
  });

  it("cryptographically rejects tampered, expired, premature, and wrong-authority tokens", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const verificationKey = await exportSPKI(publicKey);
    const now = Math.floor(Date.now() / 1000);
    const sign = (overrides: { issuer?: string; audience?: string; expiration?: number; notBefore?: number } = {}) => {
      let builder = new SignJWT({ sid: "session_1" })
        .setProtectedHeader({ alg: "ES256", typ: "JWT" })
        .setIssuer(overrides.issuer ?? "privy.io")
        .setAudience(overrides.audience ?? "app_1")
        .setSubject("did:privy:user_1")
        .setIssuedAt(now)
        .setExpirationTime(overrides.expiration ?? now + 60);
      if (overrides.notBefore !== undefined) builder = builder.setNotBefore(overrides.notBefore);
      return builder.sign(privateKey);
    };

    const valid = await sign();
    assert.deepEqual(await verifyPrivyToken(valid, "app_1", verificationKey), {
      privyDid: "did:privy:user_1",
      privySessionId: "session_1",
    });
    const tamperIndex = valid.length - 10;
    const tamperedCharacter = valid[tamperIndex] === "A" ? "B" : "A";
    const tampered = `${valid.slice(0, tamperIndex)}${tamperedCharacter}${valid.slice(tamperIndex + 1)}`;
    await assert.rejects(verifyPrivyToken(tampered, "app_1", verificationKey));
    await assert.rejects(verifyPrivyToken(await sign({ expiration: now - 1 }), "app_1", verificationKey));
    await assert.rejects(verifyPrivyToken(await sign({ notBefore: now + 60 }), "app_1", verificationKey));
    await assert.rejects(verifyPrivyToken(await sign({ issuer: "attacker" }), "app_1", verificationKey));
    await assert.rejects(verifyPrivyToken(await sign({ audience: "app_2" }), "app_1", verificationKey));
  });
});
