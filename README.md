# Pootown

Pootown is a realtime multiplayer board game. The product UI is built with Next.js, the API and account-coin authority run in NestJS, Colyseus owns live rooms, and PostgreSQL stores durable identity, economy, session, checkpoint, and read-model data.

The approved rule boundary is preserved as transport-neutral fixtures and executable `game-core` tests. The repository and production artifacts contain no legacy chain runtime or toolchain.

## Architecture

```text
Next.js web + email authentication
        | HTTPS bearer API             | WSS room ticket
        v                              v
NestJS API ----------------------> Colyseus game server
        | identity, Account Coin       | canonical match state
        | sessions, settlement         | commands, events, checkpoints
        +--------------- PostgreSQL ---+
```

- `apps/web`: Next.js frontend. It consumes typed API contracts and canonical Colyseus state. It contains no wallet signing, RPC, generated Solana SDK, or client-authorized settlement.
- `apps/api`: NestJS authority for email identity, rotating login sessions, Account Coin, game definitions, admission, durable finalization, settlement, history, and leaderboard.
- `apps/game-server`: Colyseus rooms, authoritative match transitions, lease fencing, recovery, and checkpoints.
- `packages/game-contracts`: strict HTTP, room, command, event, and public-state schemas.
- `packages/game-core`: deterministic rules derived from the approved Rust source.
- `tests/fixtures/executed-rules`: self-contained parity provenance captured before the clean cutover.

Account Coin is an in-app, non-withdrawable balance owned by the API. Match cash exists only inside a game room. The two values are separate domains and must not be presented as wallet, SOL, or withdrawable funds.

## Requirements

- Node.js `24.18.x` (see `.node-version`)
- pnpm `11.13.1` (see `package.json`)
- PostgreSQL 17.6, matching the checked deployment image
- Docker for the real-PostgreSQL integration and migration tests

## Local PostgreSQL

Pootown's Docker database uses PostgreSQL 17.6 on local port `5433`, leaving the usual `5432` port available for other projects. Data is stored in the named `pootown_pootown-postgres-data` volume and is preserved by the normal shutdown command.

```bash
pnpm db:up
pnpm db:migrate
pnpm db:down
```

The checked-in password is a local-development default only. Override the `POOTOWN_POSTGRES_*` Compose variables outside Git for shared or deployed environments. Never use `docker compose down --volumes` unless intentionally deleting the local database.

## Install and verify

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

Useful focused commands:

```bash
pnpm --filter @pootown/game-contracts test
pnpm --filter @pootown/game-core test
pnpm --filter @pootown/api test
pnpm --filter @pootown/api db:migrate:test
pnpm --filter @pootown/game-server test
pnpm --filter ./apps/web test
pnpm --filter ./apps/web build
pnpm images:verify
```

## Web configuration

The tracked public web environment template defines these deployment variables:

```dotenv
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_GAME_SERVER_URL=wss://game.example.com
```

Both service URLs must be canonical origins: no credentials, extra path, query, or fragment. Never expose an auth secret, service credential, access token, or realtime ticket through a `NEXT_PUBLIC_*` variable.

The API requires distinct `AUTH_ACCESS_TOKEN_SECRET` and `AUTH_REFRESH_TOKEN_SECRET` values of at least 32 characters, plus its database, CORS, and internal-service settings. Deployment also requires separate migration, `api_runtime`, and `realtime_runtime` PostgreSQL credentials; application containers never receive the migration credential. The API and game server validate private runtime settings at startup. Their exact constraints are defined in `apps/api/src/config/api-config.ts` and `apps/game-server/src/app-config.ts`; secrets belong in the deployment secret manager, not files committed to Git.

## Run built services

After starting/migrating PostgreSQL and configuring auth secrets, internal service credentials, and allowed browser origins:

```bash
pnpm --filter @pootown/api build
pnpm --filter @pootown/api start

pnpm --filter @pootown/game-server build
pnpm --filter @pootown/game-server start

pnpm --filter ./apps/web dev
```

The API defaults to port `3001`, the game server to `2567`, and the web development server to `3000`. Production deployments should set explicit origins and health checks rather than relying on defaults.

## Container deployment

Each deployable has a pinned, multi-stage, non-root Dockerfile. The full
production-like rehearsal surface keeps migrations as an explicit one-shot job:

```bash
pnpm images:verify
pnpm containers:smoke
docker compose -f compose.deploy.yml config
docker compose -f compose.deploy.yml up --build
```

Provide all private values through the deployment secret manager. The Compose
file is a topology/rehearsal definition, not a production secret, TLS, DNS, or
backup service. See [system architecture](./docs/system-architecture.md) and
[operations](./docs/operations.md) for ownership, cutover, recovery, and the
initial RPO/RTO objectives.

## Security boundary

- Email passwords are bcrypt-hashed at cost 12. Short-lived access tokens stay in browser memory; rotating refresh tokens use an `HttpOnly`, `SameSite=Strict` cookie and only their SHA-256 hash is stored in PostgreSQL.
- Identity fields in request bodies are not trusted; authenticated user and session IDs come only from the verified access token.
- Realtime tickets are short-lived, one-use, hash-only credentials and are sent only in the Colyseus join payload.
- The API alone owns Account Coin, reservations, ledger entries, and settlement.
- The game server owns match state and writes fenced checkpoints and terminal proofs; it cannot directly mutate API-owned balances.
- Browser security headers allow only the configured API and game server endpoints.

Implementation plans and release evidence are tracked under `plans/260811-0313-nestjs-colyseus-monorepo-refactor/`.
