---
phase: 6
title: "Frontend Runtime Cutover"
status: complete
priority: P1
effort: "1.5-2 weeks"
dependencies: [4, 5]
---

# Phase 6: Frontend Runtime Cutover

## Context Links

- [Preservation boundary](../reports/brainstorm-260811-0246-nestjs-colyseus-monorepo.md#frontend-preservation-boundary) · [Room contracts](./phase-05-colyseus-rooms-and-recovery.md)
- Evidence: provider tree `apps/web/components/providers/app-provider.tsx:1-22`; transaction imports `game-provider.tsx:3-12`; account subscription `useGameState.tsx:39-170,296-416`; lobby scan `useGames.ts:21-79`.

## Overview

Preserve pages, board, dialogs, animation, sound, and interaction flow while replacing wallet/RPC/transaction/indexer adapters with first-party email bearer API calls and Colyseus state/messages.

## Requirements

- Functional: email/password registration/login/refresh/logout; session browse/create/join; ticket connection; state patches; ack/reject; reconnect/full replacement; results/history/leaderboard/account coin.
- UX: no new visible action or redesign; same breakpoints/states. Auction and missing effects stay absent. Remove spectator controls. Replace Claim Reward with read-only settlement status; server reconciliation retries automatically and the browser never calculates, authorizes, or triggers payout.
- Use opaque user/player IDs. Clearly distinguish non-withdrawable account coin from in-match cash; remove wallet signature/deposit/withdraw semantics.
- Stable request IDs survive retries; stale revision triggers full resync, never optimistic overwrite.

## Architecture and Data Flow

`AppProviders`: first-party email session -> typed API/session client -> room client -> existing `GameProvider`, event, and log facades. API owns lobby/account/history; Colyseus state is canonical; ack/reject controls pending UI; domain events feed existing effects. Map shared DTOs once into UI views.

## Related Code Files

Verified existing to modify:

- `/home/dijnie/project/persional/pootown/apps/web/components/providers/app-provider.tsx`, `game-provider.tsx`, `game-events-provider.tsx`, `game-logs-provider.tsx`, and the superseding email auth provider from the 2026-08-12 cutover plan.
- `/home/dijnie/project/persional/pootown/apps/web/hooks/useGameState.tsx`, `useGames.ts`, `use-wallet.ts`, plus wallet/balance hooks and visible components proven reachable by import scan.
- `/home/dijnie/project/persional/pootown/apps/web/services/api-client.ts`, `leaderboard.ts`, `/home/dijnie/project/persional/pootown/apps/web/types/schema.ts`, `configs/env.ts`, `package.json` and the tracked environment template.

Planned new paths:

- Create: `/home/dijnie/project/persional/pootown/apps/web/services/session-api.ts`, `account-api.ts`, `game-room-client.ts`, `/home/dijnie/project/persional/pootown/apps/web/components/providers/game-session-provider.tsx`, `/home/dijnie/project/persional/pootown/apps/web/hooks/use-game-session.ts`, `use-account-coins.ts`.
- Create: `/home/dijnie/project/persional/pootown/apps/web/tests/contract.test.ts`, `provider-integration.test.tsx`, `reconnect.test.tsx`, `tests/visual/`.

Delete after imports/tests prove unused: `/home/dijnie/project/persional/pootown/apps/web/components/providers/rpc-provider.tsx`, `/home/dijnie/project/persional/pootown/apps/web/lib/sdk/`, `/home/dijnie/project/persional/pootown/apps/web/lib/tx/`, and reachable-scan-confirmed Solana-only hooks/components.

## Implementation Steps

1. Extend API client with typed mutations, bearer/idempotency/version headers, errors, timeout, and one bounded token refresh. Generate request ID at user intent.
2. Implement API/session/room clients. Ticket stays only in join payload. Reconnect discards local speculative state for canonical snapshot/version.
3. Replace `RpcProvider`; retain visual-component facade shape where useful, but change `Address` to opaque IDs at adapter boundary.
4. Reimplement `GameProvider` visible methods as typed commands. Disable duplicate submit while pending; reconcile ack/reject/version.
5. Adapt events/logs/sounds to domain events, timeout state, and the all-offline abort/refund result. Correct controls/results derive from canonical state if an event is missed.
6. Replace lobby/indexer reads with API v1. Preserve meaningful visible fields; remove blockchain earnings/claim concepts rather than fake them.
7. Replace wallet/balance copy with the first-party email identity and labeled account coin/in-match cash. Remove signature/deposit/withdraw/transaction/explorer/PDA flows without adding actions. Replace Claim Reward in its existing visual location with read-only settlement status sourced from the public session lifecycle; server reconciliation owns retries.
8. Remove unused Solana adapters/dependencies only after green visual, interaction, contract, and bundle scans.
9. Add a first-party auth CSP/security-header policy: exact API/WSS `connect-src`, restrictive `frame-ancestors`, production-safe script policy/nonces where practical, and browser tests proving auth/join still work without token/ticket leakage.

## Tests and Validation

```bash
pnpm --filter ./apps/web lint
pnpm --filter ./apps/web test
pnpm --filter ./apps/web test:visual
pnpm --filter ./apps/web build
rg -n "@solana|anchor|MagicBlock|NEXT_PUBLIC_.*RPC|AUTH_PRIVATE_KEY|signTransaction|PDA" apps/web
```

- Test auth expiry, join failure, duplicate click, stale revision, rejection, disconnect/reconnect, missed event, terminal state, and API outage.
- Compare Phase 1 screenshots at identical breakpoints; allow only approved identity/coin copy, spectator removal, all-offline result, and reward-settlement semantic deltas. Record each approved delta rather than weakening the baseline.

Phase 6 closure evidence covers strict clients/adapters, stable idempotency keys, auth mutation ordering, command rejection mapping, pending-command reconnect replay, public desktop/mobile visuals, and a real create -> join -> start -> canonical reload vertical on both breakpoints. Phase 7 owns the remaining browser-level join-failure, duplicate-click, missed-event, play-to-finish, terminal, API-outage, and fault-injection matrix as part of its full vertical release gate.

## Success Criteria

- [x] Visual/interaction baseline passes with only approved semantic copy changes.
- [x] Every visible action uses typed server intent and handles ack/reject/reconnect.
- [x] Account coin and in-match cash are visibly/technically distinct.
- [x] Browser bundle/config/import graph has no chain/signing/private-key runtime.
- [x] Unsupported gameplay is not surfaced.

## Risk Assessment

| Risk | Observable failure signal | Pre-decided response |
|---|---|---|
| Facade hides chain assumptions | Component still needs Address/RPC/transaction | Add local view adapter; never preserve Solana-shaped facade. |
| Missed event breaks correctness | Reload/reconnect changes controls/result | Derive correctness from canonical state; events remain best-effort effects. |
| Pixel parity implies false wallet semantics | UI suggests withdrawable balance | Approve minimal copy/icon removal; product truth overrides pixel identity. |

## Rollback Notes

Before public cutover, redeploy the prior web artifact while services stay dark. After clean cutover there is no legacy engine fallback; roll forward with restored new-system services/checkpoints.

## Security Considerations

Never persist access tokens/tickets in URL/browser storage. Sanitize errors, enforce allowed origins, and prove browser artifacts contain no server credential.

## Next Steps

Phase 7 tests the full vertical path. Unresolved questions: none.
