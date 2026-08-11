# Phase 2 shared contracts and core lifecycle report

Date: 2026-08-11

## Delivered

- `@pootown/game-contracts` exposes one framework-neutral entrypoint with strict
  Zod schemas for HTTP DTOs, room commands/messages, public state, per-player
  private views, errors, pagination, IDs, timestamps, and decimal money strings.
- `@pootown/game-core` exposes one pure entrypoint with create, join, leave,
  cancel, and start transitions; stable seats; typed errors/events; explicit
  clock/RNG ports; full snapshots; checksums; and deterministic replay.
- Both packages enforce restricted-import boundaries with ESLint and executable
  dependency tests. Core has no runtime dependency; contracts depends only on
  Zod.

## Authority mapping

- Creator begins in seat 0 with 1,500 in-match cash. Bank cash is 1,000,000;
  house/hotel inventory is 32/12; capacity is configurable from two to four.
- Join indexes/totals, duplicate/full rejection, creator start/cancel authority,
  minimum-player start, and cancellation event shape consume the Phase 1 fixture.
- The successful target start transition follows the frozen Rust source and the
  approved evidence waiver. It does not reproduce the characterized MagicBlock
  access violation or rolled-back transaction.
- Cancellation retains a terminal audit snapshot. Legacy account closure is a
  storage concern; account-coin refund/reservation behavior belongs to the API.
- A vacated waiting-room slot is reusable without shifting other occupied seat
  indexes. Elimination never removes a seat.

## Safety boundaries

- Every accepted transition increments `stateVersion` exactly once; stale,
  exhausted, invalid-time, authorization, state, and RNG-continuation failures
  return stable errors and retain the original state object/version.
- Browser-visible state cannot contain auth tokens, tickets, hidden RNG state,
  or another private payload. Internal snapshots retain a bounded opaque RNG
  continuation and verify source compatibility before each transition.
- Snapshot parsing and serialization fail closed on unknown/extra fields,
  unsupported schema versions, invalid decimal integers, illegal lifecycle or
  seat state, corrupt checksum, revision mismatch, and inconsistent timestamps.
- Account fields are `availableCoin`/`reservedCoin`; match fields are
  `cash`/`bankCash`. Their branded transport types are not assignable.
- The portable FNV-1a checksum detects accidental snapshot corruption. It is not
  an authentication mechanism; database authorization/integrity remains owned
  by the later service phases.

## Verification

```text
pnpm install --frozen-lockfile                                      PASS
pnpm --filter @pootown/game-contracts lint                         PASS
pnpm --filter @pootown/game-contracts test                         PASS (6)
pnpm --filter @pootown/game-contracts build                        PASS
pnpm --filter @pootown/game-core lint                              PASS
pnpm --filter @pootown/game-core test                              PASS (14)
pnpm --filter @pootown/game-core build                             PASS
pnpm exec madge --extensions ts --circular packages/game-core/src packages/game-contracts/src
                                                                  PASS (20 files, no cycles)
git diff --check                                                  PASS
```

The lockfile preserves the previously resolved web/Solana dependency versions;
new lint tooling uses the mature parser release `8.65.0` without adding a
minimum-release-age exception. Generated build/test output is ignored.

## Review

Independent review completed after two fix cycles. Snapshot invariants, version
overflow, account coin contracts, RNG resume/checkpoint handling, backwards
clock rejection, strict public active-state validation, and fixture-value
mapping were corrected. Final review found no blockers.

## Unresolved questions

None.
