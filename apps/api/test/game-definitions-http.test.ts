import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { GameDefinitionsResponseSchema } from "@pootown/game-contracts";

import { PUBLIC_ROUTE } from "../src/auth/public.decorator";
import { GameDefinitionsController } from "../src/game-sessions/game-definitions.controller";
import { GameSessionsService } from "../src/game-sessions/game-sessions.service";

describe("game definition HTTP route", () => {
  let app: NestFastifyApplication;

  before(async () => {
    const module = await Test.createTestingModule({
      controllers: [GameDefinitionsController],
      providers: [{
        provide: GameSessionsService,
        useValue: {
          listDefinitions: () => Promise.resolve({
            contractVersion: 1,
            items: [{
              contractVersion: 1,
              gameDefinitionId: "classic_100",
              displayName: "Classic",
              maximumPlayers: 4,
              entryCoin: "100",
              timeLimitMs: 3_600_000,
              policyVersion: 1,
            }],
          }),
        },
      }],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  after(async () => app?.close());

  it("publishes the exact versioned catalogue without authentication", async () => {
    assert.equal(Reflect.getMetadata(PUBLIC_ROUTE, GameDefinitionsController.prototype.list), true);
    const response = await app.inject({
      method: "GET",
      url: "/v1/game-definitions",
      headers: { "x-contract-version": "1" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(GameDefinitionsResponseSchema.safeParse(response.json()).success, true);
  });

  it("rejects a missing or unsupported contract version", async () => {
    const missing = await app.inject({ method: "GET", url: "/v1/game-definitions" });
    assert.equal(missing.statusCode, 400);
    const unsupported = await app.inject({
      method: "GET",
      url: "/v1/game-definitions",
      headers: { "x-contract-version": "2" },
    });
    assert.equal(unsupported.statusCode, 400);
  });
});
