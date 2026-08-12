---
phase: 7
title: "Reliability Security and Load Gates"
status: in-progress
priority: P1
effort: "1-1.5 weeks"
dependencies: [6]
---

# Phase 7: Reliability Security and Load Gates

## Context Links

- [Full vertical path](./phase-06-frontend-runtime-cutover.md) · [Failure/test gates](./research/researcher-02-service-contracts.md#failure-modes-and-gates)
- Official: [NestJS security](https://docs.nestjs.com/security/authentication), [PostgreSQL backup](https://www.postgresql.org/docs/current/backup.html), [Colyseus load testing](https://docs.colyseus.io/tools/loadtest).

## Overview

Prove release behavior under negative input, retries, concurrency, process/DB failures, restore, and the confirmed 200-client/~50-room baseline. This is evidence, not a production capacity claim.

Phase 6 handoff: retain the previously observed but currently non-reproducible join-intent 500 as an observability/fault-test target. Complete the browser-level join-failure, duplicate-click, missed-event, play-to-finish, terminal, API-outage, and reconnect evidence here rather than treating the Phase 6 create/join/start/reload smoke as full release proof.

## Requirements

- Test full contract/parity/visual path, role isolation, secret redaction, ticket/token abuse, ledger reconciliation, checkpoint recovery, and independent restarts.
- Run encrypted backup plus clean-cluster restore of API ledger/session and realtime checkpoints together; restored active room and balances must agree.
- Load gate: 200 authenticated players in about 50 four-player rooms for 30 minutes, realistic command mix, plus 25% reconnect burst in 60s.
- Confirmed pass thresholds: zero lost/duplicate accepted commands, ledger breach, or split ownership; p95 command ack <250ms/p99 <500ms; API join p95 <500ms; DB CPU <70%; pool <80%; event-loop p99 lag <100ms.

## Architecture and Data Flow

One controlled test environment deploys API, one game-server replica, web test runner, and PostgreSQL using production-like roles/TLS/config. Correlation IDs connect join reservation/ticket/admission/command/checkpoint/settlement. Fault injection targets defined crash points, network loss, token expiry, DB outage, and lease loss.

## Related Code Files

Planned new paths:

- Create: `/home/dijnie/project/persional/pootown/tests/contracts/`, `/home/dijnie/project/persional/pootown/tests/e2e/game-lifecycle.spec.ts`, `/home/dijnie/project/persional/pootown/tests/reliability/crash-matrix.test.ts`, `/home/dijnie/project/persional/pootown/tests/reliability/backup-restore.test.ts`, `/home/dijnie/project/persional/pootown/tests/load/colyseus-load.ts`, `/home/dijnie/project/persional/pootown/tests/security/`.
- Create: `/home/dijnie/project/persional/pootown/scripts/test-environment.ts`, `/home/dijnie/project/persional/pootown/scripts/backup-restore-drill.ts`.
- Modify: `/home/dijnie/project/persional/pootown/package.json`, API/game-server observability config, CI workflow files if present at implementation time.

Verified suites to consume: `/home/dijnie/project/persional/pootown/packages/game-core/test/`, `packages/game-contracts/test/`, `apps/api/test/`, `apps/game-server/test/`, `apps/web/tests/`.

## Implementation Steps

1. Build one release-gate command that runs clean install, lint/typecheck/build, unit, contract, integration, E2E, visual, security, recovery, restore, then load in dependency order.
2. Cross-consumer contract-test every API DTO and room envelope/error/event. Fail on unknown contract version or schema drift.
3. Execute concurrency/idempotency matrix: 20-way last-seat/funds race; duplicate API/room requests; same key/different body; post-commit ticket rotation; repeated refund/settlement; timer/player race; raw four-client private-state isolation.
4. Execute crash matrix at ticket-consumed/pre-socket, command pre-commit, post-commit/pre-ack, post-ack, lease renewal, all-offline abort/refund, DB outage, API settlement outage beyond room unload, and process restart. Reconcile durable seat, command/version/checkpoint/coin after each.
5. Execute auth/security tests: malformed/oversized payloads, token issuer/audience/expiry, ticket replay/binding, cross-room action, rate/CORS/origin/CSP limits, DB grants proving realtime cannot access API schemas, tracked-key/secret/dependency scan, log redaction, and raw patch/message private-data isolation.
6. Take an encrypted logical backup containing new owned schemas, restore to a clean PostgreSQL instance with roles/grants, start both services, reconnect an active checkpoint, and reconcile ledger/session/result. Record recovery time and exact commands.
7. Run visual/browser E2E for create->join->play->disconnect/reconnect->finish->history/leaderboard and all error states.
8. Run the confirmed 200-client/~50-room/30m load plus reconnect burst. Capture latency, event-loop, DB CPU/locks/pool, checkpoint size/duration, memory, rejects, duplicates, and settlement totals.
9. Tune within current architecture if thresholds fail; Redis/multi-replica/periodic checkpoints require a separate measured finding and CEO approval.

## Tests and Validation

```bash
pnpm quality
pnpm test:contracts
pnpm test:e2e
pnpm test:reliability
pnpm test:security
pnpm test:restore
pnpm test:load -- --players=200 --rooms=50 --duration=30m
```

Store sanitized machine-readable gate results under the plan's `reports/` directory during implementation; do not commit tokens, tickets, customer data, raw backups, or credentials.

## Success Criteria

- [ ] All functional, negative, contract, visual, concurrency, idempotency, and crash gates pass.
- [ ] Clean restore proves ledger/checkpoints/roles recover consistently and active room resumes.
- [ ] Secret/dependency/role/redaction checks pass; exposed Privy key rotation evidence is closed if applicable.
- [ ] 200-client baseline meets confirmed thresholds with zero correctness breach.
- [ ] Any capacity limitation is reported honestly; no Redis/queue/multi-replica added without approval.

## Risk Assessment

| Risk | Observable failure signal | Pre-decided response |
|---|---|---|
| Confirmed load target fails | Any correctness breach or threshold miss | Block production readiness, profile within current architecture, and report measured bottleneck before proposing scale scope. |
| Checkpoint durability misses latency | Threshold fails with DB bottleneck | Profile indexes/payload/pool; keep commit-before-ack; replan model only with evidence. |
| Restore passes data but not operations | Roles, secrets, DNS, or service startup fail | Treat drill failed; update runbook/automation and repeat from a fresh cluster. |

## Rollback Notes

This phase changes only tests/observability/hardening. Abort destructive fault/load runs outside isolated test infrastructure. Failed gates block Phase 8 and production cutover; they do not justify legacy dual-run.

## Security Considerations

Use synthetic identities/coins, isolated credentials, bounded test traffic, encrypted backups, and artifact redaction. Never run fault/load tests against production without separate explicit approval.

## Next Steps

Phase 8 starts only after all confirmed gates pass. Unresolved questions: none.
