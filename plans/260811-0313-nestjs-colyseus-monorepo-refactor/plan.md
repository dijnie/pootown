---
title: "Pootown NestJS and Colyseus Monorepo Refactor"
description: "Cleanly replace the Solana runtime with independently deployable NestJS and Colyseus services while preserving the current web experience and executed game rules."
status: in-progress
priority: P1
effort: 10-13 weeks
issue: null
branch: main
tags: [refactor, frontend, backend, database, api, auth, critical]
blockedBy: []
blocks: []
created: 2026-08-11
---

# Pootown NestJS and Colyseus Monorepo Refactor

## Overview

Create one root pnpm workspace with `apps/web`, independently deployable `apps/api` and `apps/game-server`, pure `packages/game-core`, and transport-only `packages/game-contracts`. Cut production directly to the off-chain system after parity/recovery gates; migrate no legacy records and run no production dual engine.

## Scope Boundary

- Preserve current visuals, UX, and only currently executed five-card/simplified rules; max four players. Auction and missing effects stay unsupported.
- Privy social identity is server-verified. No wallet signing, public private key, blockchain facade, withdrawal, spectators, admin product, queues, Redis, or event sourcing.
- API alone writes account coin/reservations/refunds/settlements. Game server alone owns live in-match cash, rules, rooms, leases, and full checkpoints.
- Initial realtime topology: one Colyseus replica and one PostgreSQL cluster with isolated schemas/roles. Scale changes require measured evidence.

## Context and Authorities

- [Accepted brainstorm](../reports/brainstorm-260811-0246-nestjs-colyseus-monorepo.md)
- [Rules migration research](./research/researcher-01-rules-migration.md)
- [Service contracts research](./research/researcher-02-service-contracts.md)
- Official: [NestJS authentication](https://docs.nestjs.com/security/authentication), [Colyseus rooms](https://docs.colyseus.io/room), [Privy token verification](https://docs.privy.io/authentication/user-authentication/tokens), [PostgreSQL transactions](https://www.postgresql.org/docs/current/transaction-iso.html)

Authority precedence: accepted CEO decisions and this implementation plan override exploratory research. Wallet binding, spectators, eight-player rooms, auction commands, production cohorts/dual reads, legacy drain, and legacy fallback proposed in research are superseded and must not be implemented.

## Phases and Dependencies

| Phase | Deliverable | Depends on | Status |
|---|---|---|---|
| 1 | [Workspace and behavioral baseline](./phase-01-start.md) | - | Complete |
| 2 | [Shared contracts and core lifecycle](./phase-02-shared-contracts-and-core-lifecycle.md) | 1 | Complete |
| 3 | [Complete executed rules port](./phase-03-complete-game-rules-port.md) | 2 | In progress |
| 4 | [NestJS identity, economy, and sessions](./phase-04-nestjs-identity-economy-and-sessions.md) | 2 | Pending |
| 5 | [Colyseus rooms and recovery](./phase-05-colyseus-rooms-and-recovery.md) | 3, 4 | Pending |
| 6 | [Frontend runtime cutover](./phase-06-frontend-runtime-cutover.md) | 4, 5 | Pending |
| 7 | [Reliability, security, and load gates](./phase-07-reliability-security-and-load-gates.md) | 6 | Pending |
| 8 | [Clean removal, deployment, and docs](./phase-08-clean-removal-deployment-and-docs.md) | 7 | Pending |

Critical path: `1 -> 2 -> 3/4 -> 5 -> 6 -> 7 -> 8`. Phases 3 and 4 may proceed concurrently after Phase 2 if file ownership remains separate.

## Acceptance Criteria

- [ ] Privy-only login; every API request/room command is authenticated, authorized, schema-validated, and server-authoritative.
- [ ] Create, discover, join, start, play, reconnect, finish, settle, review, and leaderboard flows preserve current visible UX with no new action.
- [ ] Account coin and in-match cash are distinct; ledger, reservations, refunds, and settlements remain atomic and idempotent under retries/concurrency.
- [ ] Every accepted command commits its full versioned checkpoint before ack/broadcast; lease fencing and restart/restore tests prevent split ownership or lost state.
- [ ] Reachable Rust behavior has executable characterization evidence; the approved frozen-source authority covers runtime paths unreachable after the legacy start rollback. Unsupported auction and absent card effects are not invented.
- [ ] API, game server, and web build/deploy/restart independently; database-role tests, backup/restore drill, visual regression, crash matrix, and confirmed 200-client/~50-room gate pass.
- [ ] Browser and production backend contain no Solana, Anchor, Magic Block, indexer, generated SDK, wallet-signing, or public Privy private-key runtime surface.

## Unresolved Questions

None.

## Red Team Review

- Completed 2026-08-11 with four lenses: security/facts, failure/flow, assumptions/scope, and contract/complexity.
- CEO approved all evidence-backed findings on 2026-08-11: technical corrections are incorporated across the phase files; rule/UX/policy choices plus the two launch hypotheses remain in the validation gate above.
- Rejected as non-findings: the approved one-replica topology, no Redis/queue, full checkpoint-per-command pending measurement, secure server RNG without VRF, no production dual engine, and fail-closed corrupt-checkpoint handling.

## Validation Log

- 2026-08-11 — Preserve executed credit-only `CollectFromPlayers`; model it as a defined bank inflow rather than debiting other players.
- 2026-08-11 — If every player remains disconnected through the 120-second reconnect window, abort the game and refund reservations idempotently. Accepted trade-off: coordinated disconnect can be abused to avoid a losing result; instrument and rate-limit repeated abort patterns, but do not change this policy silently.
- 2026-08-11 — Preserve the visible Claim Reward control as a settlement status/idempotent retry action; durable automatic reconciliation remains authoritative.
- 2026-08-11 — Enable a 1,000-coin initial grant and rescue top-up to 100 at most once per rolling 24 hours, enforced and audited server-side.
- 2026-08-11 — Confirm release hypothesis: 200 authenticated concurrent players across about 50 four-player rooms for 30 minutes, with the Phase 7 correctness/latency/resource thresholds.
- 2026-08-11 — Correct the Community Chest “Free Parking” card to move to board position 20 and align the visible copy. Record this as an approved behavior correction from the executed position-21 legacy behavior.
- 2026-08-11 — Accept the frozen Rust source plus the decisions above as the migration authority where the legacy MagicBlock start path cannot commit. The characterized start attempt emits `GameStarted` and then rolls back byte-for-byte after an access violation; the closed/absent deployed program provides no stronger runtime authority. Do not repair or redeploy legacy Solana solely for parity. Authenticated board/dialog visual parity remains a mandatory Phase 6/7 release gate.
