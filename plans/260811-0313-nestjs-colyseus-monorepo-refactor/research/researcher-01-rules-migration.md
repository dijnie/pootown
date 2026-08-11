# Research Report: Solana/Anchor Rules Migration Inventory

---
date: 2026-08-11T03:13:00Z
scope: programs/panda-monopoly, tests, web game SDK/state consumers
target: TypeScript game-core plus Colyseus
status: complete
---

## Summary

The Anchor program is the current rules authority, but it is not one clean state machine. `GameState` owns the room-wide aggregate, `PlayerState` owns per-player turn/action flags, and handlers coordinate them through validations and mutations. The TypeScript port should preserve this behavior first as a pure, deterministic `game-core`; Colyseus should only authenticate commands, serialize room execution, own timers, persist snapshots, and broadcast typed events.

Do not port the generated Solana SDK mechanically. It mixes transport, PDA/account discovery, transaction assembly, subscriptions, mapping, and client-generated randomness. Replace it with a small command/query protocol whose payloads contain game intent, not blockchain accounts. Preserve wallet identity only where product authentication or prize settlement still requires it.

Highest migration risk: behavior advertised as complete is partly absent, commented out, simplified, or untested. Auction is entirely commented, trade listing always returns an empty array, some card effects log instead of executing, timeout events are defined but not decoded by the frontend event subscription, and current tests cover mostly happy paths. Freeze intended rules with characterization tests before refactoring.

## Contents

