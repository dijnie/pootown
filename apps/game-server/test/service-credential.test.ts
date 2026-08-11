import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from "jose";

import { Es256ServiceCredentialProvider } from "../src/auth/service-credential.js";

describe("internal service credentials", () => {
  it("signs a short-lived audience-bound ES256 credential", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const provider = await Es256ServiceCredentialProvider.create({
      audience: "pootown-api",
      issuer: "pootown-internal",
      privateKeyPem: await exportPKCS8(privateKey),
      serviceId: "game-server-1",
    });
    const token = await provider.issue(new Date("2026-08-11T15:00:00.000Z"));
    const verificationKey = await importSPKI(await exportSPKI(publicKey), "ES256");
    const verified = await jwtVerify(token, verificationKey, {
      algorithms: ["ES256"],
      audience: "pootown-api",
      issuer: "pootown-internal",
      currentDate: new Date("2026-08-11T15:00:01.000Z"),
    });
    assert.equal(verified.payload.sub, "game-server-1");
    assert.equal(verified.payload.exp, verified.payload.iat as number + 60);
    assert.equal(typeof verified.payload.jti, "string");
    await assert.rejects(jwtVerify(token, verificationKey, {
      algorithms: ["ES256"],
      audience: "other-api",
      issuer: "pootown-internal",
      currentDate: new Date("2026-08-11T15:00:01.000Z"),
    }));
  });

  it("fails startup key import for malformed private material", async () => {
    await assert.rejects(Es256ServiceCredentialProvider.create({
      audience: "pootown-api",
      issuer: "pootown-internal",
      privateKeyPem: "not-a-private-key",
      serviceId: "game-server-1",
    }));
  });
});
