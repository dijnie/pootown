---
phase: 1
title: "Workspace and Behavioral Baseline"
status: pending
priority: P1
effort: "1-1.5 weeks"
dependencies: []
---

# Phase 1: Workspace and Behavioral Baseline

## Context Links

- [Plan](./plan.md) · [Accepted scope](../reports/brainstorm-260811-0246-nestjs-colyseus-monorepo.md#delivery-contract) · [Rules inventory](./research/researcher-01-rules-migration.md)
- Verified current authority: `programs/panda-monopoly/src/state/mod.rs:97-148` (game aggregate), `:391-460` (player state/default 1,500 in-match cash), `programs/panda-monopoly/src/constants.rs:12-18` (2-4 players/core constants).
- Verified gaps: `programs/panda-monopoly/src/instructions/auction.rs:14-209` is commented; `special_spaces.rs:797-855` has unimplemented/simplified Community Chest effects; Chance `MoveToNearest` executes at `special_spaces.rs:618-669`; current executed tests are listed at `research/researcher-01-rules-migration.md:182-209`.

## Overview

Make the repository a root pnpm workspace without breaking the existing Rust test authority. Capture executable behavior, screenshots, and fixtures before any rule or runtime deletion.

## Requirements

- Functional: move the existing `web/` app intact to `apps/web/`; scaffold workspace ownership for future apps/packages; characterize lifecycle, turn, board, property, card, jail, trade, bankruptcy, timeout, and terminal behavior that actually executes today.
- Non-functional: one root lockfile; reproducible Node/pnpm versions; no visual changes; no invented rule for skipped/commented paths; current Rust/Anchor harness remains runnable through the parity gate.
- Boundary: record account entry coin separately from the board's 1,500 in-match cash. Never call either a wallet balance.

## Architecture and Data Flow

`apps/web` remains byte-for-byte/behaviorally equivalent initially. Root scripts orchestrate workspace packages and temporarily retain a `legacy:characterize` command for Anchor tests. Characterization output becomes immutable fixtures consumed by `game-core`; it is not a Solana-shaped target API.

## Related Code Files

Verified existing:

- Move: `/home/dijnie/project/persional/pootown/web/` -> `/home/dijnie/project/persional/pootown/apps/web/`.
- Modify: `/home/dijnie/project/persional/pootown/package.json`, `/home/dijnie/project/persional/pootown/tsconfig.json`, `/home/dijnie/project/persional/pootown/.gitignore`.
- Preserve through Phase 7: `/home/dijnie/project/persional/pootown/programs/panda-monopoly/src/`, `/home/dijnie/project/persional/pootown/tests/`, `/home/dijnie/project/persional/pootown/Anchor.toml`, `/home/dijnie/project/persional/pootown/Cargo.toml`.
- Delete after root install succeeds: `/home/dijnie/project/persional/pootown/web/pnpm-lock.yaml` at its post-move location `apps/web/pnpm-lock.yaml`.

Planned new paths:

- Create: `/home/dijnie/project/persional/pootown/pnpm-workspace.yaml`, `/home/dijnie/project/persional/pootown/.npmrc`.
- Create: `/home/dijnie/project/persional/pootown/tests/characterization/`, `/home/dijnie/project/persional/pootown/tests/fixtures/executed-rules/`, `/home/dijnie/project/persional/pootown/tests/visual-baseline/`.
- Delete immediately after recording shape/funding/reuse evidence: tracked `/home/dijnie/project/persional/pootown/tests/utils/devnet-wallets.json`; replace it with runtime-generated ephemeral test keypairs and ignore/secret-scan coverage. History rewriting requires separate explicit approval.

## Implementation Steps

1. Record `node --version`, `pnpm --version`, current root/web/indexer build commands, and hashes of the active Rust constants/state sources. Add root `packageManager`, engines, workspace scripts, and packages `apps/*`/`packages/*`; do not include the legacy indexer as a new runtime dependency.
2. Use `git mv web apps/web`, update only path-dependent configs/import aliases/scripts, regenerate the single root lockfile, and prove pages render before changing providers.
3. Inventory public provider/hook contracts from `game-provider.tsx:41-91`, `useGameState.tsx:39-170`, and `useGames.ts:21-79`. Capture supported viewport screenshots and interaction traces for landing, lobby, board, dialogs, result, and leaderboard.
4. Run a security preflight on the six tracked devnet secret-key arrays: verify funding and any reuse without printing secrets, abandon/revoke their use, remove the tracked file, generate ephemeral keypairs at test runtime, and add secret-scan regression coverage.
5. Add executable Anchor characterization cases around only active handlers. Cover negative authorization/state paths and serialize state/event observations into named fixtures; document environmental prerequisites when an on-chain harness is unavoidable.
6. Snapshot all 40 board entries and the five Chance/five Community cards from `constants.rs:90-502` and `:617-681`. Characterize active Chance `MoveToNearest`, credit-only `CollectFromPlayers`, and the legacy position-21 Community Chest destination. Mark the approved correction to Free Parking position 20 explicitly; mark auction and unreachable/logged Community Chest effects `excluded`, not expected parity.
7. Freeze rule decisions: four-player maximum, 1,500 in-match starting cash, secure-server RNG target, deterministic seat-order winner for exact time-limit ties, and no visible actions absent from current UX.
8. Run a clean root install plus baseline lint/build/tests; archive commands and hashes in test output so later parity evidence is reproducible.

## Tests and Validation

```bash
pnpm install --frozen-lockfile
pnpm --filter ./apps/web lint
pnpm --filter ./apps/web build
pnpm legacy:characterize
git diff --summary --find-renames=90% -- web apps/web
```

- Negative cases: duplicate/full join, wrong creator/current player, illegal lifecycle, double roll, premature end turn, insufficient in-match cash, unauthorized trade, and timeout boundary.
- Move gate: record pre/post content hashes excluding path-dependent config and assert every moved UI asset/source has identical content; use the rename summary only as supporting evidence.
- Visual gate: baseline screenshots at all supported existing breakpoints; no unexplained pixel/layout delta after the move.

## Success Criteria

- [ ] Root install uses one lockfile and existing web builds from `apps/web`.
- [ ] Every currently executed rule family has a passing fixture or an explicit evidence-backed exclusion.
- [ ] Auction and absent card effects have no target command/effect.
- [ ] Existing visuals and interactions match the captured baseline.
- [ ] Rust/Anchor sources remain intact and runnable for later parity comparison.

## Risk Assessment

| Risk | Observable failure signal | Pre-decided response |
|---|---|---|
| Existing tests overstate coverage | Skipped/commented branch or fixture cannot execute | Label it unsupported; do not infer behavior; escalate only if current UI exposes it. |
| Directory move breaks resolution/deploy | Web lint/build or asset route fails | Revert only the move commit, fix workspace path assumptions, repeat baseline. |
| Anchor harness is non-deterministic | Same scenario yields different state/event output | Freeze invariant assertions instead of byte snapshots and record the environmental source. |

## Rollback Notes

Keep the move and characterization in one focused commit only after checks pass. Roll back that commit without deleting fixtures manually; no data/schema/runtime cutover occurs in this phase.

## Security Considerations

Do not print `.env` values, wallets, tokens, or keys while capturing baselines. Scan fixtures/screenshots for secrets and personal identifiers before commit.

## Next Steps

Phase 2 consumes these fixtures. No unresolved phase-specific questions.
