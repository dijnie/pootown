# System architecture

Pootown is an off-chain, three-service system backed by PostgreSQL. There is no
blockchain, wallet, indexer, generated chain client, Redis, queue, or alternate
game engine in the delivered runtime.

Some board-space names retain the product's original Solana-themed copy. Those
labels are presentation content only; they do not imply a chain dependency,
wallet flow, RPC call, or settlement path.

## Ownership

- `apps/web` renders the product, holds short-lived access tokens in memory,
  calls the API over HTTPS, and joins Colyseus with one-use room tickets.
- `apps/api` is the only authority for email identity, rotating refresh
  sessions, Account Coin, game admission, reservations, ledger operations,
  settlement, history, and leaderboard data.
- `apps/game-server` is the only authority for live match commands, secure
  server randomness, room leases, full checkpoints, private player state, and
  terminal proofs.
- `packages/game-contracts` contains strict transport schemas. It owns no
  persistence or business authority.
- `packages/game-core` contains deterministic, transport-neutral game rules.
  The frozen fixtures under `tests/fixtures/executed-rules` preserve parity
  provenance without requiring a legacy toolchain.

## Durable flow

1. The API authenticates the user and reserves Account Coin in one transaction.
2. The API issues a short-lived, one-use, hash-only room ticket.
3. The game server consumes the ticket through an authenticated internal API
   call and materializes the stable seat.
4. Each accepted room command writes its command, event, and complete versioned
   checkpoint in one fenced database transaction before ack or broadcast.
5. A terminal proof identifies the durable outcome. The API derives capture,
   payout, history, and leaderboard changes from server-owned policy and commits
   them atomically and idempotently.

Account Coin and in-match cash are different domains. Account Coin is an
API-owned, non-withdrawable balance. Match cash exists only inside the room
checkpoint and never becomes a wallet or settlement amount supplied by a
client.

## Availability boundary

The measured baseline is one API process, one Colyseus process, and one
PostgreSQL cluster. Phase 7 sustained 200 authenticated players across 50 rooms
for 30 minutes within the accepted thresholds. This is release evidence for
that topology, not a claim of unlimited capacity. Multi-replica realtime,
Redis, queues, or periodic checkpoints require a new measured bottleneck and a
separate architecture decision.

## Security boundary

Passwords use bcrypt. Refresh tokens and room tickets are stored only as
hashes. API and game server authenticate internal calls with short-lived ES256
service credentials. PostgreSQL roles isolate API-owned and realtime-owned
schemas; migrations run through a separate owner. Secrets are injected at
runtime and must never be passed as public web build variables.
