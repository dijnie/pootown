# Brainstorm: Pootown NestJS + Colyseus monorepo

## Status

Accepted direction for planning. No implementation performed.

## Delivery contract

### Outcome

Refactor Pootown into a pnpm monorepo where:

- the existing Next.js frontend keeps its current visual experience and gameplay flow;
- an independently deployable NestJS API owns authentication, REST APIs, player accounts, leaderboard, and internal coin accounting;
- an independently deployable Colyseus realtime service owns authoritative multiplayer rooms, commands, realtime state synchronization, reconnects, matchmaking, and recoverable room checkpoints;
- Solana, Anchor, Magic Block, transaction signing, PDA/account reads, and the blockchain indexer are removed from the runtime path.

### Constraints

- Keep the frontend UI/layout/components; replace its Solana-specific data and action adapters.
- Keep Privy social login, using verified Privy identity/JWT instead of a Solana wallet signature.
- Entry fee, balances, and rewards use internal game coin only, with no cash-out.
- Clean cutover: do not migrate existing games, balances, or leaderboard data.
- Server is authoritative: clients send intentions such as `roll-dice`; clients never submit trusted results or balances.
- NestJS API is the only writer for account coin and prize settlement; Colyseus cannot mutate financial balances directly.
- Use pnpm workspace and preserve current game rules unless a separately approved product change is required.

### Non-goals

- Real-money payment, deposits, withdrawals, crypto settlement, or token rewards.
- Compatibility with old Solana addresses, transactions, programs, or indexer data.
- Frontend redesign.
- Multi-region or very-high-scale infrastructure in the first delivery.
- Adding Redis, queues, or event sourcing before a proven need.

### Acceptance criteria

- A player signs in with Privy without connecting a Solana wallet or signing a transaction.
- Players can create, discover, join, start, play, reconnect to, finish, and review a game through NestJS/Colyseus.
- Existing supported actions remain functional: dice, turns, property actions, cards, jail, trades, bankruptcy, game end, rewards, and leaderboard.
- Every action is authenticated, validated against room state, and rejected when it is not legal for that player or turn.
- Internal coin entry fees and rewards are updated atomically and cannot be duplicated by retries or reconnects.
- NestJS API and Colyseus realtime can be built, deployed, restarted, and scaled independently.
- Authenticated service-to-service requests use one-time or idempotent contracts for entry reservation, refund, and prize settlement.
- Active games recover after a controlled server restart from a durable snapshot/checkpoint.
- The browser runtime and production backend have no Solana, Anchor, Magic Block, or indexer dependency.
- Focused domain tests and client-server contract tests cover the migrated rules and commands.

## Repository evidence

- `programs/panda-monopoly/src/` currently owns the authoritative rules and state in Rust/Anchor.
- `web/lib/sdk/sdk.ts` builds Solana instructions and reads/subscribes to program accounts.
- `web/components/providers/rpc-provider.tsx`, `web/hooks/useGameState.tsx`, and `web/hooks/useGames.ts` bind the UI directly to Solana and Ephemeral Rollup RPCs.
- `web/components/providers/game-provider.tsx` exposes the useful frontend action boundary, but its implementation currently builds and signs transactions.
- `web/types/schema.ts` is already a useful UI-facing state shape, although its types and mapper still depend on generated Solana code.
- `indexer/` is blockchain-specific and can be retired after its leaderboard/API responsibilities move to NestJS.
- The repository has separate root, `web`, and `indexer` lockfiles and no `pnpm-workspace.yaml`; it is not yet a real pnpm workspace.

## Options considered

### A. Modular monolith: one NestJS + Colyseus backend process

NestJS and Colyseus share one deployable server, while game rules, room transport, auth, persistence, and coin ledger remain separate code modules.

- Benefits: smallest operational footprint, easiest local development, one auth/database boundary, fastest migration.
- Trade-off: realtime rooms and REST APIs scale together at first.
- Main assumption: initial traffic fits a single backend deployment or a small number of sticky-routed instances.
- Fails first when: load requires independent API/realtime scaling or live room movement between processes.
- Reversibility: high if module boundaries are kept clean; Colyseus can later become its own app.

### B. Two backend apps from day one — selected

Run a NestJS API service and a separate Colyseus realtime service, sharing packages and PostgreSQL.

