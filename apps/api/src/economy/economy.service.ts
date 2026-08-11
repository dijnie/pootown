import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CoinBalanceResponseSchema,
  CoinOperationsResponseSchema,
  CONTRACT_VERSION,
  RescueGrantResponseSchema,
  UserViewSchema,
  type CoinBalanceResponse,
  type CoinOperationsResponse,
  type RescueGrantResponse,
  type UserView,
} from "@pootown/game-contracts";
import type { Pool, PoolClient } from "pg";

import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { DATABASE_POOL } from "../database/database.constants";
import { withTransaction } from "../database/transaction";
import { IdentityService, type UserRecord } from "../identity/identity.service";
import { ApiHttpException } from "../platform/http/api-http.exception";

const INITIAL_GRANT_SCOPE = "initialGrant";
const INITIAL_GRANT_KEY = "initial-grant:v1";
const INITIAL_GRANT_HASH = createHash("sha256").update("initial-grant:v1").digest();
const RESCUE_GRANT_HASH = createHash("sha256").update('{"contractVersion":1}').digest();

interface AccountRow {
  readonly available_coin: string;
  readonly reserved_coin: string;
  readonly version: string;
  readonly last_rescue_grant_at: Date | null;
}

interface OperationRow {
  readonly id: string;
  readonly request_hash: Buffer;
  readonly response_snapshot: unknown;
  readonly status: "pending" | "committed" | "no_op";
}

interface OperationViewRow {
  readonly id: string;
  readonly operation_kind: "initialGrant" | "rescueGrant" | "reserve" | "release" | "capture" | "payout";
  readonly created_at: Date;
  readonly available_delta: string;
  readonly reserved_delta: string;
}

export interface ProvisionedAccount {
  readonly user: UserView;
  readonly balance: CoinBalanceResponse;
}

function ledgerAccountId(userId: string, kind: "available" | "reserved"): string {
  return `user_${createHash("sha256").update(userId).digest("hex").slice(0, 48)}_${kind}`;
}

function balanceView(row: AccountRow): CoinBalanceResponse {
  return CoinBalanceResponseSchema.parse({
    contractVersion: CONTRACT_VERSION,
    availableCoin: row.available_coin,
    reservedCoin: row.reserved_coin,
    version: Number(row.version),
  });
}

function userView(user: UserRecord): UserView {
  return UserViewSchema.parse({
    contractVersion: CONTRACT_VERSION,
    userId: user.id,
    createdAtMs: user.createdAt.getTime(),
    lastSeenAtMs: user.lastSeenAt.getTime(),
  });
}

