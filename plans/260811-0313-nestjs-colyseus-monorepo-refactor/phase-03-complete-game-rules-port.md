---
phase: 3
title: "Complete Executed Game Rules Port"
status: in-progress
priority: P1
effort: "2-2.5 weeks"
dependencies: [2]
---

# Phase 3: Complete Executed Game Rules Port

## Context Links

- [Core foundation](./phase-02-shared-contracts-and-core-lifecycle.md) · [Rule inventory and slices](./research/researcher-01-rules-migration.md#10-recommended-vertical-slice-port)
- Evidence: board/property helpers `programs/panda-monopoly/src/state/mod.rs:190-338`; turn advance `:340-388`; property/rent `utils.rs:310-379`; timeouts `instructions/permissionless.rs:36-245`; events `state/events.rs:5-271`.
- Explicit exclusions: auction is commented (`instructions/auction.rs:14-209`); only five cards/deck exist (`constants.rs:617-681`). Chance `MoveToNearest` is active at `special_spaces.rs:618-669`; only the unreachable Community Chest branch logs it as unimplemented at `:796-799`.

## Overview

Port every currently executed rule into pure `game-core`, prove parity against Phase 1 fixtures, and resolve unsafe panic/duplication through typed invariants without adding product behavior.

## Requirements

- Functional: dice/movement/doubles; landing resolution; purchase/decline/rent; mortgage/build/sell only where current UI executes them; five-card decks/simplified effects; jail; trades; bankruptcy; timeout/forfeit; terminal ranking/reward entitlement.
- Policy: 90-second turns with warnings at 30/10 remaining; timer continues during 120-second reconnect; three missed turns forfeit; exact time-limit score tie resolves by stable seat order.
- Non-functional: checked integer arithmetic, deterministic tests, secure RNG supplied externally, terminal state immutable, no auction command, no unimplemented effect, no client-trusted price/dice/winner.
- Economy: all board transfers use in-match `cash`; core only emits settlement entitlement based on immutable entry policy and never mutates account coin.

## Architecture and Data Flow

Commands pass centralized actor/lifecycle/turn/phase guards, produce one atomic state transition plus immutable domain events, and increment one revision. Internal timer/RNG commands use the same transition path as player commands. Immutable ruleset data is versioned separately from mutable snapshots.

## Related Code Files

Planned create/modify:

- Modify: `/home/dijnie/project/persional/pootown/packages/game-core/src/model/`, `src/rules/`, `src/commands/`, `src/events/`, `src/serialization/`, `src/index.ts`.
- Create: `/home/dijnie/project/persional/pootown/packages/game-core/src/rules/board-definition.ts`, `card-decks.ts`, `movement.ts`, `property-rules.ts`, `trade-rules.ts`, `jail-rules.ts`, `bankruptcy-rules.ts`, `timeout-rules.ts`, `terminal-rules.ts`.
- Create: `/home/dijnie/project/persional/pootown/packages/game-core/test/{movement,property,cards,jail,trades,bankruptcy,timeout,terminal,invariants}.test.ts` and `test/parity/`.
- Modify: `/home/dijnie/project/persional/pootown/packages/game-contracts/src/realtime/`, `src/state/`, `src/errors.ts` only for frozen executed command/event additions.

Verified reference only:

- `/home/dijnie/project/persional/pootown/programs/panda-monopoly/src/` and `/home/dijnie/project/persional/pootown/tests/`.

## Implementation Steps

1. Port immutable 40-space board and five-card decks against Rust fixtures. Include active Chance `MoveToNearest`. Apply the approved correction so the “Free Parking” Community Chest card moves to position 20 and align its copy; retain the legacy position-21 fixture as documented divergence evidence. Mark only unreachable/unsupported effects as excluded contract values, not no-ops.
2. Implement movement/doubles/GO/landing and explicit turn phases. Replace `advance_turn().unwrap()` behavior at `utils.rs:197-222` with typed invariant failure.
3. Implement property purchase/decline/rent/build/sell constraints that current UI executes, bank stock 32 houses/12 hotels, monopoly/even-building rules, railroads/utilities, and insufficient-cash paths. Preserve mortgage fields only where fixtures require them; do not add mortgage/unmortgage commands without a proven reachable UI action. Derive all prices/owners/dice server-side.
4. Implement only executed card/tax/free-parking/go-to-jail effects and current simplified repair costs. Follow-up landing resolution runs atomically.
5. Implement jail, trade state transitions/expiry, ownership/cash validation, bankruptcy asset resolution, eliminated-seat skipping, and terminal winner once.
6. Implement internal warning/timeout commands based on absolute deadline. A timer command and late player command compete on `expectedStateVersion`; only one can succeed. Third missed turn forfeits.
7. Implement time-limit ranking from characterized net-worth rules; exact ties select earliest active stable seat. Add explicit end reason/event.
8. Emit payout entitlement only; never an amount accepted from realtime/client. Keep account coin reservation/capture outside core.
9. Run every Phase 1 parity fixture. Any difference must be categorized as bug, approved behavior correction, or unsupported behavior before merge; the position-20 Free Parking correction is the sole pre-approved rules divergence.

## Tests and Validation

```bash
pnpm --filter @pootown/game-core test
pnpm --filter @pootown/game-core test:parity
pnpm --filter @pootown/game-contracts test
pnpm --filter @pootown/game-core build
```

- Property-based invariants: conserved in-match cash except defined bank effects, including the characterized credit-only `CollectFromPlayers` bank inflow; non-negative inventories; one owner/property; no action after terminal.
- Negative matrix: wrong actor/phase, stale revision, forged price/dice/winner, insufficient cash, invalid trade/property, double timeout, excluded command.
- Determinism: identical snapshot/commands/RNG inputs produce identical states/events; exact tie always selects lower seat.

## Success Criteria

- [ ] All Phase 1 executed-rule fixtures pass against pure core.
- [ ] Full negative/invariant/determinism suite passes without framework or network.
- [ ] Auction returns `COMMAND_UNSUPPORTED`; missing effects are neither exposed nor invented.
- [ ] Room policy rules and deterministic tie behavior are explicit and tested.
- [ ] Account coin never appears in core board-money operations.

## Risk Assessment

| Risk | Observable failure signal | Pre-decided response |
|---|---|---|
| Partial Rust behavior blocks parity | Handler logs/no-ops or lacks executable test | Preserve only observable effect, mark remainder excluded, do not complete it speculatively. |
| Derived state refactor drifts | Fixture or invariant fails | Retain duplicated field behind one mutation function until a later evidence-backed simplification. |
| Full command checkpoints may expose huge state | Serialized fixture exceeds agreed message/storage bound | Optimize representation, not durability model; replan only if Phase 7 DB measurements fail. |

## Rollback Notes

Rules are package-local and additive. Revert the failing rule slice commit while keeping prior passing slices; never delete Rust authority before Phase 8.

## Security Considerations

Validate actor from server context and all payloads through strict schemas. Production RNG must use platform cryptographic randomness; test seed controls must not be exported by production entrypoints.

## Next Steps

Phase 5 integrates the complete core. Unresolved questions: none.
