import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import type { AuthenticatedPrincipal } from "../src/auth/auth.types";
import { IdentityService, type UserRecord } from "../src/identity/identity.service";

const TEST_PASSWORD_HASH = "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

export class ProvisioningTestIdentityService extends IdentityService {
  public override async findAndTouchPrincipal(
    client: PoolClient,
    principal: AuthenticatedPrincipal,
    now: Date,
  ): Promise<UserRecord> {
    const email = `${createHash("sha256").update(principal.userId).digest("hex")}@example.test`;
    await client.query(
      `INSERT INTO identity.users (id, email, password_hash, created_at, updated_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $4, $4) ON CONFLICT (id) DO NOTHING`,
      [principal.userId, email, TEST_PASSWORD_HASH, now],
    );
    return super.findAndTouchPrincipal(client, principal, now);
  }
}
