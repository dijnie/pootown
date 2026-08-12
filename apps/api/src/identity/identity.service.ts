import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import type { AuthenticatedPrincipal } from "../auth/auth.types";

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
}

export interface UserCredentialsRecord extends UserRecord {
  readonly passwordHash: string;
}

interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly password_hash: string;
  readonly created_at: Date;
  readonly last_seen_at: Date;
}

function record(row: UserRow): UserCredentialsRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

@Injectable()
export class IdentityService {
  public async createEmailUser(
    client: PoolClient,
    email: string,
    passwordHash: string,
    now: Date,
  ): Promise<UserCredentialsRecord> {
    const result = await client.query<UserRow>(
      `
        INSERT INTO identity.users (id, email, password_hash, created_at, updated_at, last_seen_at)
        VALUES ($1, $2, $3, $4, $4, $4)
        RETURNING id, email, password_hash, created_at, last_seen_at
      `,
      [randomUUID(), email, passwordHash, now],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Identity insert returned no user");
    return record(row);
  }

  public async findByEmailForLogin(client: PoolClient, email: string): Promise<UserCredentialsRecord | null> {
    const result = await client.query<UserRow>(
      `
        SELECT id, email, password_hash, created_at, last_seen_at
        FROM identity.users
        WHERE email = $1
      `,
      [email],
    );
    const row = result.rows[0];
    return row === undefined ? null : record(row);
  }

  public async findAndTouchPrincipal(
    client: PoolClient,
    principal: AuthenticatedPrincipal,
    now: Date,
  ): Promise<UserRecord> {
    const result = await client.query<UserRow>(
      `
        UPDATE identity.users
        SET updated_at = GREATEST(updated_at, $2),
            last_seen_at = GREATEST(last_seen_at, $2)
        WHERE id = $1
        RETURNING id, email, password_hash, created_at, last_seen_at
      `,
      [principal.userId, now],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Authenticated user does not exist");
    return record(row);
  }
}
