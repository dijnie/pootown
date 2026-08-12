import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AuthSessionResponseSchema,
  CONTRACT_VERSION,
  LogoutResponseSchema,
  type AuthSessionResponse,
  type LoginRequest,
  type LogoutResponse,
  type RegisterRequest,
} from "@pootown/game-contracts";
import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { Pool, PoolClient } from "pg";

import { DATABASE_POOL } from "../database/database.constants";
import { withTransaction } from "../database/transaction";
import { EconomyService } from "../economy/economy.service";
import { IdentityService, type UserRecord } from "../identity/identity.service";
import { ApiHttpException } from "../platform/http/api-http.exception";

const BCRYPT_COST = 12;
const DUMMY_PASSWORD_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.8lY5fYp6XvFwvMZg4lH8zcQxG6F6I5K";

interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly refresh_token_hash: Buffer;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
}

export interface IssuedSession {
  readonly response: AuthSessionResponse;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function postgresCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

@Injectable()
export class EmailAuthService {
  private readonly accessSecret: Uint8Array;
  private readonly refreshSecret: Uint8Array;
  private readonly issuer: string;
  private readonly accessAudience: string;
  private readonly refreshAudience: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    config: ConfigService,
    private readonly identity: IdentityService,
    private readonly economy: EconomyService,
  ) {
    this.accessSecret = new TextEncoder().encode(config.getOrThrow<string>("AUTH_ACCESS_TOKEN_SECRET"));
    this.refreshSecret = new TextEncoder().encode(config.getOrThrow<string>("AUTH_REFRESH_TOKEN_SECRET"));
    this.issuer = config.getOrThrow<string>("AUTH_TOKEN_ISSUER");
    this.accessAudience = config.getOrThrow<string>("AUTH_ACCESS_TOKEN_AUDIENCE");
    this.refreshAudience = config.getOrThrow<string>("AUTH_REFRESH_TOKEN_AUDIENCE");
    this.accessTtlSeconds = config.getOrThrow<number>("AUTH_ACCESS_TOKEN_TTL_SECONDS");
    this.refreshTtlSeconds = config.getOrThrow<number>("AUTH_REFRESH_TOKEN_TTL_SECONDS");
  }

  public async register(request: RegisterRequest, now = new Date()): Promise<IssuedSession> {
    const passwordHash = await hash(request.password, BCRYPT_COST);
    try {
      return await withTransaction(this.pool, async (client) => {
        const user = await this.identity.createEmailUser(client, request.email, passwordHash, now);
        await this.economy.provisionUser(client, user, now);
        return this.createSession(client, user, now);
      }, { maximumAttempts: 1 });
    } catch (error) {
      if (postgresCode(error) === "23505") {
        throw new ApiHttpException("AUTH_EMAIL_EXISTS", 409, "Email is already registered");
      }
      throw error;
    }
  }

