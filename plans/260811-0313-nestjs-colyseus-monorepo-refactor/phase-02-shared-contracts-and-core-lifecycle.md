---
phase: 2
title: "Shared Contracts and Core Lifecycle"
status: pending
priority: P1
effort: "1.5-2 weeks"
dependencies: [1]
---

# Phase 2: Shared Contracts and Core Lifecycle

## Context Links

- [Phase 1 baseline](./phase-01-start.md) · [Rules target separation](./research/researcher-01-rules-migration.md#1-current-authority-and-boundaries) · [Service ownership](./research/researcher-02-service-contracts.md#ownership-and-trust-boundaries)
- Evidence: active game/player shapes live at `programs/panda-monopoly/src/state/mod.rs:97-148` and `:391-425`; UI duplicates Solana-coupled shapes at `apps/web/types/schema.ts:46-166` after Phase 1.
- Official: [Zod](https://zod.dev/), [Colyseus state synchronization](https://docs.colyseus.io/state).

## Overview

Create framework-neutral transport schemas and a pure TypeScript state machine skeleton. Deliver lifecycle, seating, versioning, serialization, clock, RNG ports, and replay before complex game rules.

## Requirements

- Functional: versioned HTTP/room DTOs; discriminated commands/events/errors; create/join/leave/cancel/start; 2-4 seats; stable seat order; replayable full snapshots; exact lifecycle invariants.
- Non-functional: `game-core` imports no NestJS, Colyseus, database, wallet, network, or environment API. Contracts contain no framework classes and reject unknown/oversized data.
- Economy split: core owns integer in-match cash and bank/assets only. Contracts name API account fields `availableCoin`/`reservedCoin` and core fields `cash`/`bankCash`; never reuse a balance type.

## Architecture and Data Flow

`game-contracts` owns Zod schemas plus inferred TypeScript types for REST DTOs, room envelopes, errors, state views, and domain events. `game-core` accepts `(state, command, {actorId, now, randomSource})`, validates state/actor, and returns a deterministic transition. Infrastructure adds IDs/timestamps and persists later.

Every room command envelope starts as `{requestId, expectedStateVersion, type, payload}`. Accepted transitions increment exactly one `stateVersion`; stale revisions reject. Full snapshots carry `schemaVersion`, state version, secure RNG continuation state/consumption record, and absolute deadlines.

## Related Code Files

Planned new paths:

- Create: `/home/dijnie/project/persional/pootown/packages/game-contracts/package.json`, `tsconfig.json`, `src/index.ts`, `src/http/`, `src/realtime/`, `src/state/`, `src/errors.ts`, `test/contract.test.ts`.
- Create: `/home/dijnie/project/persional/pootown/packages/game-core/package.json`, `tsconfig.json`, `src/index.ts`, `src/model/`, `src/rules/`, `src/commands/`, `src/events/`, `src/ports/clock.ts`, `src/ports/random-source.ts`, `src/serialization/`, `test/lifecycle.test.ts`, `test/replay.test.ts`.
- Modify: `/home/dijnie/project/persional/pootown/package.json`, `/home/dijnie/project/persional/pootown/pnpm-lock.yaml`.

Verified reference only; do not modify:

- `/home/dijnie/project/persional/pootown/programs/panda-monopoly/src/state/mod.rs`, `/home/dijnie/project/persional/pootown/programs/panda-monopoly/src/constants.rs`, `/home/dijnie/project/persional/pootown/apps/web/types/schema.ts`.

## Implementation Steps

1. Define package names/exports/build/test scripts. Enforce forbidden imports into `game-core` with ESLint boundaries and a dependency test.
2. Define canonical IDs as opaque strings, integer encodings, UTC epoch milliseconds, contract/schema versions, pagination, error envelope, and strict Zod parsing. Use decimal strings at transport/storage boundaries for values that may exceed JS safe integers.
3. Define public room state vs per-player private view. Auth claims, tokens/tickets, hidden deck/RNG data, and other players' private data must never enter shared state.
4. Model explicit lifecycle and `turn.phase`; derive counts where fixtures prove safe. Preserve stable seat indices even after elimination and enforce max four.
5. Implement lifecycle commands and guards from characterized Rust behavior. No PDA, transaction, signature, wallet, callback, or Solana-shaped facade enters the API.
6. Add `Clock` and `RandomSource` ports. Production RNG contract requires cryptographically secure bytes supplied by game-server; deterministic test RNG is injectable. Clients cannot provide rolls, seeds, or card indices.
7. Implement snapshot serialize/parse/checksum and deterministic replay. Fail closed on unknown schema version, invalid bigint encoding, illegal state, or mismatched revision.
8. Publish contract fixtures that API, game-server, and web tests can consume without importing each other's application code.

## Tests and Validation

```bash
pnpm --filter @pootown/game-contracts test
pnpm --filter @pootown/game-core test
pnpm --filter @pootown/game-core lint
pnpm --filter @pootown/game-core build
pnpm exec madge --circular packages/game-core/src packages/game-contracts/src
```

- Contract negatives: unknown command, extra/oversized fields, invalid IDs/version/integer, stale `expectedStateVersion`, private-data serialization.
- Core concurrency model: duplicate request is infrastructure-owned; core still proves same initial state+command+context yields the same state/events.
- Snapshot matrix: round-trip every lifecycle/turn phase; reject corrupt checksum and future schema.

## Success Criteria

- [ ] Both packages build independently and expose one documented public entrypoint each.
- [ ] Lifecycle fixtures match Phase 1; invalid actions return stable typed errors.
- [ ] No framework, network, DB, wallet, or Solana import exists in core/contracts.
- [ ] Account coin and in-match cash cannot be assigned interchangeably at compile time.
- [ ] Snapshot/replay and strict contract tests pass.

## Risk Assessment

| Risk | Observable failure signal | Pre-decided response |
|---|---|---|
| Cleaner model changes legacy edge behavior | Characterization fixture differs | Preserve observed transition unless it violates accepted scope/security; document a needed CEO decision otherwise. |
| Decimal-string encoding leaks into UI | Components perform arithmetic on string values | Centralize mapping/selectors; keep arithmetic in core/API bigint modules. |
| Contract package becomes shared application logic | Nest/Colyseus/repository imports appear | Fail dependency test and move logic to owning app/core. |

## Rollback Notes

Packages are additive. Revert the focused package commit if public contracts cannot stabilize; Phase 1 runtime remains authoritative and unchanged.

## Security Considerations

Use allowlisted schemas and constant-safe opaque ticket/token placeholders in fixtures. Error payloads expose no stack, auth claim, RNG state, hidden deck, or internal money record.

## Next Steps

Phases 3 and 4 can begin in parallel against frozen package APIs. Unresolved questions: none.