1. [Current authority and boundaries](#1-current-authority-and-boundaries)
2. [State inventory](#2-state-inventory)
3. [Command and event inventory](#3-command-and-event-inventory)
4. [Rules and invariants](#4-rules-and-invariants)
5. [Randomness and time](#5-randomness-and-time)
6. [Economy](#6-economy)
7. [Tests and characterization gaps](#7-tests-and-characterization-gaps)
8. [Frontend consumers](#8-frontend-consumers)
9. [Dead or incomplete behavior](#9-dead-or-incomplete-behavior)
10. [Recommended vertical-slice port](#10-recommended-vertical-slice-port)

## 1. Current authority and boundaries

- README calls the product a full on-chain Monopoly implementation and names the Anchor program as the game-logic owner (`README.md:21-29`, `README.md:91-96`). Treat that as intent, not proof of completeness.
- Public Anchor entrypoints delegate into instruction modules (`programs/panda-monopoly/src/lib.rs:24-65`, `programs/panda-monopoly/src/lib.rs:83-121`, `programs/panda-monopoly/src/lib.rs:132-154`, `programs/panda-monopoly/src/lib.rs:205-249`).
- The browser SDK builds transactions and watches Solana accounts/logs. Command parameter contracts occupy `web/lib/sdk/types.ts:40-271`; subscriptions and event decoding occupy `web/lib/sdk/sdk.ts:1396-1772`.
- React's `GameProvider` is the effective UI-facing command facade (`web/components/providers/game-provider.tsx:41-91`). `useGameState` combines game-account fetches with per-player fetches and subscriptions (`web/hooks/useGameState.tsx:39-170`, `web/hooks/useGameState.tsx:296-416`).

Target separation:

```text
web UI -> typed room command -> Colyseus room -> pure game-core transition
                                            |-> state snapshot/patch
                                            |-> domain events
                                            |-> timer scheduling
                                            `-> optional external settlement adapter
```

The core must not import NestJS, Colyseus, database, wallet, or network APIs. It should accept `(state, command, context)` and return `{ state, events, effects }` or an equivalent mutation result. `context` supplies actor identity, current time, and injected random values.

## 2. State inventory

### Platform state: move outside game-core

`PlatformConfig` stores platform ID, fee basis points, authority, fee vault, game counters, and PDA bump; it also calculates percentage fees (`programs/panda-monopoly/src/state/mod.rs:8-23`). This belongs in application/configuration and settlement modules, not a match reducer. Preserve only a match's immutable entry/settlement configuration in core.

### Game aggregate

`GameState` is already the closest model for a Colyseus room snapshot (`programs/panda-monopoly/src/state/mod.rs:97-148`):

| Area | Current fields | Port guidance |
|---|---|---|
| Identity/config | `game_id`, `config_id`, `creator`, `bump` | Replace PDA-specific `bump/config_id` with room/match IDs; creator becomes authenticated player ID. |
| Seats/turn | max/current/total/active players, ordered `players`, parallel `player_eliminated`, `current_turn` | Use one ordered player collection with explicit status; derive counts to avoid drift. Preserve stable seat indices for turn order. |
| Lifecycle | waiting/in-progress/finished, winner, end flags/reason | Keep explicit lifecycle and terminal result. Collapse duplicated flags only after characterization tests prove safe. |
| Bank/assets | bank balance, free-parking pool, remaining 32 houses/12 hotels | Keep in core; these constrain legal transitions. |
| Entry/prize | fee, mint/vault, prize pool, claimed | Split game-visible stake/result from chain-specific custody fields. Settlement is an effect, not a core mutation. |
| Trades | active trades, next wrapping `u8` ID | Keep room-owned trades; replace wrapping IDs with collision-safe monotonic/string IDs. Current ID wraps (`state/mod.rs:180-187`). |
| Board | fixed 40-element `PropertyInfo` array | Keep indexed board state, separate immutable board definition from mutable ownership/buildings. |
| Time | created/started/ended/end time, turn start, limit, timeout/grace/enforcement | Store timestamps/deadlines in snapshot so recovery can reschedule timers deterministically. |

Potential source inconsistency: comments say `max_players` is 2-8 while the vectors are declared with max length 4 (`programs/panda-monopoly/src/state/mod.rs:104-110`), and the actual constant is `MAX_PLAYERS = 4` (`programs/panda-monopoly/src/constants.rs:12-13`). Port four players unless the CEO explicitly changes the product rule.

### Player state

`PlayerState` contains identity, money, board/jail/doubles/bankruptcy status, owned-property cache, jail cards, net worth, rent/activity/festival data, dice result, pending-action flags, and timeout counters (`programs/panda-monopoly/src/state/mod.rs:391-425`). Initialization fixes starting cash/net worth at 1,500 and resets all flags (`programs/panda-monopoly/src/state/mod.rs:427-460`).

The pending booleans are an implicit turn state machine:

```text
awaiting-roll
  -> property-decision | rent | chance-card | community-card | special-space
  -> bankruptcy-resolution (when funds insufficient)
  -> end-turn
  -> next active player
```

Do not reproduce independent booleans if mutually exclusive states are intended. Prefer an explicit discriminated union such as `turn.phase`, with payload (`propertyPosition`, creditor, card deck). First characterize whether multiple flags can currently be true; changing this blindly could alter edge cases.

### Property and trade state

- The game embeds 40 mutable property records (`programs/panda-monopoly/src/state/mod.rs:136`). Ownership-derived helpers implement monopoly checks, owned-property lookup, even build/sell constraints, and net-worth calculation (`programs/panda-monopoly/src/state/mod.rs:190-338`).
- Immutable board/property economics live in `BOARD_SPACES` and lookup helpers (`programs/panda-monopoly/src/constants.rs:90-502`).
- `TradeInfo` stores proposer/receiver, two-way cash/property terms, status and timestamps (`programs/panda-monopoly/src/state/mod.rs:81-95`); pending trades are cleaned by expiry (`programs/panda-monopoly/src/state/mod.rs:150-187`).
- Frontend duplicates the domain shape as `GameAccount`, `PlayerAccount`, `PropertyAccount`, `TradeOffer`, `TradeInfo`, and `PropertyInfo` (`web/types/schema.ts:46-166`). In the target, export these once from a shared contracts package or derive transport schemas from the core model.

## 3. Command and event inventory

### Commands to port

| Domain | Anchor commands / evidence | Target command family |
|---|---|---|
| Platform/match | create/update platform; initialize/join/leave/cancel/start (`lib.rs:24-65`; initialize handlers at `instructions/initialize.rs:93`, `:297`; leave at `instructions/leave_game.rs:64`) | application admin/config; `createGame`, `joinGame`, `leaveGame`, `cancelGame`, `startGame` |
| Turn | roll/callback, end turn (`lib.rs:83-113`; `instructions/dice.rs:41`, `:301`; `instructions/end_turn.rs:28`) | `rollDice`; internal `resolveRandomDice`; `endTurn` |
| Jail | pay fine/use card (`instructions/jail.rs:28`, `:95`) | `payJailFine`, `useJailCard` |
| Property | buy/decline, pay rent, mortgage/unmortgage, build house/hotel, sell building | Same intent commands; use position only, derive owner/prices server-side. Browser contracts confirm the operations (`web/lib/sdk/types.ts:114-163`). |
| Spaces/cards | chance/community draw plus callbacks; two taxes; jail (`lib.rs:99-154`; `instructions/special_spaces.rs:32`, `:111`, `:252`, `:347`, `:492`, `:906`, `:966`) | Player `drawCard` only if UI choice is intentional; otherwise resolve landing internally. Random callback becomes internal effect completion. |
| Trade | create/accept/reject/cancel/cleanup (`instructions/trading.rs:38`, `:215`, `:361`, `:426`, `:481`) | Four player commands; cleanup becomes room timer/internal command. |
| Failure/end | declare bankruptcy, manual end, claim reward | Core bankruptcy/end commands plus external `settlePrize` effect. |
| Timeout | force end turn, force bankruptcy (`lib.rs:245-249`; `instructions/permissionless.rs:36`, `:174`) | Room timer/internal commands, never trust a client-supplied timeout. |

Do not expose Solana callback commands to normal clients. Colyseus is authoritative: the room requests randomness, validates the result context, applies one serialized transition, and publishes the result.

### Events to preserve as domain facts

The program defines 27 events:

- Cards/movement: `ChanceCardDrawn`, `CommunityChestCardDrawn`, `PlayerPassedGo` (`state/events.rs:5-34`).
- Lifecycle: `GameEnded`, `PlayerJoined`, `GameStarted`, `PlayerLeft`, `GameCancelled`, `GameEndConditionMet` (`state/events.rs:35-43`, `:168-185`, `:213-237`).
- Trades: created/accepted/rejected/cancelled/cleaned (`state/events.rs:44-91`).
- Property/economy: purchased, declined, rent, house, hotel, building sale, mortgage, unmortgage, tax (`state/events.rs:92-167`, `:195-204`).
- Bankruptcy/prize: `PrizeClaimed`, `PlayerBankrupt` (`state/events.rs:205-212`, `:238-246`).
- Timeout: penalty, forced turn end, timeout bankruptcy (`state/events.rs:247-271`).

Events should be immutable outputs of successful core transitions. Colyseus patches remain the current-state channel; events drive animations, notifications, audit/replay, and external effects. Add `eventId`, `gameId`, `revision`, and server timestamp at the room boundary. Do not make UI correctness depend only on ephemeral events.

## 4. Rules and invariants

### Board and player rules

- 2-4 players, 40 spaces, start with 1,500, collect 200 passing GO, jail fine 50, maximum three jail turns (`programs/panda-monopoly/src/constants.rs:12-18`).
- Tax spaces: 200 at position 4; 75 at position 38 (`constants.rs:20-24`). Chance positions are 7/22/36; community positions 2/17/33; corners are GO 0, jail 10, free parking 20, go-to-jail 30 (`constants.rs:42-50`).
- A command must target an in-progress game and, for turn-bound actions, the authenticated current player. The same guard pattern is visible in trading (`instructions/trading.rs:12`) and jail (`instructions/jail.rs:11-42`). Centralize guards in core; do not repeat room-handler validation.
- `advance_turn` increments modulo seat count and skips eliminated players; it errors if none remain (`state/mod.rs:340-388`). This should be one tested core primitive.
- Sending a player to jail clears pending actions and dice state, resets doubles, advances the turn, and resets the timer (`utils.rs:197-222`). The current helper calls `advance_turn().unwrap()`, which can panic; target code must return a typed invariant error.
- Player action timestamps and grace checks use saturating elapsed time (`state/mod.rs:463-470`). Decide whether any valid player action refreshes the turn deadline; current handlers refresh `turn_started_at` in several non-turn-ending actions.

### Property rules

- Monopoly requires ownership of every position in a color group (`state/mod.rs:207-215`).
- Houses must be built evenly and sold evenly (`state/mod.rs:232-288`). Bank stock is globally limited to 32 houses and 12 hotels (`constants.rs:31-32`).
- Rent is derived by property type, monopoly/building status, mortgage status, and dice total for utilities (`utils.rs:310-379`). Never accept rent, price, owner, or dice total from the client.
- Net worth counts cash elsewhere plus property liquidation/building value; the helper values mortgaged property at 90% of mortgage value and a hotel at five house costs (`state/mod.rs:290-337`). Characterize the exact end-game ranking formula before consolidating cached `net_worth` with derived value.

### Lifecycle and concurrency invariants

- Waiting games accept joins; game start establishes time limit/end time (`instructions/initialize.rs:237`, `:444-473`).
- One command at a time per room. Every accepted command increments a state revision. Reject stale/duplicate command IDs to prevent double spend when clients retry.
- Derived counts, owned-property lists, property owners, cash transfers, bank stock, and trade ownership must update atomically. A Colyseus room's single-threaded message loop helps, but persistence/outbox work must be idempotent.
- Terminal state is immutable except explicit settlement bookkeeping. Winner/end reason/time must be set exactly once.

## 5. Randomness and time

### Current randomness

- README promises VRF or client-provided dice input (`README.md:29-33`, `README.md:324`).
- Dice has request and callback handlers (`instructions/dice.rs:41`, `:301`). The SDK generates a client seed using `Math.random()` and optionally passes a dice roll (`web/lib/sdk/sdk.ts:654-671`).
- Card draws similarly supply a `Math.random()` client seed and optional explicit card index (`web/lib/sdk/sdk.ts:1035-1076`).
- Utility helpers also derive pseudo-random card/seed values from recent blockhash data plus timestamp and map 32 bytes into two bounded values (`utils.rs:142-184`, `utils.rs:281-308`).

Target recommendation: define a `RandomSource` port. For ordinary server-authoritative play, use a cryptographically secure server source and persist the consumed result/event before broadcast. For replayable tests, inject a seeded deterministic source. If provable fairness remains a product requirement, retain it as an adapter (commit-reveal or external VRF) without contaminating core rules. Client-provided rolls/card indices must be test/admin-only and rejected in production.

### Current timeouts

- Game snapshot contains turn timeout, grace period, enforcement switch and timestamps (`state/mod.rs:138-147`). Defaults are set during initialization (`instructions/initialize.rs:200-209`). Three penalties is the configured maximum (`constants.rs:56`).
- Permissionless handlers force turn end and bankruptcy (`instructions/permissionless.rs:36`, `:174`); corresponding events exist (`state/events.rs:247-271`).

Target: room schedules a deadline from persisted `turnStartedAt + timeout + grace`; after process restart, load state and reschedule or immediately execute overdue internal commands. Use a clock abstraction in core. A timer firing does not mutate directly; it submits a revision-checked internal command so late player commands and timeout execution cannot both win.

## 6. Economy

- Starting cash 1,500; bank begins at 1,000,000; building inventories 32/12 (`constants.rs:15`, `constants.rs:31-32`, `instructions/initialize.rs:195-209`).
- Entry fee, token mint/vault, prize pool and claim status are embedded in match state (`state/mod.rs:120-130`). Separate custody/fees from board money. They use different units and failure modes.
- Property pricing/rents/mortgages/building costs are table data in `BOARD_SPACES` (`constants.rs:90-502`). Make this versioned immutable ruleset data, not Colyseus schema fields.
- Rent calculation covers streets, railroads, and utilities (`utils.rs:310-379`). Transfers, taxes, purchases, mortgages, construction and trades need checked integer arithmetic and atomic invariant tests.
- Trade acceptance validates both cash sides before transfer (`instructions/trading.rs:246-301`). Also characterize property ownership, mortgaged/building restrictions, and simultaneous offers; existing tests do not.
- Bankruptcy and prize settlement are separate concerns. Core determines eliminated players, asset disposition, winner and payout entitlement; application infrastructure performs money/token settlement idempotently.

Use integer smallest units only. Never use JavaScript floating point for money. `bigint` is the closest `u64` analogue, but Colyseus serialization/storage needs an explicit encoding strategy (safe integer range, decimal string, or fixed integer codec).

## 7. Tests and characterization gaps

### Existing executable coverage

| Test file | Covered cases | Evidence |
|---|---|---|
| initialize | successful initialize; timestamp case skipped | `tests/initialize-game.test.ts:7-42` |
| join | first and multiple joins | `tests/join-game.test.ts:6-55` |
| start | minimum-player start; timestamp case skipped | `tests/start-game.test.ts:15-156` |
| roll | current player roll; non-jailed behavior skipped | `tests/roll-dice.test.ts:16-186` |
| movement | current player movement and timestamp refresh | `tests/move-player.test.ts:7-74` |
| jail | fine succeeds and cash changes | `tests/pay-jail-fine.test.ts:7-83` |
| turn | advances and wraps | `tests/end-turn.test.ts:7-76` |
| platform | one config creation; most boundary cases commented | `tests/platform.test.ts:7-218` |
| unrelated harness | counter/delegation smoke and generic initialization | `tests/hello.test.ts:15-98`, `tests/panda-monopoly.ts:5-11` |

These are network/integration-oriented and overwhelmingly happy-path. They do not provide sufficient behavioral lock for a rewrite.

### Characterization tests required before each port slice

1. Lifecycle: invalid player counts, duplicate join, full room, non-creator start/cancel, joins after start, leave at each lifecycle, game time limit.
2. Turn state machine: wrong actor, double roll, doubles/third double, pass GO, jail rolls/three turns/fine/card, every landing type, unresolved pending action blocking end turn, eliminated-seat skip.
3. Property: all 40 board definitions snapshot-tested; purchase/decline/rent; own/mortgaged property; railroads/utilities; monopoly rent; even build/sell; hotel conversion; bank stock; mortgage restrictions; insufficient funds.
4. Cards/spaces: every chance/community card effect, taxes, free parking, go-to-jail, repairs, movement wrapping, follow-up landing resolution.
5. Trading: every status transition, expiry, unauthorized accept/reject/cancel, cash/property validation, mortgaged/built properties, ID wrap/collision, concurrent trades.
6. Bankruptcy/end: creditor vs bank asset disposal, pending trades, final active player, time-limit net-worth tie, manual end, claim once, failed/retried settlement.
7. Timeout: grace boundary, action refresh, repeated penalties, late action race, force bankruptcy, timer recovery after room restart, disabled enforcement.
8. Serialization/replay: bigint encoding, snapshot round-trip, same seed/commands produce same events/state, duplicate command idempotency.

Port tests should call pure core functions first. Add a smaller Colyseus contract suite for auth, schema patches, command ordering, reconnect, timer recovery, and error envelopes. Do not reproduce one slow network test for every rule.

## 8. Frontend consumers

### Current dependencies

- `GameProvider` exposes lifecycle, dice, property, card, jail, building, tax, bankruptcy, end/reward, and trade actions (`web/components/providers/game-provider.tsx:41-91`). This is the compatibility checklist for a replacement room client.
- Its public facade omits SDK-supported decline, mortgage and unmortgage actions even though parameter types exist (`web/lib/sdk/types.ts:120-134`). Confirm whether UI intentionally excludes them.
- `GameAccount`, `PlayerAccount`, property and trade view models are coupled to Solana `Address`/account concepts (`web/types/schema.ts:46-166`). Create UI-facing DTOs independent of Colyseus Schema classes; map room snapshots once.
- `useGameState` fetches game, players and derived properties, caches account results, and installs account subscriptions (`web/hooks/useGameState.tsx:39-170`, `:188-288`, `:348-416`). Replace with one room snapshot/patch subscription and selectors; keep referential-stability optimization only where profiling proves useful.
- `useGames` loads and sorts a lobby list (`web/hooks/useGames.ts:21-79`). Replace program-account scanning with a lobby/query endpoint; a live game room should not own cross-room listing.
- SDK event subscription parses cards, movement, lifecycle, trades, property, bankruptcy, tax, leave/cancel/reward events (`web/lib/sdk/sdk.ts:1545-1772`). It does not decode the three timeout events declared by Rust. Add explicit target event coverage or drive timeout UI from state.
- SDK trade listing explicitly returns `[]` (`web/lib/sdk/sdk.ts:1363-1374`); the current frontend cannot rely on it as an authoritative query.

### Target protocol sketch

```ts
type GameCommand =
  | { id: string; type: "rollDice" }
  | { id: string; type: "buyProperty"; position: number }
  | { id: string; type: "endTurn" }
  | { id: string; type: "createTrade"; offer: TradeTerms };

type CommandResult =
  | { id: string; ok: true; revision: number }
  | { id: string; ok: false; code: GameErrorCode; message: string };
```

Wallet/player ID comes from the authenticated room session, never the payload. Colyseus state provides canonical current data; command results provide acknowledgement/errors; domain events provide transient narrative/animation.

## 9. Dead or incomplete behavior

Verified findings to resolve, not blindly preserve:

1. **Auction is disabled:** `instructions/auction.rs` is effectively commented implementation; examples include the commented in-progress constraint and bid/winner paths (`programs/panda-monopoly/src/instructions/auction.rs:14-209`). `instructions/mod.rs` still names the module (`instructions/mod.rs:1-33`). Decide whether decline means no action or an auction in target MVP.
2. **Legacy property architecture remains commented:** `PropertyState` is commented (`state/mod.rs:473-566`), and large V1 property handlers are commented while V2 embeds property state in `GameState` (`instructions/property.rs:104-615`; SDK also retains commented V1 builders around `web/lib/sdk/sdk.ts:723-1011`). Port only the active aggregate model.
3. **Trade query is a stub:** `getAllTradesForGame` returns an empty array (`web/lib/sdk/sdk.ts:1363-1374`).
4. **Card effects are partial/simplified:** community `MoveToNearest` logs that it is not implemented (`instructions/special_spaces.rs:797-801`); repair logic uses simplified fixed costs and contains commented alternatives (`instructions/special_spaces.rs:812-855`). Only five cards exist in each deck (`constants.rs:617-681`), not a standard full deck.
5. **Timeout frontend gap:** timeout structs exist (`state/events.rs:247-271`) but SDK event parsing ends without them (`web/lib/sdk/sdk.ts:1545-1772`).
6. **Dual randomness paths:** VRF callbacks, client-injected test values, `Math.random`, and blockhash/timestamp helpers coexist. This is not one defined fairness contract (`instructions/dice.rs:41-301`; `utils.rs:142-184`; `web/lib/sdk/sdk.ts:654-671`).
7. **Panic paths:** jail/end-turn utilities unwrap `advance_turn` (`utils.rs:197-222`, `:260-272`). Characterize no-active-player behavior and return typed errors in TypeScript.
8. **State duplication can drift:** `current_players`, `total_players`, `active_players`, elimination flags, `is_bankrupt`, owned-property vectors, property owners, cached net worth, and terminal flags duplicate derivable facts (`state/mod.rs:99-148`, `:391-425`). Derive where safe; otherwise enforce one mutation function and invariant assertions.
9. **Docs overstate coverage:** README says full on-chain implementation and standard rules with modifications (`README.md:21-33`, `README.md:299-324`), while auctions/card effects/tests show gaps. Update docs only after the CEO chooses intended target behavior.

## 10. Recommended vertical-slice port

Each slice should ship core model + commands + events + characterization/unit tests + minimal room wiring + frontend adapter. Avoid a big-bang schema translation.

### Slice 0: behavioral contract and harness

- Create core error/result/event conventions, `Clock`, `RandomSource`, ruleset data, snapshot/replay harness.
- Snapshot all 40 board spaces and five-card decks from `constants.rs`.
- Convert the gaps above into explicit `preserve`, `fix`, or `exclude` decisions. No Colyseus state design should precede those decisions.

### Slice 1: lobby and lifecycle

- Port create/join/leave/cancel/start and game/player initialization.
- Room owns seats and auth; NestJS owns lobby discovery/persistence.
- Acceptance: 2-4 player rules, creator authorization, stable seat order, recoverable snapshot, typed lifecycle events.

### Slice 2: one complete turn

- Port roll, move, pass GO, pending phase, end turn, turn advance, jail and basic special/tax spaces.
- Inject dice results in tests; production uses room randomness adapter.
- Add deadline/internal timeout skeleton now, because `turnStartedAt` semantics touch every later command.

### Slice 3: property economy

- Port immutable board data, buy/decline/rent, mortgage/unmortgage, house/hotel/sale, monopoly/even-building/bank stock.
- Make property ownership and cash transfer atomic; eliminate frontend-supplied owner/rent.
- CEO gate: auction excluded, implemented, or explicitly deferred.

### Slice 4: cards and chained movement

- Port chance/community draw and effects as internal resolution steps.
- Persist random result and emitted card event. Model chained landing resolution without recursive unbounded commands.
- CEO gate: preserve five-card simplified decks versus adopt fuller rules; define unimplemented `MoveToNearest` and repair behavior.

### Slice 5: trading

- Port room-owned offers, expiry scheduler and atomic acceptance.
- Use non-wrapping IDs and explicit optimistic revision checks.
- Frontend reads trades from room state, removing the stub query.

### Slice 6: bankruptcy, endings, timeout escalation, settlement

- Port bankruptcy asset disposition, active-player end, time-limit ranking, manual end, timeout penalties/forced bankruptcy.
- Emit a settlement entitlement; external adapter claims/pays once with idempotency key. Do not block core terminal state on chain/network availability.
- Add restart, reconnect, duplicate-command, late-timer and failed-settlement tests.

### Slice 7: frontend cutover and removal

- Replace PDA/account SDK calls with one room client and lobby API.
- Map target snapshot to UI DTOs, then delete generated Anchor SDK/account/event code only after route-level parity checks.
- Run dual characterization fixtures (same initial state + deterministic commands) against Rust-observed outcomes and TypeScript core where practical. Do not run two authoritative live engines.

## Decisions needed before implementation

1. Is four players the target maximum, or should the old 2-8 comment become product behavior?
2. On property decline, should the target implement auctions, leave the property unowned, or temporarily remove decline?
3. Preserve the current five-card simplified decks and repair rules, or align with a fuller Monopoly ruleset?
4. Is provable randomness still a business requirement, or is server-authoritative secure randomness sufficient?
5. Does entry-fee/prize settlement remain on Solana, move off-chain, or leave the MVP?
6. For time-limit ties, what is the exact winner/tie-break formula?
7. Should decline, mortgage and unmortgage become visible UI actions at cutover?

## Actionable next steps

1. Treat the implementation plan validation log as the resolution authority for the behavior gates above.
2. Add Slice 0 characterization fixtures before modifying Anchor behavior.
3. Define core snapshot/command/event/error types and serialization rules, especially money and timestamps.
4. Implement Slice 1 only, prove restore/reconnect, then continue vertically.
