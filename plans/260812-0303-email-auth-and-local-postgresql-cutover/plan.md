---
title: "Email Auth and Local PostgreSQL Cutover"
description: "Replace Privy with first-party email/password sessions and provide a reproducible PostgreSQL Docker environment."
status: in-progress
priority: P1
effort: 3-5 days
issue: null
branch: main
tags: [auth, email, postgres, docker, frontend, backend, security]
blockedBy: []
blocks: [260811-0313-nestjs-colyseus-monorepo-refactor]
created: 2026-08-12
---

# Email Auth and Local PostgreSQL Cutover

## Outcome

Run Pootown locally with PostgreSQL 17.6 in Docker and replace every Privy runtime/config/dependency with first-party email/password registration, login, access-token refresh, and logout. Preserve existing user IDs, economy authority, game admission, and room-ticket behavior.

## Constraints and Non-goals

- CEO selected the minimal scope: no email verification, forgot/reset password, social login, MFA, roles UI, or mail service.
- Clean cutover: no Privy alias, compatibility verifier, dual token mode, wallet identity, or migration of production users.
- Adapt the source behavior to existing NestJS, Zod, explicit SQL, `jose`, strict contracts, and API error envelopes. Do not import Prisma, class-validator, Passport, Swagger DTOs, or source social providers.
- Access tokens stay in browser memory. Refresh tokens use rotating, hashed server sessions and an `HttpOnly` cookie; neither token is written to URL or browser storage.
- API remains the only Account Coin authority. Registration/provisioning grants exactly one initial balance under concurrency.

## Source Manifest

- Source: `https://github.com/dijnie/nest-next-tuborepo/tree/master/apps/backend/src/auth`
- Ref: `master` at `9321cd197a297f125a8a5985910c99a84c289927`
- Relevant anatomy: email controller/service, bcrypt password verification, access/refresh JWTs, rotating session hash, logout revocation, user repository.
- Deliberate omissions: verification/reset mail paths, Google/Facebook, Prisma persistence, Passport strategies, class-transformer serialization.

## Decision Matrix

| Decision | Source | Pootown adaptation | Reason |
|---|---|---|---|
| Password | `bcryptjs`, default cost | Exact-pinned `bcryptjs`, explicit cost 12 | Pure JS, source-aligned, predictable deployment |
| Access auth | Passport JWT | Existing global guard + `jose` HS256 verifier | Avoid a second guard/framework stack |
| Refresh | JWT returned in JSON, session hash rotated | Refresh JWT in `HttpOnly` cookie, SHA-256 hash in DB, rotate on every refresh | Reduce XSS exposure and detect replay |
| Identity | Prisma user/provider model | Append-only SQL migration from `privy_did` to canonical email/password hash | Preserve local schema/role ownership |
| Registration grant | Separate user flow | One DB transaction creates user, coin account, ledger grant, and session | Prevent identity without balance or double grant |
| Local DB | Unspecified | `postgres:17.6-alpine`, named volume, healthcheck, explicit ports | Matches current real-PG tests |

Risk: high blast radius, but bounded by clean-cutover/no-live-user assumption and existing strict DB/test infrastructure.

## Phases

| # | Phase | Depends on | Status |
|---|---|---|---|
| 1 | [Docker PostgreSQL and schema boundary](./phase-01-start.md) | - | Complete |
| 2 | [API email authentication](./phase-02-api-email-authentication.md) | 1 | Complete |
| 3 | [Web cutover and verification](./phase-03-web-cutover-and-verification.md) | 2 | Pending |

## Acceptance Criteria

- [ ] `docker compose up -d postgres` reaches healthy state with persistent data; migrations are repeatable on PostgreSQL 17.6.
- [ ] Concurrent registration for one canonical email creates one user and exactly one initial 1,000 Account Coin grant.
- [ ] Login is enumeration-resistant; passwords are never logged or returned; malformed/oversized input fails closed.
- [ ] Access JWTs bind immutable user/session IDs and expire quickly; refresh rotation invalidates the prior token; replay revokes the session; logout revokes it.
- [ ] Existing authenticated API/game admission paths work with the new principal and no Privy-shaped field remains.
- [ ] Web supports register/login/logout, bounded transparent refresh, reload via refresh cookie, and no token persistence in local/session storage.
- [ ] Privy dependencies, provider, env, CSP origins, verifier, config, tests, and documentation are removed.
- [ ] Frozen install, contracts/API/web tests, migration/role E2E, lint, builds, chain/Privy scan, and a real local HTTP auth smoke test pass.

## Rollback

Before public launch, revert the focused auth commits and recreate the local database. There is no production-user compatibility path; if non-empty identity data is detected, stop instead of guessing an email mapping.

## Unresolved Questions

None. CEO selected minimal email/password auth on 2026-08-12.
