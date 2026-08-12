---
title: "Pootown NestJS and Colyseus Monorepo Refactor"
description: "Cleanly replace the Solana runtime with independently deployable NestJS and Colyseus services while preserving the current web experience and executed game rules."
status: blocked
priority: P1
effort: 10-13 weeks
issue: null
branch: main
tags: [refactor, frontend, backend, database, api, auth, critical]
blockedBy: [hosting-security-and-production-cutover]
blocks: []
created: 2026-08-11
---

# Pootown NestJS and Colyseus Monorepo Refactor

## Overview

Create one root pnpm workspace with `apps/web`, independently deployable `apps/api` and `apps/game-server`, pure `packages/game-core`, and transport-only `packages/game-contracts`. Cut production directly to the off-chain system after parity/recovery gates; migrate no legacy records and run no production dual engine.

## Scope Boundary

- Preserve current visuals, UX, and only currently executed five-card/simplified rules; max four players. Auction and missing effects stay unsupported.
- First-party email/password identity is server-verified. No social login, email verification/reset, wallet signing, public private key, blockchain facade, withdrawal, spectators, admin product, queues, Redis, or event sourcing.
- API alone writes account coin/reservations/refunds/settlements. Game server alone owns live in-match cash, rules, rooms, leases, and full checkpoints.
- Initial realtime topology: one Colyseus replica and one PostgreSQL cluster with isolated schemas/roles. Scale changes require measured evidence.

## Context and Authorities

