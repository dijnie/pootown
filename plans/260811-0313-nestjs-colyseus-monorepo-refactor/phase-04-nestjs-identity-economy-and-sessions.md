---
phase: 4
title: "NestJS Identity Economy and Sessions"
status: complete
priority: P1
effort: "2-2.5 weeks"
dependencies: [2]
---

# Phase 4: NestJS Identity Economy and Sessions

## Context Links

- [Contracts](./phase-02-shared-contracts-and-core-lifecycle.md) · [Service contract research](./research/researcher-02-service-contracts.md)
- Evidence: public private-key variable at `apps/web/configs/env.ts:14-15,38-40` after Phase 1; existing API client is GET-only at `apps/web/services/api-client.ts:30-77`; legacy schema is a blockchain mirror at `indexer/src/infra/db/schema.ts:143-331`.
- Official: [NestJS guards](https://docs.nestjs.com/guards), [Privy access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens), [PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html).

## Overview

Build the sole account/coin/session authority with server-verified Privy identity, append-only ledger, atomic admission reservation, hashed one-use tickets, idempotent refund/settlement, and read models.

## Requirements

- Functional: `/v1/me`, coins/operations, session list/detail/create/join-intent/release/reconnect-ticket, leaderboard/history, health/readiness, and narrow authenticated internal ticket-consume/started/settlement/abort/reconciliation operations.
- Correctness: API alone writes identity/economy/game/readmodel schemas. `availableCoin` and `reservedCoin` never go negative; request hash+idempotency key returns the prior response or `409` on mismatch.
- Admission: reserve entry coin and insert a random 256-bit ticket hash in one transaction; return plaintext once; consume atomically for the bound user/session/room/reservation/role. No spectators.
- Launch economy: new accounts receive 1,000 coins; an account below 100 is topped up to 100 at most once per rolling 24 hours. Values remain server-configured; grants are ledgered, concurrency-safe, idempotent, and auditable.

## Architecture and Data Flow

Browser bearer token -> global `PrivyAuthGuard` verifies signature/issuer/audience/expiry -> user binding -> transactional service. Join locks account/session, reserves account coin, creates join intent and hashed ticket. Game-server calls an authenticated internal HTTP ticket-consume endpoint; it has no access to API-owned ticket/session/economy objects. That endpoint atomically consumes or reuses the ticket and creates the durable seat binding before a socket attaches. Settlement uses authenticated internal HTTP, validates immutable session policy plus durable terminal checkpoint proof, then captures reservations and credits winner atomically.

One PostgreSQL cluster, API-owned migration history, schemas/roles: `identity`, `economy`, `game`, `readmodel`, `realtime`. `api_runtime` writes first four and can read settlement proof; `realtime_runtime` writes only realtime tables and cannot access API-owned schemas. No shared unrestricted role.

## Related Code Files

Planned new paths:

- Create: `/home/dijnie/project/persional/pootown/apps/api/package.json`, `tsconfig.json`, `nest-cli.json`, `src/main.ts`, `src/app.module.ts`.
- Create: `/home/dijnie/project/persional/pootown/apps/api/src/auth/`, `src/database/schema/`, `src/database/migrations/`, `src/database/roles/`, `src/identity/`, `src/economy/`, `src/game-sessions/`, `src/leaderboard/`, `src/internal/`, `src/health/`, `src/observability/`.
- Create: `/home/dijnie/project/persional/pootown/apps/api/test/{auth,economy-idempotency,economy-concurrency,tickets,sessions,settlement,database-roles}.e2e-spec.ts`.
- Modify: `/home/dijnie/project/persional/pootown/package.json`, `/home/dijnie/project/persional/pootown/pnpm-lock.yaml`.

Verified existing reference only: `/home/dijnie/project/persional/pootown/indexer/src/infra/db/schema.ts`, `indexer/src/server/routes/leaderboard.ts`, `apps/web/services/leaderboard.ts`.

## Implementation Steps

1. Scaffold NestJS with strict validation, config validation, Helmet, exact CORS allowlist, size/rate limits, structured logging, `/health/live`, and DB-backed `/health/ready`.
2. Add API-owned migrations for users, coin accounts/operations/ledger/reservations/settlements, sessions/players/join intents/tickets, leaderboard/history, and realtime checkpoint/lease/command/event tables. Add checks, FKs, unique operation keys, request hashes, and role grants.
3. Implement Privy verification and user upsert from stable Privy user ID. Do not require or select a wallet for identity, do not accept identity in bodies, and do not use wallet signing.
4. Remove `NEXT_PUBLIC_AUTH_PRIVATE_KEY_PRIVY` from web schema/example/config immediately. Search deployment history/config; if it was ever populated, block release until the key is rotated in Privy/secret storage. If never populated, record evidence and no rotation is needed.
5. Implement account coin ledger with balanced append-only entries, row locks, retry-safe response snapshots, reconciliation query, and separate domain types from core `cash`. Add the approved 1,000 initial grant and rolling-24h rescue-to-100 operation with unique keys and concurrent eligibility checks.
6. Implement one-click session creation as one idempotent API flow that creates the session, creator reservation, durable creator seat binding, and one-use ticket response; game-server lazily materializes the room from durable session/bootstrap data. Implement join intent with max-four capacity and funds under transaction locks, one reservation/seat per user/session, ticket hash/TTL, and unused-ticket rotation without double reserve.
7. Implement a durable `open -> cancelling -> cancelled` state machine plus API-owned periodic/startup SQL reconciliation for expired waiting sessions, unused/non-seated tickets after grace, and started/settling mismatches. It locks the session, blocks admission/start while cancellation is pending, and retries stable operation keys until every reservation is released/captured. Do not auto-refund active recovery failures.
8. Implement authenticated internal HTTP ticket consumption as one transaction that consumes/reuses the hash and creates/reuses the durable seat binding. A same-key retry after commit rotates an unused plaintext ticket transactionally because plaintext is never stored; define consumed/in-flight races explicitly. Add internal started, settlement, and explicit abort endpoints. Settlement key is unique per session/kind; API calculates payout from immutable policy and checkpoint proof. Game-server cannot send trusted amounts.
9. Implement history/leaderboard envelopes compatible with current visible UI fields where meaningful; do not migrate legacy records.
10. Document and test migrations, role grants, backup scope, and reconciliation. No Redis, BullMQ, queue, outbox, event store, admin UI, or spectator role.

## Tests and Validation

```bash
pnpm --filter @pootown/api lint
pnpm --filter @pootown/api test
pnpm --filter @pootown/api test:e2e
pnpm --filter @pootown/api build
pnpm --filter @pootown/api db:migrate:test
```

- Race 20 joins for the last seat/last sufficient balance; exactly one valid reservation outcome.
- Retry every mutation before response, after commit, with same/different request hash. Assert no double grant/reserve/release/capture/credit.
- Reject invalid/expired/wrong issuer/audience Privy token, ticket replay/wrong room/expired ticket, forged amount, unauthorized internal call, and all realtime access to API-owned schemas. Test post-commit/pre-response ticket retry and crash between admission response and socket attach.

## Success Criteria

- [x] Auth, economy, sessions, ticket, settlement, leaderboard, health, migration, and role tests pass.
- [x] API is sole account-coin writer and all operations reconcile under concurrency/retries.
- [x] Plain tickets and tokens never persist/log; ticket replay cannot create a seat.
- [x] Public Privy private-key config is removed; [conditional rotation evidence](./reports/phase-04-privy-key-rotation-evidence.md) is recorded.
- [x] No legacy record migration or new queue/Redis/admin/spectator capability exists.

## Risk Assessment

| Risk | Observable failure signal | Pre-decided response |
|---|---|---|
| Lock ordering deadlocks | PostgreSQL deadlock/lock-wait metric or race test fails | Standardize lock order account->session->reservation and retry only serialization/deadlock errors with bounds. |
| Ticket expiry races room join | Reservation released while consume is in flight | Require unconsumed+no active seat+grace in cleanup; add race test before release. |
| Grant/top-up is farmed or races | Repeated identities, concurrent eligibility wins, or abnormal rescue frequency | Enforce stable Privy identity, rolling-window lock/unique operation, rate/abuse metrics, and no client-supplied amount. |

## Rollback Notes

Migrations are additive until Phase 8; rollback deploy by stopping API traffic, not dropping schemas. Keep committed ledger data; use compensating operations, never edit/delete entries.

## Security Considerations

Secrets stay server-only; redact bearer tokens, tickets, hashes, and auth headers. Internal auth uses mTLS/workload identity or a separately rotated short-lived service credential, never a user JWT. Encrypt backups and enforce least-privilege grants in tests.

## Next Steps

Phase 5 consumes tickets and settlement APIs. Unresolved questions: none.
