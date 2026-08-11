import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { LeaderboardController, SessionHistoryController } from "../src/read-models/read-models.controller";
import { ReadModelsService } from "../src/read-models/read-models.service";

describe("read-model HTTP routes", () => {
  let app: NestFastifyApplication;
  const calls: Array<readonly [number, number]> = [];

  before(async () => {
    const module = await Test.createTestingModule({
      controllers: [LeaderboardController, SessionHistoryController],
      providers: [{
        provide: ReadModelsService,
        useValue: {
          leaderboard: (page: number, limit: number) => {
            calls.push([page, limit]);
            return Promise.resolve({
              success: true,
              data: { data: [], pagination: { page, limit, total: 0, totalPages: 0 } },
              requestId: "00000000-0000-4000-8000-000000000901",
              timestamp: 1,
            });
          },
          history: () => Promise.resolve({ contractVersion: 1, items: [], nextCursor: null }),
        },
      }],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  after(async () => app?.close());

  it("serves the canonical versioned leaderboard route", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/leaderboard/top-players?page=2&limit=10",
      headers: { "x-contract-version": "1" },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [[2, 10]]);
    assert.equal(response.body.includes("wallet"), false);
    assert.equal(response.body.includes("SOL"), false);
    const oldRoute = await app.inject({ method: "GET", url: "/api/leaderboard/top-players" });
    assert.equal(oldRoute.statusCode, 404);
  });

  it("requires the contract version and authenticated history principal", async () => {
    const missingVersion = await app.inject({ method: "GET", url: "/v1/leaderboard/top-players" });
    assert.equal(missingVersion.statusCode, 400);
    const missingPrincipal = await app.inject({
      method: "GET",
      url: "/v1/me/history",
      headers: { "x-contract-version": "1" },
    });
    assert.equal(missingPrincipal.statusCode, 401);
  });
});
