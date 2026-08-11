import { randomUUID } from "node:crypto";
import { importPKCS8, SignJWT, type KeyLike } from "jose";

export interface ServiceCredentialConfig {
  readonly audience: string;
  readonly issuer: string;
  readonly privateKeyPem: string;
  readonly serviceId: string;
}

export interface ServiceCredentialProvider {
  issue(now?: Date): Promise<string>;
}

export class Es256ServiceCredentialProvider implements ServiceCredentialProvider {
  private constructor(
    private readonly config: ServiceCredentialConfig,
    private readonly privateKey: KeyLike,
  ) {}

  public static async create(config: ServiceCredentialConfig): Promise<Es256ServiceCredentialProvider> {
    const privateKey = await importPKCS8(config.privateKeyPem, "ES256");
    return new Es256ServiceCredentialProvider(config, privateKey);
  }

  public issue(now = new Date()): Promise<string> {
    const issuedAt = Math.floor(now.getTime() / 1_000);
    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(this.config.serviceId)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(issuedAt + 60)
      .sign(this.privateKey);
  }
}
