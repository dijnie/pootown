# Phase 1 baseline evidence

Date: 2026-08-11

## Reproducible toolchain

- Node: `v24.18.0`
- pnpm: `11.13.1`
- Root workspace: `apps/*`, `packages/*`
- Root lockfile: `pnpm-lock.yaml`; the moved web lockfile was removed.
- pnpm 11 build-script policy is an explicit `allowBuilds` map in
  `pnpm-workspace.yaml`; no wildcard build-script permission is enabled.
- The plan's proposed root `.npmrc` was not retained: pnpm 11 reads non-registry
  project settings from `pnpm-workspace.yaml`, which is the authoritative surface.

## Source authority

- `programs/panda-monopoly/src/constants.rs` SHA-256:
  `54ae0ff2cf2fed8ae22fabd8e6b2cbe7860f3586636fcf7464315f2eec424d45`
- `programs/panda-monopoly/src/state/mod.rs` SHA-256:
  `e3711de364fdb3282e29b8fe3bfb626bd138e70fbcdb63fa78a6b35cfbb3ce2a`
- `pnpm legacy:characterize`: 9 passing. The command builds with Anchor 0.31.1
  image digest `sha256:21ab8a16e19df4301a198d7a55ab2988549aa2d996e6b5ad229c1d95b9f2d326`, starts an owned local validator,
  genesis-loads the program at its declared address together with MagicBlock
  CLI `0.13.20` program/account fixtures, runs the TypeScript observations, and
  cleans up its validator and ephemeral wallet.
- All tracked web files other than the intentionally modified package manifest
  and deleted nested lockfile have identical pre/post-move content hashes.

## Security preflight

The deleted tracked devnet file contained six valid keypairs. The audit derived
only their public identities in memory and printed no key or address:

- unique keypairs: 6 of 6 (no reuse inside the tracked file)
- funded on devnet at audit time: 5
- aggregate lamports at audit time: 374,358,276

The file and its generator were removed. Legacy tests now reject devnet mode and
generate fresh keypairs funded by a local validator at runtime. History rewriting
was not performed because it requires separate explicit approval.

## Web evidence

- Production build: passed with process-local synthetic public configuration;
  no environment file or secret was read.
- Visual baseline: five valid checksummed desktop/mobile artifacts are recorded in
  `tests/visual-baseline/manifest.json`.
- Provider/hook public surface: frozen in
  `tests/fixtures/executed-rules/ui-contracts.json`.
- ESLint baseline: 65 errors and 123 warnings in the unchanged legacy source.
  Most errors are in generated chain SDK code and chain-coupled providers/hooks
  scheduled for removal in Phase 6/8. This is an explicit failing baseline, not
  a green gate; final quality cannot pass until the cutover removes or repairs
  every finding.

Reproduction uses a 25-character, non-production Privy-format identifier and
non-routable endpoints only for static build validation:

```bash
env NEXT_PUBLIC_PRIVY_APP_ID=clp0000000000000000000000 \
  NEXT_PUBLIC_MAINNET_RPC_URL=https://example.invalid/rpc \
  NEXT_PUBLIC_DEVNET_RPC_URL=https://example.invalid/rpc \
  NEXT_PUBLIC_RPC_URL=https://example.invalid/rpc \
  NEXT_PUBLIC_RPC_SUBSCRIPTIONS_URL=wss://example.invalid/rpc \
  NEXT_PUBLIC_ER_RPC_URL=https://example.invalid/er \
  NEXT_PUBLIC_ER_RPC_SUBSCRIPTIONS_URL=wss://example.invalid/er \
  NEXT_PUBLIC_AUTH_ID_PRIVY=baseline-auth-id \
  NEXT_PUBLIC_AUTH_PRIVATE_KEY_PRIVY=baseline-not-a-key \
  pnpm --filter ./apps/web build
```

This proves compilation, type checking, and prerendering only. It is not provider
or authentication readiness evidence.

## Environmental limitations

- Board and authenticated dialogs were not captured because no real Privy
  application, token, or funded game identity was supplied. This keeps the Phase
  1 visual gate incomplete; Phase 7 also owns final authenticated interaction E2E.
- Pre-start lifecycle/seating now has executable local Anchor evidence. With the
  current MagicBlock delegation program loaded, a minimum-seat `startGame`
  simulation logs successful delegation and the start event, then hits an SBF
  input-section access violation; the transaction rolls back and every account
  remains program-owned in `WaitingForPlayers`. The declared program address is
  closed on devnet and absent on mainnet, so there is no deployed binary that
  can supersede this source-built observation.
- Turn, property, card, jail, trade, bankruptcy, timeout, and completed-game
  handlers therefore still lack a successfully committed lifecycle path and
  remain labeled `source-evidenced`; the Phase 1 behavior gate is incomplete.
