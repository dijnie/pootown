import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool, PoolClient } from "pg";

import { withTransaction } from "../src/database/transaction";

function fakePool(failures: string[]): { pool: Pool; queries: string[]; releases: number[] } {
  const queries: string[] = [];
  const releases: number[] = [];
  let connection = 0;
  const pool = {
    async connect() {
      const current = connection;
      connection += 1;
      return {
        async query(statement: string) {
          queries.push(statement);
          if (statement === "WORK" && failures[current] !== undefined) {
            throw Object.assign(new Error("database failure"), { code: failures[current] });
          }
        },
        release() {
          releases.push(current);
        },
      };
    },
  } as unknown as Pool;
  return { pool, queries, releases };
}

describe("database transaction", () => {
  it("retries only recognized serialization and deadlock failures", async () => {
    const fake = fakePool(["40001", "40P01"]);
    const result = await withTransaction(
      fake.pool,
      async (client: PoolClient) => {
        await client.query("WORK");
        return "committed";
      },
      { maximumAttempts: 3 },
    );
    assert.equal(result, "committed");
    assert.equal(fake.queries.filter((query) => query === "BEGIN").length, 3);
    assert.equal(fake.queries.filter((query) => query === "ROLLBACK").length, 2);
    assert.deepEqual(fake.releases, [0, 1, 2]);
  });

  it("does not retry an unrecognized database failure", async () => {
    const fake = fakePool(["23514"]);
    await assert.rejects(
      withTransaction(fake.pool, async (client) => client.query("WORK")),
      /database failure/,
    );
    assert.equal(fake.queries.filter((query) => query === "BEGIN").length, 1);
    assert.equal(fake.queries.filter((query) => query === "ROLLBACK").length, 1);
  });

  it("preserves the work error and evicts the connection when rollback fails", async () => {
    const original = Object.assign(new Error("original-work-error"), { code: "23514" });
    const rollback = new Error("rollback-error");
    const releasedWith: Array<Error | boolean | undefined> = [];
    const pool = {
      async connect() {
        return {
          async query(statement: string) {
            if (statement === "WORK") throw original;
            if (statement === "ROLLBACK") throw rollback;
          },
          release(error?: Error | boolean) {
            releasedWith.push(error);
          },
        };
      },
    } as unknown as Pool;
    await assert.rejects(
      withTransaction(pool, async (client) => client.query("WORK")),
      (error) => error === original,
    );
    assert.deepEqual(releasedWith, [rollback]);
  });
});