- Benefits: independent scaling and clearer process isolation.
- Trade-off: two deployments, cross-service auth/coordination, more failure modes, and likely Redis/presence needs earlier.
- Main assumption: independent scaling is already necessary.
- Fails first when: delivery and operations cost outweigh the unproven scaling benefit.
- Reversibility: medium; consolidation is possible but wastes initial work.

### C. Solana-shaped compatibility facade

Build backend APIs that imitate the current SDK/PDA/transaction model so frontend integration changes are minimized.

- Benefits: fewer early call-site edits.
- Trade-off: preserves blockchain concepts that no longer serve the product, creates misleading contracts, and makes backend rules harder to express.
- Main assumption: minimizing changed frontend files matters more than a clean domain model.
- Fails first when: new off-chain features require working around fake accounts and transaction semantics.
- Reversibility: low; compatibility debt spreads through both sides.

## Selected direction

Choose **B: two independently deployable backend services** by CEO decision.

Use a root **pnpm workspace**, with NestJS and Colyseus as separate applications. Do not add a second, Nest-specific monorepo layer. The extra service boundary is accepted to allow independent realtime scaling and failure isolation. Keep communication synchronous and small at first; internal HTTP is sufficient until measured load proves a queue is necessary.

Suggested target shape:

```text
apps/
  web/                 existing Next.js UI
  api/                 NestJS auth, account coin, REST, history, leaderboard
  game-server/         Colyseus matchmaking, rooms, rules, realtime state
packages/
  game-core/           pure server-side rules and invariants
  game-contracts/      command, event, state, and DTO contracts
```

One PostgreSQL cluster may be shared operationally at first, but each service owns a separate schema and database role. NestJS owns users, coin ledger, game results, and leaderboard data. Colyseus owns room metadata and recoverable checkpoints. Neither service writes the other service's schema.

For paid-room admission, NestJS reserves the entry fee and issues a short-lived, one-time game ticket. Colyseus validates and consumes that ticket before admitting the player. At cancellation or game end, Colyseus calls authenticated internal refund or settlement endpoints with stable idempotency keys. NestJS performs the balance transaction and safely returns the prior result when the same request is retried.

Redis is deferred while only one Colyseus instance runs. Add Redis presence/matchmaking when horizontal Colyseus scaling is required; service separation alone is not evidence that Redis is needed.

## Initial room policy

- Turn timeout: 90 seconds, with warnings at 30 and 10 seconds remaining.
- Reconnect window: 120 seconds; the room continues and an expired turn is skipped.
- Three missed turns: forfeit the player and resolve their in-game assets.
- Waiting room expiry: 15 minutes, followed by entry-fee refunds.
- All players disconnected: checkpoint and allow resume for 24 hours.
- Finished room: remain live for 10 minutes, then serve results from persistent history.

## Frontend preservation boundary

“Keep frontend” means preserving pages, board, dialogs, animations, sounds, and interaction flow. It cannot mean preserving all integration code:

- replace `RpcProvider` with an API/session/game-client provider;
- replace transaction-building SDK calls with typed Colyseus messages or NestJS endpoints;
- replace Solana account subscriptions with Colyseus state patches/events;
- keep `GameProvider` as the main UI-facing facade where practical;
- convert address types to opaque user/player IDs;
- repurpose wallet/balance UI as Privy profile/internal coin UI, without retaining wallet signing semantics.

## Key risks and controls

- **Rule drift from Rust:** create characterization tests from current behavior before porting each rule group.
- **Duplicate coin changes:** use a PostgreSQL ledger plus idempotency keys and database transactions.
- **Partial failure across services:** use expiring admission reservations, authenticated internal calls, and retry-safe refund/settlement operations.
- **Reconnect/restart loss:** distinguish temporary disconnect from leaving; checkpoint every accepted turn command and test restart recovery.
- **Cheating:** validate identity, room membership, turn owner, action preconditions, and random outcomes only on the server.
- **Big-bang regression:** migrate in vertical gameplay slices behind the new frontend adapter, but make production cutover clean with no dual Solana runtime.

## Unresolved questions

- Initial coin grant and whether players receive a repeatable daily/faucet grant.
- Expected launch concurrency; 200 simultaneous players is the current proposed load-test baseline, not a confirmed product target.
