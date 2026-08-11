# Brainstorm: Pootown NestJS + Colyseus monorepo

## Status

Accepted direction for planning. No implementation performed.

## Delivery contract

### Outcome

Refactor Pootown into a pnpm monorepo where:

- the existing Next.js frontend keeps its current visual experience and gameplay flow;
- a NestJS backend owns authentication, REST APIs, persistence, leaderboard, and internal coin accounting;
- Colyseus owns authoritative multiplayer rooms, commands, realtime state synchronization, reconnects, and matchmaking;
- Solana, Anchor, Magic Block, transaction signing, PDA/account reads, and the blockchain indexer are removed from the runtime path.

### Constraints

- Keep the frontend UI/layout/components; replace its Solana-specific data and action adapters.
- Keep Privy social login, using verified Privy identity/JWT instead of a Solana wallet signature.
- Entry fee, balances, and rewards use internal game coin only, with no cash-out.
- Clean cutover: do not migrate existing games, balances, or leaderboard data.
- Server is authoritative: clients send intentions such as `roll-dice`; clients never submit trusted results or balances.
- Use pnpm workspace and preserve current game rules unless a separately approved product change is required.

### Non-goals

- Real-money payment, deposits, withdrawals, crypto settlement, or token rewards.
- Compatibility with old Solana addresses, transactions, programs, or indexer data.
- Frontend redesign.
- Multi-region or very-high-scale infrastructure in the first delivery.
- Adding Redis, queues, microservices, or event sourcing before a proven need.

### Acceptance criteria

- A player signs in with Privy without connecting a Solana wallet or signing a transaction.
- Players can create, discover, join, start, play, reconnect to, finish, and review a game through NestJS/Colyseus.
- Existing supported actions remain functional: dice, turns, property actions, cards, jail, trades, bankruptcy, game end, rewards, and leaderboard.
- Every action is authenticated, validated against room state, and rejected when it is not legal for that player or turn.
- Internal coin entry fees and rewards are updated atomically and cannot be duplicated by retries or reconnects.
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

### B. Two backend apps from day one

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

## Recommendation

Choose **A: modular monolith**.

This is the smallest architecture that satisfies the new product model. It removes the blockchain runtime cleanly, avoids premature distributed-system cost, and remains extractable if usage later proves separate scaling is needed. Do not use a Solana compatibility facade; keep visual components, but replace their integration boundary with explicit game commands and synchronized room state.

Use a root **pnpm workspace**, with NestJS as a standard application under `apps/server`; do not add a second, Nest-specific monorepo layer. Early in delivery, run a narrow integration spike proving that Colyseus transport and NestJS share one HTTP server and lifecycle cleanly. If the supported APIs do not make that reliable, fall back to two processes under the same monorepo while keeping the package boundaries below unchanged.

Suggested target shape:

```text
apps/
  web/                 existing Next.js UI
  server/              NestJS REST + Colyseus rooms
packages/
  game-core/           pure server-side rules and invariants
  game-contracts/      command, event, state, and DTO contracts
```

PostgreSQL should persist users, internal coin ledger entries, game metadata/results, leaderboard data, and recoverable room checkpoints. Colyseus room memory is the live state; accepted turn actions produce a durable checkpoint. Redis is deferred until multi-process presence or matchmaking demonstrates the need.

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
- **Reconnect/restart loss:** distinguish temporary disconnect from leaving; checkpoint every accepted turn command and test restart recovery.
- **Cheating:** validate identity, room membership, turn owner, action preconditions, and random outcomes only on the server.
- **Big-bang regression:** migrate in vertical gameplay slices behind the new frontend adapter, but make production cutover clean with no dual Solana runtime.

## Unresolved questions

- Initial coin grant and whether players receive a repeatable daily/faucet grant.
- Exact disconnect grace period, turn timeout, and abandoned-room retention.
- Expected launch concurrency, which determines when Redis presence and multi-process deployment become necessary.