  public async login(request: LoginRequest, now = new Date()): Promise<IssuedSession> {
    const result = await withTransaction(this.pool, async (client) => {
      const user = await this.identity.findByEmailForLogin(client, request.email);
      const matches = await compare(request.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
      if (user === null || !matches) return null;
      const touched = await this.identity.findAndTouchPrincipal(
        client,
        { userId: user.id, sessionId: "login" },
        now,
      );
      return this.createSession(client, touched, now);
    }, { maximumAttempts: 1 });
    if (result === null) {
      throw new ApiHttpException("AUTH_CREDENTIALS_INVALID", 401, "Email or password is invalid");
    }
    return result;
  }

  public async refresh(refreshToken: string, now = new Date()): Promise<IssuedSession> {
    const claims = await this.verifyRefreshToken(refreshToken, now).catch(() => null);
    if (claims === null) throw new ApiHttpException("AUTH_SESSION_INVALID", 401, "Session is invalid");

    const outcome = await withTransaction(this.pool, async (client) => {
      const result = await client.query<SessionRow>(
        `SELECT id, user_id, refresh_token_hash, expires_at, revoked_at
         FROM identity.auth_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [claims.sessionId, claims.userId],
      );
      const session = result.rows[0];
      if (session === undefined || session.revoked_at !== null || session.expires_at <= now) return null;
      const presentedHash = tokenHash(refreshToken);
      if (!timingSafeEqual(session.refresh_token_hash, presentedHash)) {
        await client.query(
          `UPDATE identity.auth_sessions
           SET revoked_at = GREATEST(updated_at, $2),
               updated_at = GREATEST(updated_at, $2)
           WHERE id = $1`,
          [session.id, now],
        );
        return null;
      }
      const user = await this.identity.findAndTouchPrincipal(
        client,
        { userId: session.user_id, sessionId: session.id },
        now,
      );
      const issued = await this.issueTokens(user, session.id, now, session.expires_at);
      await client.query(
        `UPDATE identity.auth_sessions
         SET refresh_token_hash = $2, updated_at = GREATEST(updated_at, $3)
         WHERE id = $1`,
        [session.id, tokenHash(issued.refreshToken), now],
      );
      return issued;
    }, { maximumAttempts: 1 });
    if (outcome === null) throw new ApiHttpException("AUTH_SESSION_INVALID", 401, "Session is invalid");
    return outcome;
  }

  public async logout(refreshToken: string | null, now = new Date()): Promise<LogoutResponse> {
    if (refreshToken !== null) {
      const claims = await this.verifyRefreshToken(refreshToken, now).catch(() => null);
      if (claims !== null) {
        await this.pool.query(
          `UPDATE identity.auth_sessions
           SET revoked_at = GREATEST(updated_at, $3),
               updated_at = GREATEST(updated_at, $3)
           WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
          [claims.sessionId, claims.userId, now],
        );
      }
    }
    return LogoutResponseSchema.parse({ contractVersion: CONTRACT_VERSION, loggedOut: true });
  }

  private async createSession(client: PoolClient, user: UserRecord, now: Date): Promise<IssuedSession> {
    const sessionId = randomUUID();
    const issued = await this.issueTokens(user, sessionId, now);
    await client.query(
      `INSERT INTO identity.auth_sessions
         (id, user_id, refresh_token_hash, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [sessionId, user.id, tokenHash(issued.refreshToken), issued.refreshExpiresAt, now],
    );
    return issued;
  }

  private async issueTokens(
    user: UserRecord,
    sessionId: string,
    now: Date,
    absoluteRefreshExpiry?: Date,
  ): Promise<IssuedSession> {
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const accessExpiresAt = issuedAt + this.accessTtlSeconds;
    const refreshExpiresAt = absoluteRefreshExpiry ?? new Date((issuedAt + this.refreshTtlSeconds) * 1_000);
    const accessToken = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.issuer).setAudience(this.accessAudience).setSubject(user.id)
      .setIssuedAt(issuedAt).setExpirationTime(accessExpiresAt).sign(this.accessSecret);
    const refreshToken = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.issuer).setAudience(this.refreshAudience).setSubject(user.id).setJti(randomUUID())
      .setIssuedAt(issuedAt).setExpirationTime(Math.floor(refreshExpiresAt.getTime() / 1_000))
      .sign(this.refreshSecret);
    return {
      response: AuthSessionResponseSchema.parse({
        contractVersion: CONTRACT_VERSION,
        accessToken,
        accessTokenExpiresAtMs: accessExpiresAt * 1_000,
        user: { userId: user.id, email: user.email },
      }),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private async verifyRefreshToken(
    token: string,
    now: Date,
  ): Promise<{ readonly userId: string; readonly sessionId: string }> {
    const { payload, protectedHeader } = await jwtVerify(token, this.refreshSecret, {
      algorithms: ["HS256"],
      issuer: this.issuer,
      audience: this.refreshAudience,
      requiredClaims: ["sub", "sid", "jti", "iat", "exp"],
      currentDate: now,
    });
    if (
      protectedHeader.typ !== "JWT"
      || typeof payload.sub !== "string"
      || typeof payload.sid !== "string"
      || payload.sub.length === 0
      || payload.sub.length > 128
      || payload.sid.length === 0
      || payload.sid.length > 128
      || typeof payload.iat !== "number"
      || typeof payload.exp !== "number"
      || payload.iat > Math.floor(now.getTime() / 1_000) + 5
      || payload.exp - payload.iat > this.refreshTtlSeconds
    ) throw new Error("Refresh token claims are invalid");
    return { userId: payload.sub, sessionId: payload.sid };
  }
}
