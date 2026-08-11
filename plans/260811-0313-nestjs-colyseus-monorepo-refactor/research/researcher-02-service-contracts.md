---
title: NestJS and Colyseus service contracts
status: complete
researched_at: 2026-08-11T03:14:00Z
scope: approved split architecture
---

# Research Report: API and Realtime Service Contracts

> Superseded constraints (2026-08-11): the accepted brainstorm and implementation plan override exploratory recommendations below. Do not implement wallet binding, spectators, auction commands, eight-player rooms, production cohorts/dual reads, legacy drain, or legacy fallback. The accepted target is Privy user identity, player-only tickets, max four players, staging rehearsal, and one clean production cutover. Initial service-to-service communication uses authenticated internal HTTP rather than direct access to API-owned database procedures.

## Executive summary

Recommendation: ship three deployables—unchanged-visual Next.js, NestJS API, and one-replica Colyseus realtime—with one PostgreSQL cluster and no new Redis/queue. NestJS owns identity, wallet/coin accounting, game catalogue/lifecycle, matchmaking, tickets, leaderboard/read APIs, schema migrations, and administrative actions. Colyseus owns live room rules, turn clocks, deterministic randomness state, command validation, state patches, and durable room checkpoints. The browser never decides balances, outcomes, or authorization.

The correctness boundary is PostgreSQL. A paid join reserves coins in a NestJS transaction. A short-lived, one-use room ticket binds Privy user, wallet, game, room, reservation, and role. Colyseus atomically consumes that ticket, accepts commands only for the bound player, and durably writes each accepted state version before acknowledging it. Game completion moves the API-controlled reservation to captured/settled; pre-start cancellation releases it. Every money-changing operation has a database uniqueness constraint on its idempotency key.

This is intentionally a first-delivery design. One realtime replica avoids distributed room discovery and split-brain complexity. PostgreSQL-backed room leases and checkpoints provide recovery. Add Colyseus distributed presence/Redis only after measured concurrent-room demand requires multiple realtime replicas.

## Contents

