---
phase: 5
title: "Colyseus Rooms and Recovery"
status: complete
priority: P1
effort: "2-2.5 weeks"
dependencies: [3, 4]
---

# Phase 5: Colyseus Rooms and Recovery

## Context Links

- [Rules port](./phase-03-complete-game-rules-port.md) · [API authority](./phase-04-nestjs-identity-economy-and-sessions.md) · [Checkpoint research](./research/researcher-02-service-contracts.md#checkpoint-and-recovery)
- Evidence: client SDK mixes subscriptions/events at `apps/web/lib/sdk/sdk.ts:1396-1772`; timeout state exists at `programs/panda-monopoly/src/state/mod.rs:138-147`.
- Official: [Colyseus Room lifecycle](https://docs.colyseus.io/server/room), [client reconnection](https://docs.colyseus.io/client/room).

## Overview

Build one-replica authoritative rooms with ticket admission, revision-checked commands, commit-before-ack full checkpoints, timers, reconnect/resume, lease fencing, and retry-safe settlement.

## Requirements

- Room policy: 90s turn; warnings at 30/10; 120s reconnect while timer continues; three misses forfeit while at least one player remains connected; waiting room expires/refunds after 15m; if every player stays disconnected for the full 120s window, abort/refund idempotently; finished room stays live 10m.
- Every accepted player/internal command writes command result, events, and full checkpoint in one PostgreSQL transaction before any ack/broadcast.
- Acquire/renew `room_leases` with fencing token; stale writes fail. Exactly one replica initially; no Redis, distributed presence, or room movement.
- Corrupt/missing/incompatible checkpoint -> `recovery_required`, commands stop and alert; no guessed conversion, settlement, or active-game auto-refund.

## Architecture and Data Flow

Join `{ticket,contractVersion}` -> authenticated internal HTTP consume creates/reuses durable seat -> trusted private claims -> socket attaches to that seat. Command `{requestId,expectedStateVersion,type,payload}` -> parse/auth -> duplicate lookup and request-hash comparison -> for new requests only, deadline/version checks -> one per-room scheduler -> core transition -> fenced compare-and-set transaction stores unique command/ack, events, and full checkpoint -> commit -> publish. Exact retries return stored ack even when their expected version is now stale.

Restart/reconnect acquires the lease, validates latest checkpoint/checksum, restores RNG/deadlines and the zero-connected deadline, persists at most one overdue timeout/abort with a unique deadline identity, then sends full canonical state/version. Client discards local speculative state. API reconciliation, not room lifetime, guarantees waiting expiry/refunds, all-offline abort/refund, and terminal settlement retries.

## Related Code Files

Planned new paths:

- Create: `/home/dijnie/project/persional/pootown/apps/game-server/package.json`, `tsconfig.json`, `src/main.ts`, `src/app-config.ts`.
- Create: `/home/dijnie/project/persional/pootown/apps/game-server/src/rooms/game-room.ts`, `src/rooms/game-room-state.ts`, `src/auth/ticket-auth.ts`, `src/commands/command-handler.ts`, `src/persistence/checkpoint-repository.ts`, `src/persistence/command-repository.ts`, `src/persistence/room-lease.ts`, `src/timers/room-clock.ts`, `src/api/api-client.ts`, `src/observability/`.
- Create: `/home/dijnie/project/persional/pootown/apps/game-server/test/admission.test.ts`, `commands.test.ts`, `reconnect.test.ts`, `restart-recovery.test.ts`, `lease-fencing.test.ts`, `timers.test.ts`, `settlement.test.ts`.
- Modify: `/home/dijnie/project/persional/pootown/package.json`, `/home/dijnie/project/persional/pootown/pnpm-lock.yaml`.

Consumed without modification: `/home/dijnie/project/persional/pootown/packages/game-core/`, `/home/dijnie/project/persional/pootown/packages/game-contracts/`, API-owned migrations.

## Implementation Steps

1. Scaffold independent build/start/readiness and graceful shutdown. Fail startup if Redis/distributed presence is enabled.
2. Consume tickets through authenticated internal HTTP; require its durable seat binding before `onJoin` attaches the socket. Reject replay, wrong binding/role, expiry, duplicate active client, and spectator. Reconnect requires an API ticket for the existing durable seat. Test crashes after ticket consume and before socket attach.
3. Map public shared state separately from direct per-client private payloads; never place hidden deck/RNG/auth claims in shared schema. Test raw snapshots/patches/messages with four clients so each sees public state plus only its own private view. Re-authorize membership, actor, turn, and phase on every command.
4. Serialize every player/timer transition through one per-room scheduler. Before version/deadline checks, look up idempotency by `(roomId,playerId,requestId)` plus request hash/ack; exact duplicates return stored ack, conflicting reuse rejects, and only new requests validate revision.
5. Enforce compute -> fenced DB compare-and-set from expected revision -> insert events/command/full checkpoint with `UNIQUE(room_id,state_version)` -> commit -> room update/ack. Add test-only crash hooks pre-commit, post-commit/pre-ack, and post-ack, plus concurrent player/timer submissions from the same revision proving exactly one commit.
6. Persist schema/state versions, checksum, full state, RNG continuation/consumption, deadlines, fence, and timestamps. Patches are never durable storage.
7. Fence every write. Lease loss pauses commands/readiness, alerts, and requires ownership recovery/reconnect.
8. Implement timers as revision-checked internal commands. Individual reconnect never pauses time. When connected count reaches zero, persist a 120-second abort deadline; any valid reconnect cancels it, otherwise transition once to aborted and request idempotent API refunds. Track repeated all-offline abort patterns for abuse review. Room-local cleanup is idempotent but API reconciliation remains authoritative.
9. For leave/cancel, first persist a fenced room transition that blocks start/admission, then call API release with a stable key; API reconciliation completes it after crashes. Call API started/refund/settlement with stable keys and terminal proof; retry while loaded, while the API periodic/startup reconciler guarantees completion after unload/restart. No account-coin calculation/write.
10. Add metrics/logs and prove independent restart/recovery.

## Tests and Validation

```bash
pnpm --filter @pootown/game-server lint
pnpm --filter @pootown/game-server test
pnpm --filter @pootown/game-server test:integration
pnpm --filter @pootown/game-server build
```

- Crash: before commit -> none; post-commit/pre-ack -> retry gets stored ack; post-ack -> no duplicate.
- Races: late player/timeout, two owners, duplicate reconnect, leave/cancel across the service call, repeated settlement/refund, lease loss mid-command, DB unavailable.
- Recovery: timer continues, overdue timeout/all-offline abort runs once, refund reconciles, RNG/state/version match, corrupt checkpoint fails closed.

## Success Criteria

- [x] Admission, command, checkpoint, reconnect, timer, lease, and settlement tests pass.
- [x] No ack/patch/event appears before commit.
- [x] Restart restores exactly and stale owners cannot write.
- [x] Every room policy runs once under retries/restarts.
- [x] Realtime cannot mutate account coin; no Redis/queue/event sourcing exists.

## Risk Assessment

| Risk | Observable failure signal | Pre-decided response |
|---|---|---|
| Per-command checkpoint exceeds DB budget | Phase 7 latency/CPU/pool gate fails | Compact payload/profile first; replan snapshots+replay only with measured need. |
| Single replica restart is too slow | Recovery exceeds policy repeatedly | Improve restart/readiness/runbook; Redis/multi-replica needs separate approval. |
| Settlement API is unavailable | Session remains `settling` | Keep terminal checkpoint immutable and retry same key; never pay/refund locally. |

## Rollback Notes

Dark-deploy with synthetic tickets. Stop realtime and disable new sessions; preserve checkpoints for diagnosis. No production legacy fallback/engine handoff.

## Security Considerations

Require TLS/WSS, origin allowlist, limits, service auth, role grants, pseudonymous logs, and redaction. Hidden state/RNG/auth claims never enter shared schema.

## Next Steps

Phase 6 replaces browser adapters. Unresolved questions: none.
