import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";

import type { AccessTokenVerifier } from "../src/auth/auth.types";
import { InternalAuthGuard, type InternalAuthenticatedRequest } from "../src/auth/internal-auth.guard";
import type { InternalCallerVerifier } from "../src/auth/internal-caller.types";
import { verifyInternalToken } from "../src/auth/internal-service-token.verifier";
import { PrivyAuthGuard } from "../src/auth/privy-auth.guard";

function contextFor(request: InternalAuthenticatedRequest): ExecutionContext {
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

function reflector(value: boolean): Reflector {
  return { getAllAndOverride: () => value } as unknown as Reflector;
}

describe("internal service authentication", () => {
  it("cryptographically verifies short-lived ES256 service credentials", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicKeyPem = await exportSPKI(publicKey);
    const now = Math.floor(Date.now() / 1000);
    const sign = (overrides: {
      readonly issuer?: string;
      readonly audience?: string;
      readonly subject?: string;
      readonly jwtId?: string | null;
      readonly issuedAt?: number;
      readonly expiration?: number;
      readonly notBefore?: number;
    } = {}) => {
      let token = new SignJWT({})
        .setProtectedHeader({ alg: "ES256", typ: "JWT" })
        .setIssuer(overrides.issuer ?? "pootown-internal")
        .setAudience(overrides.audience ?? "pootown-api")
        .setSubject(overrides.subject ?? "game-server")
        .setIssuedAt(overrides.issuedAt ?? now)
        .setExpirationTime(overrides.expiration ?? now + 60);
      if (overrides.jwtId !== null) token = token.setJti(overrides.jwtId ?? "jwt_1");
      if (overrides.notBefore !== undefined) token = token.setNotBefore(overrides.notBefore);
      return token.sign(privateKey);
    };

    const validToken = await sign();
    assert.deepEqual(
      await verifyInternalToken(validToken, "pootown-internal", "pootown-api", publicKeyPem),
      { serviceId: "game-server", jwtId: "jwt_1" },
    );
    const tamperIndex = validToken.length - 10;
    const tamperedCharacter = validToken[tamperIndex] === "A" ? "B" : "A";
    const tampered = `${validToken.slice(0, tamperIndex)}${tamperedCharacter}${validToken.slice(tamperIndex + 1)}`;
    await assert.rejects(verifyInternalToken(tampered, "pootown-internal", "pootown-api", publicKeyPem));
    await assert.rejects(verifyInternalToken(await sign({ issuer: "attacker" }), "pootown-internal", "pootown-api", publicKeyPem));
    await assert.rejects(verifyInternalToken(await sign({ audience: "other" }), "pootown-internal", "pootown-api", publicKeyPem));
    await assert.rejects(verifyInternalToken(await sign({ expiration: now - 1 }), "pootown-internal", "pootown-api", publicKeyPem));
    await assert.rejects(verifyInternalToken(await sign({ notBefore: now + 60 }), "pootown-internal", "pootown-api", publicKeyPem));
    await assert.rejects(verifyInternalToken(await sign({ jwtId: null }), "pootown-internal", "pootown-api", publicKeyPem));
    await assert.rejects(verifyInternalToken(
      await sign({ issuedAt: now + 86_400, expiration: now + 86_460 }),
      "pootown-internal",
      "pootown-api",
      publicKeyPem,
    ));
    await assert.rejects(verifyInternalToken(
      await sign({ expiration: now + 301 }),
      "pootown-internal",
      "pootown-api",
      publicKeyPem,
    ));
  });

  it("binds only internal routes and keeps Privy verification out of that boundary", async () => {
    const verifier: InternalCallerVerifier = {
      async verify(token) {
        assert.equal(token, "header.payload.signature");
        return { serviceId: "game-server", jwtId: "jwt_1" };
      },
    };
    const request: InternalAuthenticatedRequest = {
      headers: { authorization: "Bearer header.payload.signature" },
    };
    const guard = new InternalAuthGuard(reflector(true), verifier);
    assert.equal(await guard.canActivate(contextFor(request)), true);
    assert.deepEqual(request.internalPrincipal, { serviceId: "game-server", jwtId: "jwt_1" });

    for (const authorization of [undefined, "Bearer", "Bearer token extra", "Basic token"]) {
      const invalid: InternalAuthenticatedRequest = {
        headers: authorization === undefined ? {} : { authorization },
      };
      await assert.rejects(guard.canActivate(contextFor(invalid)), /Internal service credential required/);
      assert.equal(invalid.internalPrincipal, undefined);
    }
    const failed = new InternalAuthGuard(reflector(true), { async verify() { throw new Error("invalid"); } });
    await assert.rejects(
      failed.canActivate(contextFor({ headers: { authorization: "Bearer token" } })),
      /Internal service credential invalid/,
    );

    let internalVerifierCalled = false;
    const normalGuard = new InternalAuthGuard(reflector(false), {
      async verify() {
        internalVerifierCalled = true;
        throw new Error("must not run");
      },
    });
    assert.equal(await normalGuard.canActivate(contextFor({ headers: {} })), true);
    assert.equal(internalVerifierCalled, false);

    let privyVerifierCalled = false;
    const privyVerifier: AccessTokenVerifier = {
      async verify() {
        privyVerifierCalled = true;
        throw new Error("must not run");
      },
    };
    const privyGuard = new PrivyAuthGuard(reflector(true), privyVerifier);
    assert.equal(await privyGuard.canActivate(contextFor({ headers: {} })), true);
    assert.equal(privyVerifierCalled, false);
  });
});
