# Operations

## Deployment artifacts

The repository produces three independent, non-root images:

- `apps/api/Dockerfile` — NestJS API and the explicit migration command;
- `apps/game-server/Dockerfile` — the single Colyseus realtime replica;
- `apps/web/Dockerfile` — the Next.js standalone server.

`compose.deploy.yml` is a production-like rehearsal surface. It runs PostgreSQL,
the migration job, API, game server, and web in dependency order. It is not a
secret store and does not configure public TLS, DNS, WAL archiving, monitoring,
or image publication for a specific hosting provider.

```bash
pnpm images:verify
pnpm images:scan
pnpm containers:smoke
docker compose -f compose.deploy.yml config
docker compose -f compose.deploy.yml build
docker compose -f compose.deploy.yml up -d
```

The web service URLs are compiled into the Next.js image. Use HTTPS/WSS public
origins for a production build. Supply PostgreSQL credentials, a fully encoded
privileged migration DSN, separate `api_runtime` and `realtime_runtime` DSNs and
passwords, distinct access/refresh secrets, the web origin, and an ES256
internal key pair through the deployment secret manager. The one-shot role
provisioning job enables only those two least-privilege logins after migrations;
application services never receive the migration credential. Never commit a
deployment environment file.

## Release order

1. Block new session creation and verify reconciliation is clean.
2. Take an encrypted backup and record its checksum and recovery point.
3. Run the `migrate` image once, then the runtime-role provisioning job; do not
   migrate from every API replica.
4. Start API with only the `api_runtime` DSN and verify `/health/live` plus
   `/health/ready`.
5. Start exactly one game-server replica and verify both health endpoints.
6. Run a synthetic create, join, start, command, reconnect, finish, settlement,
   history, and leaderboard smoke.
7. Deploy the web image, enable admissions, and monitor joins, command latency,
   checkpoint writes, leases, settlement retries, and ledger reconciliation.

There is no legacy engine or data migration path. Rollback means disabling new
admissions and redeploying the previous off-chain images. Existing checkpoints
and ledger operations must remain intact.

## Backup and recovery

The initial service objectives are RPO 5 minutes and RTO 30 minutes. RPO is the
maximum accepted data-loss window; RTO is the target time to restore service.
Meeting them in production requires encrypted continuous WAL archiving, tested
point-in-time recovery, backup retention, and alerts owned by the hosting
environment. The repository's logical clean-cluster drill proves consistent
identity/economy/session/checkpoint restoration, but does not by itself prove
the production RPO/RTO.

For corruption recovery: stop all writers, choose an explicit recovery point,
restore PostgreSQL into an isolated cluster, run schema and row fingerprints,
start API and game server against the restored cluster, reconnect the active
room, and reconcile Account Coin before reopening admissions. Never restore an
old snapshot over a database that is still accepting writes.

## Failure response

- API unavailable: rooms retain checkpoints; settlement remains pending and is
  retried idempotently. Do not expose a client-supplied payout.
- Game server unavailable: clients reconnect to the same durable room after the
  single replica returns. Lease fencing prevents an old owner from committing.
- PostgreSQL unavailable: API readiness and room command commits fail closed.
  Do not ack commands that were not durably committed.
- `recovery_required`: keep reservations intact, inspect the latest lease,
  checkpoint, and terminal proof, then settle or explicitly abort through the
  authenticated API path. Active failure never auto-refunds.

Run `pnpm release:gates` in isolated infrastructure before a release. Run
`pnpm audit --prod`, `pnpm images:verify`, and `pnpm images:scan`. The image
verification command inventories runtime packages and rejects removed
chain/Privy dependencies. The security command generates a transient SPDX SBOM
for every image, scans with digest-pinned Trivy, writes a sanitized result under
the plan reports directory, and fails on any HIGH or CRITICAL finding. Retain
the full SBOMs in the hosting artifact store when publishing images.

The current Next.js 15 dependency tree still reports three high and two
moderate production advisories through Next.js, Sharp, and PostCSS. No patched
Next.js 15 release resolves the full set. Repository delivery may proceed, but
publishing these images to production remains blocked until a tested Next.js 16
upgrade (or an upstream patched 15.x release) clears the high advisories and the
image scanner is green. Do not use an unverified 0.x override for Sharp.
