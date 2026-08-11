import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import type { AuthenticatedPrincipal } from "../auth/auth.types";

export interface UserRecord {
  readonly id: string;
  readonly privyDid: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
}

interface UserRow {
  readonly id: string;
  readonly privy_did: string;
  readonly created_at: Date;
  readonly last_seen_at: Date;
}

@Injectable()
export class IdentityService {
  public async upsertVerifiedPrincipal(
    client: PoolClient,
    principal: AuthenticatedPrincipal,
    now: Date,
  ): Promise<UserRecord> {
    const result = await client.query<UserRow>(
      `
        INSERT INTO identity.users (id, privy_did, created_at, updated_at, last_seen_at)
        VALUES ($1, $2, $3, $3, $3)
        ON CONFLICT (privy_did) DO UPDATE
        SET updated_at = EXCLUDED.updated_at,
            last_seen_at = GREATEST(identity.users.last_seen_at, EXCLUDED.last_seen_at)
        RETURNING id, privy_did, created_at, last_seen_at
      `,
      [randomUUID(), principal.privyDid, now],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Identity upsert returned no user");
    return {
      id: row.id,
      privyDid: row.privy_did,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    };
  }
}
