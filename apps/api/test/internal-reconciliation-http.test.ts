import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";

import { INTERNAL_ROUTE } from "../src/auth/internal-route.decorator";
import { InternalController } from "../src/internal/internal.controller";
import { InternalSessionService } from "../src/internal/internal-session.service";
import { InternalSettlementService } from "../src/internal/internal-settlement.service";
import { ReconciliationService } from "../src/internal/reconciliation.service";

describe("internal reconciliation HTTP route", () => {
  let app: NestFastifyApplication;
  let calls = 0;

  before(async () => {
    const module = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        { provide: InternalSessionService, useValue: {} },
        { provide: InternalSettlementService, useValue: {} },
        {
          provide: ReconciliationService,
          useValue: {
            run: () => {
              calls += 1;
              return Promise.resolve({
                contractVersion: 1,
                waitingSessionsCancelled: 0,
                expiredAdmissionsReleased: 0,
                terminalSettlementsCommitted: 0,
                sessionsMarkedForRecovery: 0,
                alreadyRunning: false,
              });
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  after(async () => app?.close());

  it("exposes one strict versioned mutation endpoint on the internal-auth boundary", async () => {
    assert.equal(Reflect.getMetadata(INTERNAL_ROUTE, InternalController), true);
    const response = await app.inject({
      method: "POST",
      url: "/internal/v1/reconciliation/run",
      headers: { "x-contract-version": "1", "idempotency-key": "reconciliation:test" },
      payload: { contractVersion: 1 },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(response.body), {
      contractVersion: 1,
      waitingSessionsCancelled: 0,
      expiredAdmissionsReleased: 0,
      terminalSettlementsCommitted: 0,
      sessionsMarkedForRecovery: 0,
      alreadyRunning: false,
    });
    for (const request of [
      { headers: { "x-contract-version": "1" }, payload: { contractVersion: 1 } },
      { headers: { "x-contract-version": "1", "idempotency-key": "reconciliation:test" }, payload: { contractVersion: 2 } },
      { headers: { "x-contract-version": "1", "idempotency-key": "reconciliation:test" }, payload: { contractVersion: 1, actorId: "forged" } },
    ]) {
      const rejected = await app.inject({ method: "POST", url: "/internal/v1/reconciliation/run", ...request });
      assert.equal(rejected.statusCode, 400);
    }
    assert.equal(calls, 1);
  });
});
