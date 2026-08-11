# 🎲 Pootown

An on-chain Monopoly game built on the Solana blockchain with **Ephemeral Rollups**, powered by **Magic Block** for a real-time gaming experience.

## 📋 Table of Contents

* [Overview](#-overview)
* [System Architecture](#-system-architecture)
* [System Requirements](#-system-requirements)
* [Installation](#-installation)
* [Environment Configuration](#-environment-configuration)
* [Running the Project](#-running-the-project)
* [Testing](#-testing)
* [API Documentation](#-api-documentation)
* [Project Structure](#-project-structure)
* [Useful Commands](#-useful-commands)
* [Troubleshooting](#-troubleshooting)

## 🎮 Overview

Panda Monopoly is a full on-chain implementation of Monopoly on the Solana blockchain, featuring:

* **On-chain Game Logic** — implemented entirely in a Solana Program
* **Ephemeral Rollups** — powered by Magic Block for real-time performance
* **Web3 Authentication** — integrated with Privy for wallet auth
* **Realtime Updates** — via WebSocket connections
* **Leaderboard System** — track player stats and rankings
* **Trading System** — trade properties and assets between players
* **VRF Randomness** — verifiable random dice rolls and card draws

### Game Features

* 🎲 Roll dice using VRF or a client-provided seed
* 🏠 Buy, sell, and build properties
* 💰 Trade between players
* 🎴 Chance and Community Chest cards
* 🏛️ Tax spaces (MEV Tax, Priority Fee Tax)
* 🚔 Jail and bail mechanics
* 💸 Bankruptcy system
* 🏆 Leaderboard and rewards
* ⏱️ Time-limited game sessions
* 🤖 Permissionless force actions for timeout handling

## 🏗️ System Architecture

The project consists of three core components:

```
┌─────────────────────────────────────────────────────────────┐
│                        WEB FRONTEND                         │
│                  (Next.js + Privy Auth)                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTP / WebSocket
                     │
┌────────────────────▼────────────────────────────────────────┐
│                         INDEXER                             │
│            (Fastify API + BullMQ Workers)                   │
│   - Realtime Listener (WebSocket from ER)                  │
│   - Parser Workers (Parse transactions)                    │
│   - Writer Workers (Write to PostgreSQL)                   │
│   - Enrichment Workers (Add extra data)                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ gRPC / HTTP
                     │
┌────────────────────▼────────────────────────────────────────┐
│                    SOLANA BLOCKCHAIN                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Ephemeral Rollups (Magic Block)            │  │
│  │  - High-speed transaction processing                │  │
│  │  - Real-time game state updates                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Solana Devnet (Settlement Layer)            │  │
│  │  - Final state settlement                           │  │
│  │  - Historical data storage                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Panda Monopoly Program                    │  │
│  │         (4vucUqMcXN4sgLsgnrXTUC9U7ACZ5DmoR...)       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **Solana Program** (`programs/panda-monopoly/`)

   * Smart contract written in Rust/Anchor
   * Handles full game logic
   * Deployable to Solana devnet or localnet

2. **Web Frontend** (`apps/web/`)

   * Next.js 15 with React 19
   * Privy authentication
   * Real-time state updates via WebSockets
   * Responsive UI with Tailwind CSS

3. **Indexer** (`indexer/`)

   * Backend service built with Fastify
   * Indexes blockchain data into PostgreSQL
   * Uses BullMQ for queue processing
   * Provides REST & WebSocket APIs

## 📦 System Requirements

### Core

* **Node.js** 24.x (pinned in `.node-version`)
* **pnpm** 11.x (pinned in `package.json`)
* **Rust** ≥ 1.75.0
* **Solana CLI** ≥ 1.18.0
* **Anchor CLI** ≥ 0.31.1

### Databases & Services

* **PostgreSQL** ≥ 14
* **Redis** ≥ 7.0

### Optional

* **Docker & Docker Compose** — to run PostgreSQL and Redis easily
* **Solana Test Validator** — for local testing

got it 😎 — đây là bản **Installation** section đã được chỉnh lại để repo URL là của bạn (`https://github.com/0xLou1s/pootown`) luôn nhé:

---

## 🔧 Installation

follow these steps to get the project running locally (development flow).

### 1. clone repository

```bash
git clone https://github.com/0xLou1s/pootown.git
cd pootown
```

### 2. install root / monorepo dependencies (used for anchor/tests)

```bash
pnpm install
```

The root install also installs `apps/web`; the repository uses one root lockfile.

### 4. install indexer dependencies

```bash
cd indexer
pnpm install
cd ..
```

### 5. install solana cli & anchor

```bash
# install solana cli (stable)
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# install anchor version manager + toolchain
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.31.1
avm use 0.31.1
```

### 6. start postgres & redis (two options)

**option a — docker (recommended)**

```bash
# create docker-compose.yml (see README for example) then:
docker-compose up -d
```

**option b — local (macos example)**

```bash
# postgres
brew install postgresql@16
brew services start postgresql@16
createdb monopoly

# redis
brew install redis
brew services start redis
```

### 7. setup solana wallet (devnet/localnet)

```bash
# generate a new keypair if needed
solana-keygen new --outfile ~/.config/solana/id.json

# point to devnet for testing
solana config set --url devnet

# request devnet airdrop (devnet only)
solana airdrop 2
```

### 8. run local validator & ephemeral validator (local dev)

```bash
# make sure start-validator.sh is executable
chmod +x start-validator.sh
./start-validator.sh
```

this script will start the solana test validator (port 8899) and the ephemeral validator (port 7799) and fetch required programs.

### 9. build & deploy programs

```bash
# build program artifacts
anchor build

# deploy to localnet
anchor deploy --provider.cluster localnet

# alternate automatic script (also handles airdrop)
chmod +x run.sh
./run.sh
```

### 10. generate frontend sdk

```bash
cd apps/web
node codama.mjs
cd ../..
```

### 11. setup database (indexer)

```bash
cd indexer

# generate migrations (if using drizzle/drift)
pnpm run db:generate

# run migrations
pnpm run db:migrate

cd ..
```

### 12. start services (dev)

open separate terminals for each:

* indexer

```bash
cd indexer
pnpm run dev
```

* web frontend

```bash
cd apps/web
pnpm run dev
```

* (optional) other utilities, tests

```bash
# run tests
anchor test

# or run type-tests / integration tests
pnpm exec ts-mocha -p ./tsconfig.json tests/<test-file>.ts
```

### 13. quick verification

* frontend: `http://localhost:3000`
* indexer API: `http://localhost:8080` (and `http://localhost:8080/documentation` for swagger)
* postgres: `psql postgresql://postgres:postgres@localhost:5432/monopoly`
* redis: `redis-cli ping` → should return `PONG`


## 📝 Notes

### Game Rules

The game follows standard Monopoly rules with some modifications:

* 40 spaces on the board
* Roll doubles for an extra turn
* Buy and build properties
* Pay rent when landing on another player’s property
* Chance & Community Chest cards
* Tax and Jail spaces
* Trading system
* Bankruptcy when funds hit zero

### Ephemeral Rollups

Magic Block’s Ephemeral Rollups provide:

* High-speed, low-latency gameplay
* Real-time updates
* Final settlement on Solana mainnet

### Security

* Private keys are never shared
* All transactions are signed client-side
* Dice rolls use VRF for provable randomness
* Platform fees configurable by admin
