import type { Pool, PoolClient } from "pg";

const RETRYABLE_POSTGRES_CODES = new Set(["40001", "40P01"]);

export interface TransactionOptions {
  readonly maximumAttempts?: number;
}

function postgresCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const maximumAttempts = options.maximumAttempts ?? 3;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const client = await pool.connect();
    let releaseError: Error | undefined;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError = rollbackError instanceof Error ? rollbackError : new Error("Rollback failed");
      }
      if (!RETRYABLE_POSTGRES_CODES.has(postgresCode(error) ?? "") || attempt === maximumAttempts) {
        throw error;
      }
    } finally {
      client.release(releaseError);
    }
  }
  throw new Error("Transaction retry loop exhausted");
}
