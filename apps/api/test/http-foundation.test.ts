import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { ApiErrorEnvelopeSchema } from "@pootown/game-contracts";
import { Writable } from "node:stream";
import pino from "pino";
import type { Pool } from "pg";
import { z } from "zod";

import { HealthController } from "../src/health/health.controller";
import { pinoHttpOptions, redactRequestUrl, redactedLogPaths } from "../src/observability/logger.config";
import { ApiExceptionFilter } from "../src/platform/http/api-exception.filter";
import { ApiHttpException } from "../src/platform/http/api-http.exception";
import { ZodValidationPipe } from "../src/platform/http/zod-validation.pipe";

describe("HTTP foundation", () => {
  it("keeps liveness independent from PostgreSQL and fails readiness closed", async () => {
    const unavailablePool = {
      async query() {
        throw new Error("database unavailable");
      },
    } as unknown as Pool;
    const controller = new HealthController(unavailablePool);
    assert.deepEqual(controller.live(), { status: "ok" });
    await assert.rejects(controller.ready(), /Database is unavailable/);

    const availablePool = { async query() { return { rows: [] }; } } as unknown as Pool;
    assert.deepEqual(await new HealthController(availablePool).ready(), { status: "ready", database: "up" });
  });

  it("validates strict Zod request bodies", () => {
    const pipe = new ZodValidationPipe(z.strictObject({ value: z.string().min(1) }));
    assert.deepEqual(pipe.transform({ value: "ok" }), { value: "ok" });
    assert.throws(() => pipe.transform({ value: "ok", actorId: "forged" }), /Request validation failed/);
  });

  it("redacts authorization, cookies, tickets, and ticket hashes", () => {
    for (const required of [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.*.ticket",
      "ticketHash",
      "checkpointChecksum",
    ]) {
      assert.equal(redactedLogPaths.some((path) => path === required), true, required);
    }
    assert.equal(
      redactRequestUrl("/v1/session?ticket=secret&view=public&checkpointChecksum=proof"),
      "/v1/session?ticket=%5BREDACTED%5D&view=public&checkpointChecksum=%5BREDACTED%5D",
    );

    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const logger = pino(pinoHttpOptions, destination);
    logger.info({
      payload: {
        token: "nested-token-secret",
        admission: { ticket: "nested-ticket-secret", ticketHash: "nested-hash-secret" },
      },
      checkpointChecksum: "checkpoint-secret",
      req: {
        id: "request_1",
        method: "GET",
        url: "/v1/session?ticket=query-secret&view=public",
      },
    });
    const output = lines.join("");
    for (const secret of [
      "nested-token-secret",
      "nested-ticket-secret",
      "nested-hash-secret",
      "checkpoint-secret",
      "query-secret",
    ]) {
      assert.equal(output.includes(secret), false, secret);
    }
    assert.equal(output.includes("[REDACTED]"), true);
  });

  it("emits only contract-valid error envelopes", () => {
    const filter = new ApiExceptionFilter();
    for (const exception of [
      new ApiHttpException("AUTH_TOKEN_MISSING", 401, "Bearer access token required"),
      new BadRequestException("unsafe framework detail"),
      new Error("private stack detail"),
    ]) {
      let status = 0;
      let body: unknown;
      const response = {
        status(code: number) {
          status = code;
          return this;
        },
        send(value: unknown) {
          body = value;
        },
      };
      const host = {
        switchToHttp: () => ({
          getRequest: () => ({ id: "00000000-0000-4000-8000-000000000501" }),
          getResponse: () => response,
        }),
      } as ArgumentsHost;
      filter.catch(exception, host);
      assert.equal(ApiErrorEnvelopeSchema.safeParse(body).success, true);
      assert.equal(status >= 400, true);
      assert.equal(JSON.stringify(body).includes("unsafe framework detail"), false);
      assert.equal(JSON.stringify(body).includes("private stack detail"), false);
    }
  });
});
