---
phase: 8
title: "Clean Removal Deployment and Docs"
status: pending
priority: P1
effort: "1-1.5 weeks"
dependencies: [7]
---

# Phase 8: Clean Removal Deployment and Docs

## Context Links

- [Release gates](./phase-07-reliability-security-and-load-gates.md) · [Accepted clean cutover](../reports/brainstorm-260811-0246-nestjs-colyseus-monorepo.md#delivery-contract)
- Current legacy surfaces: root `Anchor.toml`, `Cargo.toml`, `programs/`, `tests/`; browser `apps/web/lib/sdk/` and `lib/tx/`; blockchain `indexer/`; scripts `build-local.sh`, `run.sh`, `start-validator.sh`, `migrations/deploy.ts`.
- README currently declares Solana/Anchor/Magic Block/indexer architecture at `README.md:21-33,44-109`; update only after runtime truth changes.

## Overview

After parity/recovery/security/load evidence is green, remove every legacy chain runtime/build/test/generated/config/script surface, deploy the three independent apps, perform one clean cutover, and update the smallest authoritative documentation.

## Requirements

- No legacy records migrate. No production cohort, canary engine, dual write, dual read, drain, or compatibility facade. Test/staging rehearsal is allowed; production cutover is a single scheduled switch.
- Web, API, and one-replica game-server deploy independently with readiness, migrations, backup, and rollback/roll-forward runbooks.
- Remove Solana, Anchor, Rust program, Magic Block/ER, indexer, generated SDK, wallet-signing, chain env/config/dependencies/lockfiles/scripts only after Phase 7 passes.
- Keep only docs that match the delivered system, current commands, security posture, room policy, and recovery operations.

## Architecture and Cutover Flow

Preflight gates/backup -> remove legacy repository artifacts while retaining transport-neutral parity fixtures -> build/scan/test final clean images -> deploy API and migrate additive schemas -> deploy one dark game-server -> smoke synthetic lifecycle/recovery/settlement -> deploy new web and enable new session creation in one maintenance window -> verify live health/reconciliation -> retire old services from deployment inventory. Rollback normally means disable admissions and redeploy a prior new-system image; database recovery requires a separate corruption procedure with writes stopped, WAL/PITR to an explicit recovery point, and post-recovery reconciliation.

## Related Code Files

Verified existing to delete after gates:

- `/home/dijnie/project/persional/pootown/programs/`, `/home/dijnie/project/persional/pootown/Anchor.toml`, `Cargo.toml`, `Cargo.lock`, `migrations/deploy.ts`.
- Legacy-only tests: `/home/dijnie/project/persional/pootown/tests/end-turn.test.ts`, `hello.test.ts`, `initialize-game.test.ts`, `join-game.test.ts`, `move-player.test.ts`, `panda-monopoly.ts`, `pay-jail-fine.test.ts`, `platform.test.ts`, `roll-dice.test.ts`, `start-game.test.ts`, Anchor characterization runner, and Solana-only `tests/utils/`. Before deletion, move transport-neutral expected fixtures plus provenance/hashes to `packages/game-core/test/parity/` and prove its parity suite has no Rust/Anchor invocation. Preserve Phase 7 `tests/contracts`, `tests/e2e`, `tests/reliability`, `tests/load`, and `tests/security`.
- `/home/dijnie/project/persional/pootown/indexer/` including its nested lockfile.
- `/home/dijnie/project/persional/pootown/build-local.sh`, `run.sh`, `start-validator.sh`, root Solana-only generated/type/config artifacts proven unused.
- Remaining `/home/dijnie/project/persional/pootown/apps/web/lib/sdk/`, `apps/web/lib/tx/`, `apps/web/codama.mjs`, and chain-only configs/assets/dependencies proven unused by Phase 6 scan.

Verified existing to modify:

- `/home/dijnie/project/persional/pootown/package.json`, `pnpm-lock.yaml`, `.gitignore`, `README.md`, `/home/dijnie/project/persional/pootown/apps/web/package.json`, `apps/web/README.md`.
- Existing deployment/CI files discovered with `rg --files -g 'Dockerfile*' -g '*compose*' -g '.github/**'` at implementation time; do not invent absent files.

Planned new paths if the repository has no owning deployment surface:

- Create: `/home/dijnie/project/persional/pootown/apps/api/Dockerfile`, `/home/dijnie/project/persional/pootown/apps/game-server/Dockerfile`, `/home/dijnie/project/persional/pootown/apps/web/Dockerfile`, `/home/dijnie/project/persional/pootown/compose.yaml`.
- Create only if no existing doc owns them: `/home/dijnie/project/persional/pootown/docs/system-architecture.md`, `/home/dijnie/project/persional/pootown/docs/operations.md`.

## Implementation Steps

1. Verify Phase 7 report, approved launch economy/load configuration, fresh backup/restore evidence, migration checksum, images, secrets, DNS/TLS/WSS, CORS, service auth, and single-replica setting. Stop if any gate is incomplete.
2. Build minimal multi-stage images with non-root users, health probes, pinned Node/pnpm, graceful termination, and independent configuration. API runs migrations as an explicit one-shot step, not from every replica startup.
3. Rehearse the exact production switch in staging from empty new schemas; synthetic users only, no legacy data import. Verify create/play/reconnect/settle/history and corruption-safe WAL/PITR recovery.
4. Run exhaustive tracked-source searches plus dependency/bundle/container scans. Delete every verified legacy runtime/generated/config/script/test/dependency, retain the transport-neutral parity corpus, and regenerate the root lockfile. Do not retain aliases or Solana-shaped DTOs.
5. Update README and smallest owning architecture/operations docs with workspace commands, app ownership, account coin vs in-match cash, room policy, security, backup/restore, RPO/RTO, failure response, and explicit deferred scaling criteria.
6. Re-run the full Phase 7 gate from a clean checkout and final images after deletion. Confirm three deployables build without Rust/Solana/Redis/indexer toolchains; publish only these clean artifacts.
7. In the scheduled production window, prevent session creation, back up, migrate/deploy API, deploy game-server dark, smoke internal path, deploy web, then enable new session creation. There is no legacy traffic path.
8. Monitor health, auth, joins, commands/checkpoints, lease, settlements, ledger reconciliation, and errors through the defined observation window. On failure, disable new sessions and redeploy a prior new-system image. Restore the database only under the documented corruption/PITR procedure; never blindly restore a pre-cutover snapshot after live writes.

## Tests and Validation

```bash
pnpm install --frozen-lockfile
pnpm quality
pnpm test:e2e
pnpm test:restore
pnpm test:load -- --players=200 --rooms=50 --duration=30m
git grep -n -i -E "solana|anchor|magic.?block|ephemeral rollup|indexer|codama|signTransaction|PDA" -- ':!plans/**' ':!README.md'
git ls-files | rg '(^programs/|^indexer/|Anchor\.toml|Cargo\.(toml|lock)|lib/sdk|lib/tx)'
```

Every search match must be removed or documented as non-runtime historical text. Then run image SBOM/dependency scan and live synthetic smoke against deployed endpoints.

## Success Criteria

- [ ] Clean checkout installs/tests/builds three deployables with one root lockfile and no legacy toolchain.
- [ ] Production uses first-party email auth/API/Colyseus/PostgreSQL only; no Privy/chain/indexer/generated SDK/signing runtime or public private key remains.
- [ ] No legacy record migration, production dual engine, compatibility alias, auction, Redis, queue, event sourcing, spectator, or admin scope was added.
- [ ] Clean-cutover smoke, reconciliation, restart, restore, and confirmed load gates pass.
- [ ] README/operations/architecture claims and commands match actual deployment.

## Risk Assessment

| Risk | Observable failure signal | Pre-decided response |
|---|---|---|
| Legacy deletion hides a dependency | Clean build/runtime scan fails | Restore only the required implementation behavior in the new owner; never restore chain facade. |
| Cutover settlement/recovery fails | Reconciliation mismatch or `recovery_required` alert | Disable new sessions; preserve checkpoints/ledger; roll forward or restore new DB as runbook specifies. |
| Docs/deploy drift | Command or health probe fails from clean checkout | Block completion, correct smallest owning surface, repeat smoke. |

## Rollback Notes

Repository deletions are recoverable from Git. Production has no old-engine fallback: disable new admissions, keep active state/ledger immutable, and redeploy prior new-system images. Database restore is allowed only for diagnosed corruption with writes stopped, WAL/PITR to an explicit recovery point, declared RPO/RTO, and reconciliation before reopening.

## Security Considerations

Rotate any formerly exposed Privy key only if deployment/config history proves it was populated. Revoke legacy chain/indexer credentials, remove old endpoints/firewall rules, verify least-privilege DB roles, scan images/repo, and retain encrypted backups per approved retention.

## Unresolved Questions

None after the two plan-level economy/load decisions are approved; otherwise Phase 8 remains blocked.
