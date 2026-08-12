---
phase: 2
title: "API Email Authentication"
status: pending
priority: P1
effort: "1.5-2 days"
dependencies: [1]
---

# Phase 2: API Email Authentication

## Overview

Implement strict email registration/login/refresh/logout and replace the Privy principal/verifier while keeping all downstream services user-ID based.

## Requirements

- Functional: register, login, refresh, logout; canonical lowercase email; password 12-128 characters; access and rotating refresh sessions.
- Security: bcrypt cost 12, generic invalid-credential response, request throttling, refresh cookie `HttpOnly`, production `Secure`, bounded TTLs, replay revocation, redacted logs.

## Related Code Files

- Create: auth DTO contracts, email auth controller/service, password hasher, JWT verifier/session repository tests.
- Modify: `packages/game-contracts`, API auth module/guard/types/config, identity/economy provisioning, app module, exception/CORS behavior, package and lock.
- Delete: Privy verifier and Privy-specific tests/config.

## Implementation Steps

1. Add strict shared request/response schemas and auth error codes without exposing password hashes or refresh tokens.
2. Refactor principal to `{ userId, sessionId }`; existing controllers/services consume the same principal boundary.
3. Register atomically: insert canonical email identity, create initial account/ledger grant, create refresh session, return access token and set cookie.
4. Login with constant response shape; create session only after bcrypt verification.
5. Refresh under row lock: verify cookie JWT + stored hash/expiry, rotate once, reject/revoke replay. Logout idempotently revokes current session and clears cookie.
6. Cover malformed tokens, expiry/future times, wrong issuer/audience, races, rollback, logs, grants, and role access on real PostgreSQL.

## Success Criteria

- [ ] Full negative and concurrency matrix passes.
- [ ] No Privy dependency/config/source remains in API.
- [ ] Existing economy/session/history endpoints authenticate with the new access token unchanged semantically.
