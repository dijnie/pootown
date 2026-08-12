---
phase: 3
title: "Web Cutover and Verification"
status: pending
priority: P1
effort: "1-2 days"
dependencies: [2]
---

# Phase 3: Web Cutover and Verification

## Overview

Replace Privy React integration with first-party email registration/login UI and in-memory access-token lifecycle while preserving the existing lobby and board UX.

## Requirements

- Functional: register/login modal, logout, refresh-on-load, one bounded refresh after 401, authenticated create/join/reconnect/account calls.
- Security: `credentials: include` only for auth refresh/logout, no token in URL/storage/log, no Privy CSP origin/env/dependency.

## Related Code Files

- Create: auth client/provider and focused contract/lifecycle tests.
- Modify: API provider/client, header/account controls, game list/view, app provider, env/CSP, package/lock, root setup documentation.
- Delete: `privy-provider.tsx` and Privy-specific hooks/imports/config.

## Implementation Steps

1. Add auth service and provider state machine: bootstrapping, anonymous, authenticated, refreshing; fence stale async completions.
2. Add existing-style email/password dialog for login/register and wire account/logout controls.
3. Teach API client to request one provider refresh after eligible 401; preserve mutation idempotency keys across retry.
4. Remove Privy package/config/CSP and scan browser artifacts for Privy/token leakage.
5. Run real local PostgreSQL + API HTTP register/login/refresh/logout and authenticated session smoke, then full repo gates.

## Success Criteria

- [ ] Reload restores auth only through the refresh cookie.
- [ ] Logout clears client access and revokes server refresh session.
- [ ] Existing game actions still use bearer access tokens and typed server contracts.
- [ ] Web visual shell remains unchanged except the accepted email auth dialog/copy.
- [ ] Full test/lint/build/smoke and secret/import scans pass.
