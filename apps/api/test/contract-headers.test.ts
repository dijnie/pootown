import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  requireContractVersion,
  requireMutationHeaders,
} from "../src/platform/http/contract-headers";

describe("HTTP contract headers", () => {
  it("requires the exact supported contract version", () => {
    assert.equal(requireContractVersion({ "x-contract-version": "1" }), 1);
    for (const value of [undefined, "", "01", "2", ["1"]] as const) {
      const headers = value === undefined ? {} : { "x-contract-version": value };
      assert.throws(() => requireContractVersion(headers), /Contract version is unsupported/);
    }
  });

  it("requires one canonical idempotency key without parsing unrelated headers", () => {
    assert.deepEqual(
      requireMutationHeaders({
        "x-contract-version": "1",
        "idempotency-key": "rescue:user-action-1",
        authorization: "Bearer redacted-by-auth-layer",
      }),
      { contractVersion: 1, idempotencyKey: "rescue:user-action-1" },
    );
    assert.throws(
      () => requireMutationHeaders({ "x-contract-version": "1" }),
      /Idempotency key is required/,
    );
    for (const value of ["bad key", "x".repeat(129), ["duplicate", "duplicate"]] as const) {
      assert.throws(
        () => requireMutationHeaders({ "x-contract-version": "1", "idempotency-key": value }),
        /Mutation headers are invalid|Idempotency key is required/,
      );
    }
  });
});