1. [Verified starting point](#verified-starting-point)
2. [Ownership and trust boundaries](#ownership-and-trust-boundaries)
3. [Authentication and room-ticket flow](#authentication-and-room-ticket-flow)
4. [Coin lifecycle and idempotency](#coin-lifecycle-and-idempotency)
5. [Database ownership](#database-ownership)
6. [Checkpoint and recovery](#checkpoint-and-recovery)
7. [Contract inventory](#contract-inventory)
8. [Failure modes and gates](#failure-modes-and-gates)
9. [Deployment and cutover](#deployment-and-cutover)
10. [CEO decisions](#ceo-decisions)

## Research method

- Repository evidence: current frontend providers/services, indexer bootstrap/routes/schema, package manifests, and approved brainstorm report.
- External sources: current official NestJS, Colyseus, Privy, and PostgreSQL documentation only.
- Evaluation: correctness under retries/crashes, security boundary, operational simplicity, reversibility, and first-delivery cost.
- Non-goals: visual redesign, blockchain-program redesign, multi-region active-active, Redis/queue introduction, and speculative microservices.

## Verified starting point

- The documented system is currently Next.js + Privy, a Fastify/BullMQ indexer, PostgreSQL/Redis, and Solana/MagicBlock; realtime is described as frontend WebSocket updates through the indexer ([README.md:44](../../../README.md), [README.md:97](../../../README.md)).
- The frontend is Next 15/React 19 and already includes both Privy browser and server-auth packages ([web/package.json:14](../../../web/package.json), [web/package.json:45](../../../web/package.json)). `useWallet` derives a Solana embedded wallet from Privy linked accounts ([web/hooks/use-wallet.ts:12](../../../web/hooks/use-wallet.ts)).
- Current gameplay is browser-authoritative at the transaction edge: `GameProvider` imports the Solana SDK and Privy transaction sender, then sends many game actions directly ([web/components/providers/game-provider.tsx:3](../../../web/components/providers/game-provider.tsx), [web/components/providers/game-provider.tsx:304](../../../web/components/providers/game-provider.tsx)). The refactor must replace provider internals while preserving its UI-facing context shape.
- Frontend events/logs are local providers layered under the same app provider tree ([web/components/providers/app-provider.tsx:8](../../../web/components/providers/app-provider.tsx)); game events register many chain event handlers ([web/components/providers/game-events-provider.tsx:148](../../../web/components/providers/game-events-provider.tsx)). These become Colyseus state/message adapters, not visual component rewrites.
- The generic API client supports GET only and validates responses with Zod ([web/services/api-client.ts:30](../../../web/services/api-client.ts)). Existing leaderboard calls target `/api/leaderboard` and already validate their envelopes ([web/services/leaderboard.ts:82](../../../web/services/leaderboard.ts)). Preserve this response envelope during the cutover or version it explicitly.
- The current indexer advertises game/player/property/trade/log APIs, but only leaderboard, health, RPC status, and metrics are actually registered; game-domain routes are commented out ([indexer/src/server/routes/index.ts:18](../../../indexer/src/server/routes/index.ts), [indexer/src/server/routes/index.ts:32](../../../indexer/src/server/routes/index.ts)). Do not treat advertised routes as a compatibility contract without endpoint tests.
- Existing PostgreSQL tables are blockchain mirrors. `game_states` includes entry fee, prize pool, winner, properties and trades ([indexer/src/infra/db/schema.ts:143](../../../indexer/src/infra/db/schema.ts)); `player_states` includes wallet and game cash state ([indexer/src/infra/db/schema.ts:225](../../../indexer/src/infra/db/schema.ts)); sync recovery tracks last slot/signature ([indexer/src/infra/db/schema.ts:331](../../../indexer/src/infra/db/schema.ts)). Preserve these as legacy/indexed data until reconciliation proves the new model complete.
- Security blocker: `NEXT_PUBLIC_AUTH_PRIVATE_KEY_PRIVY` is currently validated and read as a public browser variable ([web/configs/env.ts:14](../../../web/configs/env.ts), [web/configs/env.ts:38](../../../web/configs/env.ts)). Remove it from all `NEXT_PUBLIC_*` configuration and rotate the real key if it was ever populated/deployed.

## Ownership and trust boundaries

| Capability | NestJS API | Colyseus realtime | Next.js |
|---|---|---|---|
| Privy verification and user/wallet binding | Authoritative | Trust only consumed API ticket | Obtain access token; display identity |
| Coin available/reserved balance and ledger | Sole writer | No direct balance mutation | Read/display only |
| Game catalogue, fee, capacity, status | Authoritative lifecycle record | Reads immutable session config in ticket/bootstrap | Browse/display |
| Match/join admission | Reserve coins, allocate room, issue ticket | Consume ticket, enforce seat/wallet uniqueness | Request join, connect |
| Rules, turns, dice/RNG, trades, board state | Read models/admin only | Authoritative while session active | Send intent; render patches |
| Durable live state | Owns schema/migrations | Writes only owned room tables/procedures | None |
| Settlement/refund | Authoritative transactional service | Requests/finalizes via narrow internal API | Observe result |
| Leaderboard/history | Query/read model | Emits durable completion facts | Existing Zod-validated UI |
| Solana/indexing during transition | Separate legacy/indexer concern | Never signs user transactions | No direct gameplay transaction after cutover |

Rules:

1. Browser messages are intent, never facts. Ignore client-supplied wallet, price, balance, dice, turn, or winner.
2. Realtime may call only narrow API/internal procedures for ticket consumption and settlement. It must not import API application services or share mutable domain code.
3. Share a small contracts package: versioned DTO schemas, enums, error codes, and message names. Do not share repositories or Nest/Colyseus framework classes.
4. API owns all migrations. Database roles restrict `api_runtime` and `realtime_runtime` to their tables/procedures.

## Authentication and room-ticket flow

Privy says access tokens should be sent to the backend and verified there; the server must validate signature, expiry, issuer and audience, and tokens must not be logged or placed in URLs ([Privy tokens](https://docs.privy.io/authentication/user-authentication/tokens), [Privy access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens)). Nest guards are the correct HTTP boundary for bearer authentication ([NestJS authentication](https://docs.nestjs.com/security/authentication)).

### Exact flow

1. Browser logs in through existing Privy provider, calls `getAccessToken()`, then `POST /v1/game-sessions/{sessionId}/join-intents` with `Authorization: Bearer ...` and `Idempotency-Key` header.
2. Global Nest `PrivyAuthGuard` verifies the access token with server-only Privy credentials/verification key. It sets `{privyUserId, sessionId}` on request context. API loads the user from Privy/server cache and selects the linked Solana wallet using the same product rule as current `useWallet` (embedded Solana wallet). Never accept a wallet address from the body as identity.
3. In one PostgreSQL transaction, API locks the user coin account, checks session capacity/status, creates or reuses the join intent, reserves entry coins, assigns `roomId`, and inserts a random 256-bit ticket **hash** with `expires_at = now + 60s`. Plain ticket is returned once with `wsUrl`, `roomName`, `roomId`, `expiresAt`, and contract version.
4. Browser connects with Colyseus client options `{ticket}` over TLS. Ticket never appears in URL logs; send it in the Colyseus join payload.
5. `Room.onAuth` calls one database function/internal API that atomically marks the hash consumed only when unconsumed, unexpired, correct room/session, and reservation still `reserved`. It returns trusted claims `{userId, wallet, playerId, reservationId, role}`. Colyseus room auth is the admission hook; room state/messages remain server-authoritative ([Colyseus Room](https://docs.colyseus.io/server/room)).
6. `onJoin` rejects a second active client for the same `playerId` unless it presents an explicit reconnect token. A reconnect may replace the stale client but cannot create a second player seat.
7. Spectators use a different ticket with `role=spectator`, no reservation, and no command permission.

Ticket row fields: `id`, `token_hash`, `privy_user_id`, `wallet_address`, `game_session_id`, `room_id`, `reservation_id nullable`, `role`, `expires_at`, `consumed_at`, `consumed_by_room_instance`, `created_at`. Unique: `token_hash`; partial/transactional invariant: only one active paid join intent per `(game_session_id,user_id)`.

HTTP error contract: `401 AUTH_TOKEN_INVALID|AUTH_TOKEN_EXPIRED`; `403 WALLET_NOT_LINKED|ROOM_FORBIDDEN`; `409 SESSION_FULL|ALREADY_JOINED|IDEMPOTENCY_CONFLICT`; `422 INSUFFICIENT_COINS`; `503 REALTIME_UNAVAILABLE`. Error envelope: `{error:{code,message,requestId,details?}}`; details must not leak token/ledger internals.

## Coin lifecycle and idempotency

### State machine

```text
available balance
      |
      | join-intent transaction
      v
reservation: reserved ---------------------> captured
      |                 game settled            |
      | cancelled / expiry / abort-before-start | immutable settlement entries
      +---------------------> released ----------+

reserved -> captured | released only
captured/released are terminal
```

Use integer minor units (`bigint`), never floating point. Reservation mutations execute in a DB transaction with the account row locked (`SELECT ... FOR UPDATE`) and a unique idempotency key. PostgreSQL documents that row locks block competing writers/lockers until transaction end; `INSERT ... ON CONFLICT` provides a deterministic insert/update outcome under Read Committed ([explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html), [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)). Unique/check/foreign-key constraints enforce invariants independently of application retries ([constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)).

### Required invariants

- `coin_accounts.available >= 0`, `coin_accounts.reserved >= 0`.
- Ledger is append-only; every mutation has balanced entries and one `operation_id`.
- `coin_operations.idempotency_key` unique per authenticated user and endpoint purpose. Store request hash and response snapshot. Same key+same hash returns prior result; same key+different hash returns `409 IDEMPOTENCY_CONFLICT`.
- One entry reservation per `(game_session_id,user_id)`. Capture/release uses reservation ID as its idempotency key.
- Game settlement has unique `(game_session_id, settlement_kind)`. Winner credit and all captures occur in one transaction. Retrying returns the committed settlement.
- Realtime cannot choose payout amounts. API computes from immutable session fee/payout policy and validates the durable terminal checkpoint/winner proof.
- Ticket expiry does **not** immediately release a reservation if a room connection may be in flight. A periodic API task releases `reserved` joins only when ticket expired, not consumed, no active seat, and grace period elapsed. A PostgreSQL query/cron inside API is sufficient; no queue required.

### Session/financial states

`game_sessions`: `open -> starting -> active -> settling -> settled`; cancellation paths `open|starting -> cancelling -> cancelled`, failure path `active -> recovery_required` (not automatic refund). Entry reservations capture on successful terminal settlement. Cancellation before game start releases all. For an active-game crash, recover gameplay first; refund only through an explicit, idempotent abort decision. This prevents both winner payout and refund.

## Database ownership

One cluster and migration history, separate schemas/roles:

| Owner | Tables | Writer |
|---|---|---|
| `identity` | `users`, `user_wallets` | API only |
| `economy` | `coin_accounts`, `coin_operations`, `coin_ledger_entries`, `coin_reservations`, `game_settlements` | API only |
| `game` | `game_definitions`, `game_sessions`, `session_players`, `join_intents`, `realtime_tickets` | API; realtime only ticket-consume/seat-heartbeat procedures |
| `realtime` | `room_instances`, `room_leases`, `room_checkpoints`, `room_commands`, `room_events` | Realtime; API read/settlement verification only |
| `readmodel` | leaderboard/history projections | API/indexer projection writer |
| `legacy_chain` | current `game_states`, `player_states`, `game_logs`, `sync_status` | Existing indexer until retired |

Do not let both services freely update `game_sessions`. Expose procedures/internal endpoints: `consume_room_ticket`, `mark_session_active`, `request_session_settlement`, `heartbeat_room_seat`. API validates transitions and owns financial side effects. All foreign keys stay inside the same cluster; cross-schema references are acceptable while it is one bounded deployment.

## Checkpoint and recovery

Colyseus schema synchronization sends state changes to clients, but it is not durable storage; room lifecycle callbacks and state synchronization must be paired with application persistence ([Colyseus state](https://docs.colyseus.io/state), [Colyseus Room](https://docs.colyseus.io/server/room)).

### Accepted-command transaction

1. Receive `{requestId, expectedStateVersion, type, payload}`; validate schema, role, turn, deadline, and current state version.
2. Reject duplicate `requestId` by unique `(room_id, player_id, request_id)` and return stored ack.
3. Compute next state deterministically. Server owns dice seed/RNG state.
4. In one PostgreSQL transaction insert `room_commands`, append domain events, and upsert a full `room_checkpoint` containing `schemaVersion`, `stateVersion`, state JSON/binary, RNG state, and absolute deadlines.
5. Commit, then mutate/broadcast Colyseus state and send `command.ack`. If commit fails, do not acknowledge or expose the speculative state.

Full checkpoint per accepted command is the KISS first delivery. Optimize to periodic snapshots + event replay only after load evidence shows write amplification is a problem.

### Ownership lease and restart

- `room_leases(room_id PK, instance_id, lease_until, fencing_token)` acquired transactionally. Every checkpoint includes fencing token; stale instances cannot write after lease loss.
- First delivery runs one realtime replica. On restart, it lazily restores active rooms when a player reconnects: acquire lease, read latest checkpoint, verify checksum/schema, restore RNG/deadlines, then accept clients.
- Reconnect ticket binds the existing seat and is short lived. Server sends the current full state/version; client discards optimistic/local state. Colyseus client room lifecycle supports state/message/reconnection handling ([Colyseus client Room](https://docs.colyseus.io/client/room)).
- Expired turn deadline is evaluated immediately after restore and exactly one timeout command is persisted. Unique `(room_id, deadline_kind, deadline_at)` prevents duplicate timeout effects.
- Corrupt/missing checkpoint moves session to `recovery_required`, rejects commands, pages operations, and does not auto-refund or settle.

## Contract inventory

### HTTP API v1

| Method/path | Auth | Purpose / response |
|---|---|---|
| `GET /health/live` | no | Process live |
| `GET /health/ready` | no | DB + required dependency readiness |
| `GET /v1/me` | Privy | Bound user and wallet summary |
| `GET /v1/me/coins` | Privy | `{available,reserved,currency,version}` |
| `GET /v1/me/coin-operations` | Privy | Cursor-paginated ledger view |
| `GET /v1/game-sessions` | optional | Joinable/active/recent sessions |
| `GET /v1/game-sessions/{id}` | optional | Public metadata/capacity/status; no hidden state |
| `POST /v1/game-sessions` | Privy | Create room/session; idempotent |
| `POST /v1/game-sessions/{id}/join-intents` | Privy | Reserve entry + return one-use room ticket; idempotent |
| `DELETE /v1/game-sessions/{id}/join-intent` | Privy | Release pre-start reservation; idempotent |
| `POST /v1/game-sessions/{id}/reconnect-ticket` | Privy | Ticket for existing seat; no new reserve |
| `POST /internal/v1/game-sessions/{id}/started` | realtime mTLS/service auth | Transition starting→active |
| `POST /internal/v1/game-sessions/{id}/settlements` | realtime mTLS/service auth | Idempotent capture/payout from terminal checkpoint |
| `POST /internal/v1/game-sessions/{id}/abort` | operations only | Explicit refund policy path |
| `GET /v1/leaderboard/top-players` | no | Compatibility target for existing UI |
| `GET /v1/leaderboard/analytics` | no | Compatibility target for existing UI |

Every mutation requires `Idempotency-Key`, `X-Contract-Version: 1`, bounded JSON DTO validation, and returns `requestId`. Use cursor pagination for mutable histories; keep current page pagination only where frontend compatibility warrants it.

### Colyseus join and messages

Join options: `{ticket:string, contractVersion:1}`. Auth result is server-private. Initial state contains public game state plus only the current player's private view; never put another player's private data or auth claims in shared room state.

Client → room envelope:

```ts
type RoomCommand = {
  requestId: string;          // UUID, unique per player/room
  expectedStateVersion: number;
  type: CommandType;
  payload: unknown;           // validated by type-specific schema
};
```

Minimum command inventory: `player.ready`, `game.start`, `turn.roll`, `property.buy|decline`, `auction.bid|pass`, `turn.end`, `trade.offer|accept|reject|cancel`, `property.build|sell|mortgage|unmortgage`, `jail.pay|use-card|roll`, `bankruptcy.declare`. Implement only commands supported by approved gameplay; unsupported types return `COMMAND_UNSUPPORTED`, never silently no-op.

Server → client messages:

- `command.ack {requestId,stateVersion,eventIds[]}`
- `command.reject {requestId,stateVersion,code,message,retryable}`
- `domain.event {eventId,stateVersion,type,payload,occurredAt}` for sounds/toasts/log adapter
- `session.status {status,reason?}`
- `clock.sync {serverTime,deadline,stateVersion}`
- `auth.expiring|auth.revoked`

State is canonical board/player/property/trade/turn state using Colyseus schema patches. Messages carry transient acknowledgements and UI events. Preserve frontend `GameProvider`, `GameEventsProvider`, and `GameLogsProvider` public hooks/context during migration; replace their data/action internals behind adapters.

## Failure modes and gates

| Failure | Required behavior |
|---|---|
| Invalid/expired Privy token | API 401; frontend refreshes token once with bounded backoff; no reservation mutation |
| Ticket replay/wrong room/expired | Atomic consume rejects; security metric increments; never creates seat |
| API dies after reserve before response | Same idempotency key returns existing reservation/ticket state; expired unused ticket is re-issued without double reserve |
| Browser retries command | Stored ack returned by request ID; action not repeated |
| DB unavailable during command | Reject/pause room; no patch/ack; reconnect after readiness recovers checkpoint |
| Realtime dies after commit before ack | Recovery loads committed version; client retry receives stored ack |
| Realtime dies before commit | No state change; retry processes once |
| API settlement timeout | Retry same settlement key; unique constraint prevents double capture/payout |
| Two room owners | DB lease + fencing token makes stale writer fail; page immediately |
| Client slow/disconnected | Bounded outbound data, reconnect window, persisted absolute deadlines; server rules continue |
| Checkpoint schema mismatch | Stop room in `recovery_required`; migrate/restore operationally, no guessed conversion |

### Observability gates

- Structured logs across services: `requestId`, `traceId`, `gameSessionId`, `roomId`, `playerId` (pseudonymous), `stateVersion`, `operationId`; never access token, ticket, Privy secret, private key, or raw authorization header.
- Metrics: API p50/p95/p99 latency/error by route; auth rejects; reservation/capture/release counts; ledger invariant failures; active rooms/connections; command latency/rejects/duplicates; checkpoint duration/failures; reconnect success; lease conflicts; event-loop lag; DB pool/lock wait/deadlocks.
- Traces: join-intent→reserve→ticket→room join and terminal checkpoint→settlement. Propagate W3C trace context where protocol permits.
- Alerts: any ledger imbalance, double-settlement constraint attempt, fencing rejection, recovery-required room, checkpoint failure streak, readiness down, or p99 threshold breach.

### Security gates

- Rotate exposed Privy key if populated; server credentials only in secret manager. TLS/WSS everywhere; strict CORS/origin allowlist; Helmet; body/message size limits; per-user+IP rate limits.
- Privy audience/app/issuer/expiry verified server-side. Service-to-service mTLS or short-lived workload identity; do not reuse user JWT as service auth.
- Input schemas reject unknown/oversized fields. Authorization checks player role and room membership for every command, not only join.
- Database roles and grants tested; realtime cannot update economy tables. Backups encrypted; restore drill proves checkpoints and ledger recover together.
- Dependency/license and secret scans clean; ticket and token redaction test passes.

### Test/load release gates

Functional gates:

1. Contract tests generated/shared from DTO schemas for API and room messages.
2. Transaction tests race 20 concurrent joins against last seat/balance; exactly one valid outcome per capacity/funds.
3. Idempotency tests repeat every money mutation and room command before/after simulated disconnect.
4. Crash tests kill realtime at pre-commit, post-commit/pre-ack, and post-ack points; recovered state/coins match exactly.
5. Property-based ledger tests preserve non-negative balances and balanced entries.
6. Visual regression proves unchanged pages at supported breakpoints; interaction tests prove providers render equivalent state/events.

Initial measurable load gate (CEO may change targets): sustain 100 concurrent rooms × 8 players = 800 sockets for 30 minutes, 10 commands/s aggregate plus reconnect burst of 25% clients in 60 seconds; zero lost/duplicate accepted commands, zero ledger invariant breach, zero room split-brain, p95 command ack <250 ms and p99 <500 ms, API p95 join <500 ms, DB CPU <70%, pool saturation <80%, event-loop p99 lag <100 ms. This is a release hypothesis, not a capacity claim. Increase only from product concurrency forecasts and observed profiling.

## Deployment and cutover

1. **Security preflight:** remove/rotate public Privy private key; inventory environments and current API consumers.
2. **Contracts first:** add versioned shared schemas and provider adapter interfaces; capture current UI screenshots and interaction baselines.
3. **Database expand:** backup/restore rehearsal; add new schemas/tables/constraints/roles without deleting legacy tables. Deploy API in read-only/shadow mode.
4. **API auth/economy:** deploy Privy guard, identity binding, coin accounts/ledger/reservations, idempotency, health/metrics. Test races and reconciliation before accepting real coins.
5. **Realtime dark deploy:** one Colyseus replica; synthetic rooms exercise ticket, command, checkpoint, recovery, settlement. No public traffic.
6. **Frontend adapter:** preserve visual components/context; switch data/actions behind a feature flag for staff/test cohort. Keep old read path available, but never dual-write financial/gameplay actions.
7. **Shadow and reconcile:** compare legacy/indexed read state and new results where semantically comparable. Run load/crash/security/restore gates.
8. **Canary:** route a small cohort/new games only to new architecture. A game stays on the engine that created it; never migrate an active room between engines.
9. **Full cutover:** stop creation on legacy engine, drain legacy games, route all new games to Nest/Colyseus. Monitor settlement and ledger reconciliation.
10. **Contract:** after rollback window and zero unresolved reconciliation, remove browser Solana gameplay mutation and then retire legacy APIs/workers/tables in a separate approved change.

Rollback before full cutover: disable new-engine creation and let its active rooms drain/recover; return new game creation to legacy only if product still supports it. Never roll an active new-engine game back to old state. Database changes remain additive until final cleanup.

## Recommendation rationale and alternatives

| Choice | Recommendation | Alternative and trade-off |
|---|---|---|
| Realtime scale | One replica + PostgreSQL lease first | Redis presence/multi-replica improves scale/HA but adds split-brain and operational cost before demand is known |
| Durability | Full checkpoint every accepted command | Periodic snapshot/event replay lowers writes but increases recovery complexity and testing burden |
| Ticket | Opaque, hashed, DB-consumed, 60s | Signed stateless JWT is faster but replayable during TTL unless another store exists |
| Economy | API-only transactional ledger | Realtime direct balance writes reduce a hop but expands breach/correctness blast radius |
| Database | One cluster, schemas + roles | Separate databases improve isolation but lose simple atomic transitions and increase delivery/ops cost |

All recommended choices are reversible behind stable contracts: add Redis/multiple replicas later, introduce periodic snapshots after profiling, or split databases via outbox only when scale/availability evidence justifies it.

## Official references

- NestJS: [authentication/guards](https://docs.nestjs.com/security/authentication), [authorization](https://docs.nestjs.com/security/authorization), [OpenAPI bearer security](https://docs.nestjs.com/openapi/security)
- Colyseus: [Room lifecycle/auth/messages](https://docs.colyseus.io/server/room), [state synchronization](https://docs.colyseus.io/state), [client Room/reconnection](https://docs.colyseus.io/client/room)
- Privy: [tokens and verification](https://docs.privy.io/authentication/user-authentication/tokens), [access-token transport](https://docs.privy.io/authentication/user-authentication/access-tokens), [verification-key optimization](https://docs.privy.io/recipes/dashboard/optimizing)
- PostgreSQL: [transaction isolation and `ON CONFLICT`](https://www.postgresql.org/docs/current/transaction-iso.html), [explicit row locking](https://www.postgresql.org/docs/current/explicit-locking.html), [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

## Actionable next steps

1. CEO resolves the decisions below; architect freezes v1 DTO/error/message vocabulary.
2. Plan phases in dependency order: security/contracts → additive DB → API auth/economy → Colyseus durability → frontend adapters → canary/cutover.
3. Before coding economy, write concurrency/idempotency/crash tests as executable acceptance criteria.
4. Establish target concurrency from product forecast and revise the provisional load gate.

## Unresolved questions requiring CEO input

1. **Coin source of truth:** are coins off-chain product credits, an on-chain token, or a custodial representation? Recommendation for first delivery: off-chain non-withdrawable credits. If redeemable/on-chain, custody, reconciliation, compliance, and withdrawal scope materially change.
2. **Payout/refund policy:** when are entry coins captured—game start or successful finish—and what happens after an unrecoverable active game? Recommendation: keep reserved until successful settlement; refund only through explicit abort after recovery attempts.
3. **Disconnect policy:** does a player retain seat and turn timer, get replaced by bot/force action, or forfeit after a grace period? This changes room rules and customer-support risk.
4. **Spectators:** include read-only spectators in v1? Recommendation: defer unless launch requires them; they increase socket/load/privacy scope.
5. **Concurrency SLO:** expected launch peak rooms/players and regions. The proposed 800-socket gate is an engineering baseline, not verified business demand.
6. **Legacy/on-chain cutover:** must new off-chain games coexist permanently with Solana games, or is this a clean replacement after drain? Recommendation: cohort/new-game canary, drain, then separate retirement decision.
7. **Randomness trust:** is server-side cryptographic RNG acceptable, or must dice remain publicly/verifiably random? Verifiable randomness materially changes latency, cost, and recovery contracts.