@Injectable()
export class EconomyService {
  private readonly initialGrantCoin: bigint;
  private readonly rescueBalanceCoin: bigint;
  private readonly rescueWindowMs: number;

  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
    private readonly identity: IdentityService,
  ) {
    this.initialGrantCoin = BigInt(this.config.getOrThrow<string>("INITIAL_GRANT_COIN"));
    this.rescueBalanceCoin = BigInt(this.config.getOrThrow<string>("RESCUE_BALANCE_COIN"));
    this.rescueWindowMs = this.config.getOrThrow<number>("RESCUE_WINDOW_MS");
  }

  public provisionPrincipal(principal: AuthenticatedPrincipal, now = new Date()): Promise<ProvisionedAccount> {
    return withTransaction(this.pool, async (client) => {
      const user = await this.identity.upsertVerifiedPrincipal(client, principal, now);
      await this.ensureAccountInfrastructure(client, user.id, now);
      let account = await this.lockAccount(client, user.id);
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO economy.coin_operations
            (id, actor_user_id, operation_scope, idempotency_key, request_hash)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (actor_user_id, operation_scope, idempotency_key) DO NOTHING
          RETURNING id
        `,
        [randomUUID(), user.id, INITIAL_GRANT_SCOPE, INITIAL_GRANT_KEY, INITIAL_GRANT_HASH],
      );
      const operationId = inserted.rows[0]?.id;
      if (operationId !== undefined) {
        account = await this.applyGrant(client, user.id, operationId, this.initialGrantCoin, now);
      }
      return { user: userView(user), balance: balanceView(account) };
    });
  }

  public async rescue(
    principal: AuthenticatedPrincipal,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<RescueGrantResponse> {
    const provisioned = await this.provisionPrincipal(principal, now);
    return withTransaction(this.pool, async (client) => {
      const account = await this.lockAccount(client, provisioned.user.userId);
      const existing = await client.query<OperationRow>(
        `
          SELECT id, request_hash, response_snapshot, status
          FROM economy.coin_operations
          WHERE actor_user_id = $1 AND operation_scope = 'rescueGrant' AND idempotency_key = $2
        `,
        [provisioned.user.userId, idempotencyKey],
      );
      const prior = existing.rows[0];
      if (prior !== undefined) {
        if (!prior.request_hash.equals(RESCUE_GRANT_HASH)) {
          throw new ApiHttpException("IDEMPOTENCY_CONFLICT", 409, "Idempotency key was already used");
        }
        if (prior.status === "pending") throw new Error("Incomplete rescue grant operation");
        return RescueGrantResponseSchema.parse(prior.response_snapshot);
      }

      const available = BigInt(account.available_coin);
      const totalAccountCoin = available + BigInt(account.reserved_coin);
      const lastRescue = account.last_rescue_grant_at?.getTime();
      const windowOpen = lastRescue === undefined || lastRescue <= now.getTime() - this.rescueWindowMs;
      if (totalAccountCoin >= this.rescueBalanceCoin || !windowOpen) {
        const response = RescueGrantResponseSchema.parse({
          ...balanceView(account),
          granted: false,
          operationId: null,
        });
        await client.query(
          `
            INSERT INTO economy.coin_operations
              (id, actor_user_id, operation_scope, idempotency_key, request_hash,
               response_snapshot, status, committed_at)
            VALUES ($1, $2, 'rescueGrant', $3, $4, $5, 'no_op', $6)
          `,
          [randomUUID(), provisioned.user.userId, idempotencyKey, RESCUE_GRANT_HASH, response, now],
        );
        return response;
      }

      const operationId = randomUUID();
      await client.query(
        `
          INSERT INTO economy.coin_operations
            (id, actor_user_id, operation_scope, idempotency_key, request_hash)
          VALUES ($1, $2, 'rescueGrant', $3, $4)
        `,
        [operationId, provisioned.user.userId, idempotencyKey, RESCUE_GRANT_HASH],
      );
      const updated = await this.applyGrant(
        client,
        provisioned.user.userId,
        operationId,
        this.rescueBalanceCoin - totalAccountCoin,
        now,
        true,
      );
      const response = RescueGrantResponseSchema.parse({
        ...balanceView(updated),
        granted: true,
        operationId,
      });
      await client.query(
        `
          UPDATE economy.coin_operations
          SET response_snapshot = $2, status = 'committed', committed_at = $3
          WHERE id = $1
        `,
        [operationId, response, now],
      );
      return response;
    });
  }

  public async listOperations(
    principal: AuthenticatedPrincipal,
    limit: number,
    cursor?: string,
  ): Promise<CoinOperationsResponse> {
    const provisioned = await this.provisionPrincipal(principal);
    const boundary = cursor === undefined ? undefined : this.decodeCursor(cursor);
    const result = await this.pool.query<OperationViewRow>(
      `
        SELECT
          operation.id,
          CASE
            WHEN operation.operation_scope IN ('createSession', 'joinIntent') THEN 'reserve'
            WHEN operation.operation_scope IN ('releaseJoinIntent', 'cancelSession') THEN 'release'
            WHEN operation.operation_scope = 'abortSession' THEN 'release'
            WHEN operation.operation_scope = 'settleSession' AND EXISTS (
              SELECT 1
              FROM economy.coin_ledger_entries settlement_entry
              JOIN economy.ledger_accounts settlement_ledger ON settlement_ledger.id = settlement_entry.ledger_account_id
              WHERE settlement_entry.operation_id = operation.id
                AND settlement_ledger.owner_user_id = $1
                AND settlement_ledger.kind = 'user_available'
                AND settlement_entry.amount > 0
            ) THEN 'payout'
            WHEN operation.operation_scope = 'settleSession' THEN 'capture'
            ELSE operation.operation_scope
          END AS operation_kind,
          operation.created_at,
          COALESCE(sum(entry.amount) FILTER (WHERE ledger.kind = 'user_available'), 0)::text AS available_delta,
          COALESCE(sum(entry.amount) FILTER (WHERE ledger.kind = 'user_reserved'), 0)::text AS reserved_delta
        FROM economy.coin_operations operation
        JOIN economy.coin_ledger_entries entry ON entry.operation_id = operation.id
        JOIN economy.ledger_accounts ledger ON ledger.id = entry.ledger_account_id
        WHERE ledger.owner_user_id = $1
          AND operation.status = 'committed'
          AND operation.operation_scope IN (
            'initialGrant', 'rescueGrant', 'createSession', 'joinIntent', 'releaseJoinIntent', 'cancelSession',
            'settleSession', 'abortSession', 'reserve', 'release', 'capture', 'payout'
          )
          AND ($2::timestamptz IS NULL OR (operation.created_at, operation.id) < ($2::timestamptz, $3::varchar))
        GROUP BY operation.id
        ORDER BY operation.created_at DESC, operation.id DESC
        LIMIT $4
      `,
      [provisioned.user.userId, boundary?.createdAt ?? null, boundary?.id ?? "", limit + 1],
    );
    const page = result.rows.slice(0, limit);
    const last = page.at(-1);
    return CoinOperationsResponseSchema.parse({
      contractVersion: CONTRACT_VERSION,
      items: page.map((row) => ({
        operationId: row.id,
        kind: row.operation_kind,
        availableDelta: row.available_delta,
        reservedDelta: row.reserved_delta,
        createdAtMs: row.created_at.getTime(),
      })),
      nextCursor: result.rows.length > limit && last !== undefined
        ? Buffer.from(JSON.stringify({ createdAt: last.created_at.toISOString(), id: last.id })).toString("base64url")
        : null,
    });
  }

  private async ensureAccountInfrastructure(client: PoolClient, userId: string, now: Date): Promise<void> {
    await client.query(
      `
        INSERT INTO economy.coin_accounts (user_id, created_at, updated_at)
        VALUES ($1, $2, $2)
        ON CONFLICT (user_id) DO NOTHING
      `,
      [userId, now],
    );
    await client.query(
      `
        INSERT INTO economy.ledger_accounts (id, owner_user_id, kind) VALUES
          ($1, $3, 'user_available'),
          ($2, $3, 'user_reserved')
        ON CONFLICT (owner_user_id, kind) DO NOTHING
      `,
      [ledgerAccountId(userId, "available"), ledgerAccountId(userId, "reserved"), userId],
    );
    await client.query(`
      INSERT INTO economy.ledger_accounts (id, owner_user_id, kind)
      VALUES ('system_issuance', NULL, 'system_issuance')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  private async lockAccount(client: PoolClient, userId: string): Promise<AccountRow> {
    const result = await client.query<AccountRow>(
      `
        SELECT available_coin, reserved_coin, version, last_rescue_grant_at
        FROM economy.coin_accounts
        WHERE user_id = $1
        FOR UPDATE
      `,
      [userId],
    );
    const account = result.rows[0];
    if (account === undefined) throw new Error("Account not found after provisioning");
    return account;
  }

  private async applyGrant(
    client: PoolClient,
    userId: string,
    operationId: string,
    amount: bigint,
    now: Date,
    rescue = false,
  ): Promise<AccountRow> {
    const updated = await client.query<AccountRow>(
      `
        UPDATE economy.coin_accounts
        SET available_coin = available_coin + $2::numeric,
            version = version + 1,
            updated_at = $3,
            last_rescue_grant_at = CASE WHEN $4 THEN $3 ELSE last_rescue_grant_at END
        WHERE user_id = $1
        RETURNING available_coin, reserved_coin, version, last_rescue_grant_at
      `,
      [userId, amount.toString(), now, rescue],
    );
    await client.query(
      `
        INSERT INTO economy.coin_ledger_entries (operation_id, ledger_account_id, amount) VALUES
          ($1, $2, $3::numeric),
          ($1, 'system_issuance', -$3::numeric)
      `,
      [operationId, ledgerAccountId(userId, "available"), amount.toString()],
    );
    const account = updated.rows[0];
    if (account === undefined) throw new Error("Grant account update returned no row");
    if (!rescue) {
      const response = { contractVersion: CONTRACT_VERSION, operationId, committed: true };
      await client.query(
        `
          UPDATE economy.coin_operations
          SET response_snapshot = $2, status = 'committed', committed_at = $3
          WHERE id = $1
        `,
        [operationId, response, now],
      );
    }
    return account;
  }

  private decodeCursor(cursor: string): { readonly createdAt: string; readonly id: string } {
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (typeof value !== "object" || value === null || !("createdAt" in value) || !("id" in value)) throw new Error();
      const createdAt = value.createdAt;
      const id = value.id;
      const parsedCreatedAt = typeof createdAt === "string" ? new Date(createdAt) : null;
      if (
        Object.keys(value).sort().join(",") !== "createdAt,id" ||
        typeof createdAt !== "string" ||
        parsedCreatedAt === null ||
        !Number.isFinite(parsedCreatedAt.getTime()) ||
        parsedCreatedAt.toISOString() !== createdAt ||
        typeof id !== "string" ||
        id.length === 0 ||
        id.length > 128
      ) {
        throw new Error();
      }
      return { createdAt, id };
    } catch {
      throw new ApiHttpException("REQUEST_INVALID", 400, "Operation cursor is invalid");
    }
  }
}
