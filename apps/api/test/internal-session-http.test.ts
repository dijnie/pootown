import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";

import { InternalController } from "../src/internal/internal.controller";
import { InternalSessionService } from "../src/internal/internal-session.service";
import { InternalSettlementService } from "../src/internal/internal-settlement.service";
import { ReconciliationService } from "../src/internal/reconciliation.service";

describe("internal session HTTP routes", () => {
  let app: NestFastifyApplication;
  let requestedGameId: string | undefined;

  before(async () => {
    const module = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        {
          provide: InternalSessionService,
          useValue: {
            bootstrap: (gameId: string) => {
              requestedGameId = gameId;
              return Promise.resolve({
                contractVersion: 1,
                gameId,
                gameDefinitionId: "classic_100",
                gameDefinitionVersion: 1,
                rulesetId: "pootown-rust-source-v1",
                roomId: "room_1",
                lifecycle: "open",
                stateVersion: 0,
                creatorPlayerId: "player_1",
                maximumPlayers: 4,
                timeLimitMs: 3_600_000,
                createdAtMs: 1,
                startedAtMs: null,
                players: [{ playerId: "player_1", seatIndex: 0, joinedAtMs: 1 }],
              });
            },
          },
        },
        { provide: InternalSettlementService, useValue: {} },
        { provide: ReconciliationService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  after(async () => app?.close());

  it("serves bootstrap only with the exact contract version and valid game ID", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/v1/game-sessions/game_1/bootstrap",
      headers: { "x-contract-version": "1" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(requestedGameId, "game_1");
    assert.equal(response.body.includes("userId"), false);
    assert.equal(response.body.includes("entryCoin"), false);

    const missingVersion = await app.inject({
      method: "GET",
      url: "/internal/v1/game-sessions/game_1/bootstrap",
    });
    assert.equal(missingVersion.statusCode, 400);
    const invalidId = await app.inject({
      method: "GET",
      url: "/internal/v1/game-sessions/bad%20id/bootstrap",
      headers: { "x-contract-version": "1" },
    });
    assert.equal(invalidId.statusCode, 400);
  });
});
