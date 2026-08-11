# Privy Public-Key Rotation Evidence

Date: 2026-08-11

## Outcome

The browser configuration schema and tracked web environment template no longer expose a Privy authorization private key through a public variable. The production web build succeeds without that public field. Temporary server-only signer settings remain until the legacy transaction adapter is removed in Phase 6.

## Evidence

- The current web schema and template contain no public Privy private-key field.
- A full Git-history scan found 52 tracked assignments in the template, all equal to the documented placeholder; zero non-placeholder assignments were found.
- One historical commit introduced or touched the field. No tracked deployment or Compose configuration exists in repository history.
- The workspace contains only the tracked web environment template; no local web value file was present during the audit.
- The API config explicitly rejects the browser field, with a regression test.

No repository or local-workspace evidence shows that a real key was populated, so no repository-side rotation action is indicated. External Privy dashboard and deployment secret history are outside this workspace; release operations must confirm the same conclusion or rotate the key before production if an external value ever existed.

## Verification

- `pnpm --filter @pootown/game-contracts test`
- `pnpm --filter @pootown/game-contracts lint`
- `pnpm --filter ./apps/web test`
- scoped web ESLint and full TypeScript check
- production web build with process-local synthetic public configuration and no public private-key variable

## Unresolved Questions

- Has any external deployment platform ever populated this field with a real authorization key? If yes, rotate it in Privy and the deployment secret store before release.