- [Accepted brainstorm](../reports/brainstorm-260811-0246-nestjs-colyseus-monorepo.md)
- [Rules migration research](./research/researcher-01-rules-migration.md)
- [Service contracts research](./research/researcher-02-service-contracts.md)
- Official: [NestJS authentication](https://docs.nestjs.com/security/authentication), [Colyseus rooms](https://docs.colyseus.io/room), [PostgreSQL transactions](https://www.postgresql.org/docs/current/transaction-iso.html); port source: [`dijnie/nest-next-tuborepo` email auth](https://github.com/dijnie/nest-next-tuborepo/tree/master/apps/backend/src/auth).

Authority precedence: accepted CEO decisions and this implementation plan override exploratory research. Wallet binding, spectators, eight-player rooms, auction commands, production cohorts/dual reads, legacy drain, and legacy fallback proposed in research are superseded and must not be implemented.

## Phases and Dependencies

| Phase | Deliverable | Depends on | Status |
|---|---|---|---|
| 1 | [Workspace and behavioral baseline](./phase-01-start.md) | - | Complete |
| 2 | [Shared contracts and core lifecycle](./phase-02-shared-contracts-and-core-lifecycle.md) | 1 | Complete |
| 3 | [Complete executed rules port](./phase-03-complete-game-rules-port.md) | 2 | Complete |
| 4 | [NestJS identity, economy, and sessions](./phase-04-nestjs-identity-economy-and-sessions.md) | 2 | Complete |
| 5 | [Colyseus rooms and recovery](./phase-05-colyseus-rooms-and-recovery.md) | 3, 4 | Complete |
| 6 | [Frontend runtime cutover](./phase-06-frontend-runtime-cutover.md) | 4, 5 | Complete |
| 7 | [Reliability, security, and load gates](./phase-07-reliability-security-and-load-gates.md) | 6 | Complete |
| 8 | [Clean removal, deployment, and docs](./phase-08-clean-removal-deployment-and-docs.md) | 7 | Repository complete; production blocked |

Critical path: `1 -> 2 -> 3/4 -> 5 -> 6 -> 7 -> 8`. Phases 3 and 4 may proceed concurrently after Phase 2 if file ownership remains separate.

## Acceptance Criteria

- [x] Email/password login with rotating server sessions; every API request/room command is authenticated, authorized, schema-validated, and server-authoritative.
- [x] Create, discover, join, start, play, reconnect, finish, settle, review, and leaderboard flows preserve current visible UX with no new action.
- [x] Account coin and in-match cash are distinct; ledger, reservations, refunds, and settlements remain atomic and idempotent under retries/concurrency.
- [x] Every accepted command commits its full versioned checkpoint before ack/broadcast; lease fencing and restart/restore tests prevent split ownership or lost state.
- [x] Reachable Rust behavior has executable characterization evidence; the approved frozen-source authority covers runtime paths unreachable after the legacy start rollback. Unsupported auction and absent card effects are not invented.
- [x] API, game server, and web build/deploy/restart independently; database-role tests, backup/restore drill, visual regression, crash matrix, and confirmed 200-client/~50-room gate pass.
- [ ] The live production deployment contains no Solana, Anchor, Magic Block, indexer, generated SDK, wallet-signing, or Privy runtime surface. Repository and image scans pass; live cutover remains external.

## Unresolved Questions

No product or repository question remains. Production publication is blocked on
a hosting-owned TLS/DNS/secrets/WAL-PITR rehearsal and live cutover evidence.
The repository-owned dependency and image CVE/SBOM gates are green.

## Red Team Review

- Completed 2026-08-11 with four lenses: security/facts, failure/flow, assumptions/scope, and contract/complexity.
- CEO approved all evidence-backed findings on 2026-08-11: technical corrections are incorporated across the phase files; rule/UX/policy choices plus the two launch hypotheses remain in the validation gate above.
- Rejected as non-findings: the approved one-replica topology, no Redis/queue, full checkpoint-per-command pending measurement, secure server RNG without VRF, no production dual engine, and fail-closed corrupt-checkpoint handling.

## Validation Log

- 2026-08-12 — CEO approved the Next.js 16 security upgrade. Next.js 16.3.0 and React 19.2.8 passed monorepo quality, production build, public visual 6/6, authenticated vertical 6/6, production-like container smoke, and production dependency audit. Digest-pinned Trivy reported 0 HIGH and 0 CRITICAL findings for all three verification images.

- 2026-08-12 — Phase 8 repository delivery completed: legacy Rust/Anchor/indexer/runtime surfaces were removed; three pinned non-root images passed package inventory; production-like Compose smoke passed isolated migration/API/realtime roles, email auth, web, gameplay, and settlement; and clean-cluster encrypted restore matched source fingerprints with zero ledger mismatches. Production publication remains blocked by the external controls recorded above.

- 2026-08-12 — Phase 7 completed after review strengthened monotonic room timestamps, row-level restore fingerprints, dependency/visual gates, and source-manifest provenance. The final Next.js 16 current-source 200-player/50-room/30-minute gate accepted 95,698 realistic commands (including property purchase, rent, tax, cards, bankruptcy, and trade) plus one settlement with zero rejects, duplicate durable commands, ledger mismatches, or DB lock waiters. Join p95 was 39.0ms; command ack p95/p99 was 75.9/86.0ms; API pool peak was 50%; event-loop p99 was 22.4ms; PostgreSQL CPU p95 was 0.92%. Reports: [load](./reports/phase-07-load-results.json) · [restore](./reports/phase-07-restore-results.json).

- 2026-08-12 — Phase 6 frontend cutover completed. Web unit tests passed 38/38; API unit tests passed 28/28; web/API lint, typecheck, and production builds passed; public desktop/mobile visual checks passed 6/6; and the isolated PostgreSQL/API/Colyseus/production-web vertical passed create, join, start, and canonical reload on desktop and mobile. Six additional fresh desktop environments passed consecutively. Automatic reconnect preserves and replays pending request IDs, while explicit disconnect remains destructive. Full play-to-finish, outage/fault injection, browser error-state, restore, and load evidence remains owned by Phase 7; the prior isolated join 500 is not currently reproducible and remains a Phase 7 observability target.

- 2026-08-12 — CEO replaced Privy with minimal first-party email/password auth: register, login, rotating refresh, and logout only. No email verification, password recovery, social provider, or compatibility alias. Source behavior comes from `dijnie/nest-next-tuborepo` auth at commit `9321cd1`, adapted to Pootown SQL/Zod/jose patterns.

- 2026-08-11 — Preserve executed credit-only `CollectFromPlayers`; model it as a defined bank inflow rather than debiting other players.
- 2026-08-11 — If every player remains disconnected through the 120-second reconnect window, abort the game and refund reservations idempotently. Accepted trade-off: coordinated disconnect can be abused to avoid a losing result; instrument and rate-limit repeated abort patterns, but do not change this policy silently.
- 2026-08-11 — Preserve the visible Claim Reward control as a settlement status/idempotent retry action; durable automatic reconciliation remains authoritative.
- 2026-08-11 — Enable a 1,000-coin initial grant and rescue top-up to 100 at most once per rolling 24 hours, enforced and audited server-side.
- 2026-08-11 — Confirm release hypothesis: 200 authenticated concurrent players across about 50 four-player rooms for 30 minutes, with the Phase 7 correctness/latency/resource thresholds.
- 2026-08-11 — Correct the Community Chest “Free Parking” card to move to board position 20 and align the visible copy. Record this as an approved behavior correction from the executed position-21 legacy behavior.
- 2026-08-11 — Accept the frozen Rust source plus the decisions above as the migration authority where the legacy MagicBlock start path cannot commit. The characterized start attempt emits `GameStarted` and then rolls back byte-for-byte after an access violation; the closed/absent deployed program provides no stronger runtime authority. Do not repair or redeploy legacy Solana solely for parity. Authenticated board/dialog visual parity remains a mandatory Phase 6/7 release gate.
