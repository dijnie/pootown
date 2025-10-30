import env from '#config/env'
import { Worker, writerDlq, writerEvents, workerBaseOpts } from '#infra/queue/bull'
import type { MonopolyRecord, WriterJob } from '#infra/queue/types'
import type { DatabasePort } from '#infra/db/db.port'
import type {
  NewGameState,
  NewPlayerState,
  PlayerState,
  EmbeddedTradeState,
  TradeStatus,
  GameState
} from '#infra/db/schema'
import { logger } from '#utils/logger'
import { metrics } from '#infra/metrics/metrics'
import {
  BlockchainAccountFetcher,
  type PlayerStateSnapshot,
  type PropertyStateSnapshot
} from '#infra/rpc/account-fetcher'
import { PublicKey } from '@solana/web3.js'

const blockchainFetcher = new BlockchainAccountFetcher()

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

type TradeInstructionUpdateRecord = {
  tradeId: number
  status: TradeStatus
  signature?: string | null
}

/**
 * Enrich monopoly record with actual blockchain account data
 */
async function enrichRecordWithBlockchainData(record: MonopolyRecord): Promise<MonopolyRecord> {
  const fetcher = blockchainFetcher

  try {
    // Enrich gameState records with enhanced blockchain data to keep properties/trades in sync
    if (record.kind === 'gameState') {
      logger.debug(`🔍 Fetching enhanced game data for: ${record.data.pubkey}`)

      // Allow a few retries (new accounts may take a moment to become readable)
      let enhancedData = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        enhancedData = await fetcher.fetchEnhancedGameData(record.data.pubkey)
        if (enhancedData) break

        const delay = attempt * 2000 // 2s, 4s, 6s
        logger.debug(`🔄 Attempt ${attempt} failed, retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      if (enhancedData) {
        // Update with all enhanced blockchain data so DB reflects latest ownership
        record.data.gameId = enhancedData.gameId
        record.data.configId = enhancedData.configId !== 'UNKNOWN' ? enhancedData.configId : record.data.configId
        record.data.authority = enhancedData.authority !== 'UNKNOWN' ? enhancedData.authority : record.data.authority
        record.data.maxPlayers = enhancedData.maxPlayers
        record.data.currentPlayers = enhancedData.currentPlayers
        record.data.currentTurn = enhancedData.currentTurn
        record.data.housesRemaining = enhancedData.housesRemaining
        record.data.hotelsRemaining = enhancedData.hotelsRemaining
        record.data.nextTradeId = enhancedData.nextTradeId
        record.data.activeTrades = enhancedData.activeTrades
        record.data.trades = enhancedData.trades ?? record.data.trades ?? []
        record.data.properties = enhancedData.properties ?? record.data.properties ?? []
        record.data.players = enhancedData.players ?? record.data.players ?? []
        record.data.bankBalance = enhancedData.bankBalance
        record.data.freeParkingPool = enhancedData.freeParkingPool
        record.data.winner = enhancedData.winner ?? record.data.winner ?? null
        if (typeof enhancedData.createdAt === 'number') {
          record.data.createdAt = enhancedData.createdAt
        }
        if (typeof enhancedData.turnStartedAt === 'number') {
          record.data.turnStartedAt = enhancedData.turnStartedAt
        }
        record.data.timeLimit = enhancedData.timeLimit ?? record.data.timeLimit ?? null
        record.data.startedAt = enhancedData.startedAt ?? record.data.startedAt ?? null
        record.data.endedAt = enhancedData.endedAt ?? record.data.endedAt ?? null
        record.data.gameEndTime = enhancedData.gameEndTime ?? record.data.gameEndTime ?? null
        // Fee and earnings
        record.data.entryFee =
          typeof enhancedData.entryFee === 'number' ? enhancedData.entryFee : (record.data.entryFee ?? 0)
        record.data.totalPrizePool =
          typeof enhancedData.totalPrizePool === 'number'
            ? enhancedData.totalPrizePool
            : (record.data.totalPrizePool ?? 0)
        record.data.tokenMint =
          enhancedData.tokenMint && enhancedData.tokenMint !== 'UNKNOWN'
            ? enhancedData.tokenMint
            : (record.data.tokenMint ?? 'UNKNOWN')
        record.data.tokenVault =
          enhancedData.tokenVault && enhancedData.tokenVault !== 'UNKNOWN'
            ? enhancedData.tokenVault
            : (record.data.tokenVault ?? 'UNKNOWN')
        record.data.prizeClaimed =
          typeof enhancedData.prizeClaimed === 'boolean'
            ? enhancedData.prizeClaimed
            : (record.data.prizeClaimed ?? false)
        logger.info(
          {
            pubkey: record.data.pubkey,
            createdAt: record.data.createdAt,
            createdAtType: typeof record.data.createdAt,
            startedAt: record.data.startedAt,
            endedAt: record.data.endedAt,
            gameEndTime: record.data.gameEndTime,
            turnStartedAt: record.data.turnStartedAt,
            timeLimit: record.data.timeLimit
          },
          '📝 Prepared DB payload time fields'
        )
        if (typeof enhancedData.slot === 'number') {
          record.data.updatedSlot = enhancedData.slot
          if (!record.data.createdSlot || record.data.createdSlot === 0) {
            record.data.createdSlot = enhancedData.slot
          }
        }
        if (!record.data.accountCreatedAt) {
          record.data.accountCreatedAt = new Date()
        }
        record.data.accountUpdatedAt = new Date()
        if (enhancedData.gameStatus) {
          record.data.gameStatus = enhancedData.gameStatus as typeof record.data.gameStatus
        }

        logger.info(
          {
            pubkey: record.data.pubkey,
            createdAt: enhancedData.createdAt,
            createdAtType: typeof enhancedData.createdAt,
            startedAt: enhancedData.startedAt,
            endedAt: enhancedData.endedAt,
            gameEndTime: enhancedData.gameEndTime,
            turnStartedAt: enhancedData.turnStartedAt,
            timeLimit: enhancedData.timeLimit,
            slot: enhancedData.slot
          },
          '🧩 Blockchain enhanced data time fields'
        )

        const playerSnapshots = await fetcher.fetchPlayerStateSnapshots(record.data.pubkey, enhancedData.players ?? [])
        const propertySnapshots = await fetcher.fetchPropertyStateSnapshots(
          record.data.pubkey,
          enhancedData.properties?.map((p) => p.position) ?? []
        )

        if (Array.isArray(playerSnapshots)) {
          // Merge player/property snapshots with any forced positions from property snapshot
          const propertyPositionsByWallet = new Map<string, Set<number>>()
          for (const snapshot of propertySnapshots ?? []) {
            const { owner, position } = snapshot.data
            if (owner) {
              if (!propertyPositionsByWallet.has(owner)) {
                propertyPositionsByWallet.set(owner, new Set<number>())
              }
              propertyPositionsByWallet.get(owner)!.add(position)
            }
          }
          // Attach snapshots for downstream player sync
          ;(record as any).__playerSnapshots = playerSnapshots
          ;(record as any).__propertySnapshots = propertySnapshots
          ;(record as any).__propertyPositionsByWallet = propertyPositionsByWallet
        }
      } else {
        logger.warn(`⚠️ Could not fetch enhanced game data for ${record.data.pubkey}`)
      }
    }

    // Enrich platformConfig records with enhanced data
    if (record.kind === 'platformConfig') {
      logger.debug(`⚙️ Fetching enhanced platform config: ${record.data.pubkey}`)

      const enhancedPlatformData = await fetcher.fetchEnhancedPlatformData(record.data.pubkey)
      if (enhancedPlatformData) {
        // Update with all enhanced platform data
        record.data.authority =
          enhancedPlatformData.authority !== 'UNKNOWN' ? enhancedPlatformData.authority : record.data.authority
        record.data.feeVault =
          enhancedPlatformData.feeVault !== 'UNKNOWN' ? enhancedPlatformData.feeVault : record.data.feeVault
        record.data.totalGamesCreated = enhancedPlatformData.totalGamesCreated
        record.data.nextGameId = enhancedPlatformData.nextGameId
        record.data.feeBasisPoints = enhancedPlatformData.feeBasisPoints

        logger.debug(
          `⚙️ Enhanced platform config: totalGames=${enhancedPlatformData.totalGamesCreated}, nextGameId=${enhancedPlatformData.nextGameId}, fee=${enhancedPlatformData.feeBasisPoints}`
        )
      } else {
        logger.warn(`⚠️ Could not fetch enhanced platform data for ${record.data.pubkey}`)
      }
    }

    // Enrich playerState records with enhanced data
    if (record.kind === 'playerState') {
      logger.debug(`👤 Fetching enhanced player data: ${record.data.pubkey}`)

      const enhancedPlayerData = await fetcher.fetchEnhancedPlayerData(record.data.pubkey)
      if (enhancedPlayerData) {
        // Update with enhanced player data
        record.data.wallet = enhancedPlayerData.wallet !== 'UNKNOWN' ? enhancedPlayerData.wallet : record.data.wallet
        record.data.game = enhancedPlayerData.game !== 'UNKNOWN' ? enhancedPlayerData.game : record.data.game
        record.data.cashBalance = enhancedPlayerData.cashBalance
        record.data.position = enhancedPlayerData.position
        record.data.inJail = enhancedPlayerData.inJail
        record.data.jailTurns = enhancedPlayerData.jailTurns
        record.data.doublesCount = enhancedPlayerData.doublesCount
        record.data.isBankrupt = enhancedPlayerData.isBankrupt
        record.data.netWorth = enhancedPlayerData.netWorth
        record.data.propertiesOwned = enhancedPlayerData.propertiesOwned
        record.data.lastRentCollected = enhancedPlayerData.lastRentCollected
        record.data.updatedSlot = enhancedPlayerData.slot
        if (!record.data.createdSlot || record.data.createdSlot === 0) {
          record.data.createdSlot = enhancedPlayerData.slot
        }
        if (!record.data.accountCreatedAt) {
          record.data.accountCreatedAt = new Date()
        }
        record.data.accountUpdatedAt = new Date()

        logger.debug(
          `👤 Enhanced player: cash=${enhancedPlayerData.cashBalance}, position=${enhancedPlayerData.position}, netWorth=${enhancedPlayerData.netWorth}`
        )
      } else {
        logger.warn(`⚠️ Could not fetch enhanced player data for ${record.data.pubkey}`)
      }
    }

    // Enrich propertyState records with enhanced data
    if (record.kind === 'propertyState') {
      logger.debug(`🏠 Fetching enhanced property data: ${record.data.pubkey}`)

      const enhancedPropertyData = await fetcher.fetchEnhancedPropertyData(record.data.pubkey)
      if (enhancedPropertyData) {
        // Update with enhanced property data
        record.data.position = enhancedPropertyData.position
        record.data.game = enhancedPropertyData.game !== 'UNKNOWN' ? enhancedPropertyData.game : record.data.game
        record.data.owner = enhancedPropertyData.owner
        record.data.price = enhancedPropertyData.price
        record.data.houses = enhancedPropertyData.houses
        record.data.hasHotel = enhancedPropertyData.hasHotel
        record.data.isMortgaged = enhancedPropertyData.isMortgaged
        record.data.rentBase = enhancedPropertyData.rentBase
        record.data.rentWithColorGroup = enhancedPropertyData.rentWithColorGroup
        record.data.rentWithHouses = enhancedPropertyData.rentWithHouses.slice(0, 4) as [number, number, number, number]
        record.data.rentWithHotel = enhancedPropertyData.rentWithHotel
        record.data.houseCost = enhancedPropertyData.houseCost
        record.data.mortgageValue = enhancedPropertyData.mortgageValue
        record.data.lastRentPaid = enhancedPropertyData.lastRentPaid

        logger.debug(
          `🏠 Enhanced property: pos=${enhancedPropertyData.position}, price=${enhancedPropertyData.price}, owner=${enhancedPropertyData.owner ? 'owned' : 'available'}`
        )
      } else {
        logger.warn(`⚠️ Could not fetch enhanced property data for ${record.data.pubkey}`)
      }
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        recordKind: record.kind,
        recordPubkey: record.data.pubkey
      },
      `❌ Error enriching record with blockchain data`
    )
    // Continue with original record if blockchain fetch fails
  }

  return record
}

function toPlayerStateRecord(
  existing: PlayerState | null,
  playerPubkey: string,
  enhancedPlayerData: Awaited<ReturnType<typeof blockchainFetcher.fetchEnhancedPlayerData>>,
  gamePubkey: string,
  forcedPositions: number[] = []
): NewPlayerState {
  const now = new Date()
  const wallet =
    enhancedPlayerData?.wallet && enhancedPlayerData.wallet !== 'UNKNOWN'
      ? enhancedPlayerData.wallet
      : (existing?.wallet ?? 'UNKNOWN')
  const game =
    enhancedPlayerData?.game && enhancedPlayerData.game !== 'UNKNOWN'
      ? enhancedPlayerData.game
      : (existing?.game ?? gamePubkey)

  const mergedProperties = new Set<number>()
  for (const position of enhancedPlayerData?.propertiesOwned ?? []) {
    if (typeof position === 'number' && position >= 0 && position < 40) {
      mergedProperties.add(position)
    }
  }
  for (const position of forcedPositions ?? []) {
    if (typeof position === 'number' && position >= 0 && position < 40) {
      mergedProperties.add(position)
    }
  }
  for (const position of existing?.propertiesOwned ?? []) {
    if (typeof position === 'number' && position >= 0 && position < 40) {
      mergedProperties.add(position)
    }
  }
  const propertiesOwned = Array.from(mergedProperties).sort((a, b) => a - b)

  return {
    pubkey: playerPubkey,
    wallet,
    game,
    cashBalance: enhancedPlayerData?.cashBalance ?? existing?.cashBalance ?? 0,
    netWorth: enhancedPlayerData?.netWorth ?? existing?.netWorth ?? 0,
    position: enhancedPlayerData?.position ?? existing?.position ?? 0,
    inJail: enhancedPlayerData?.inJail ?? existing?.inJail ?? false,
    jailTurns: enhancedPlayerData?.jailTurns ?? existing?.jailTurns ?? 0,
    doublesCount: enhancedPlayerData?.doublesCount ?? existing?.doublesCount ?? 0,
    isBankrupt: enhancedPlayerData?.isBankrupt ?? existing?.isBankrupt ?? false,
    propertiesOwned,
    getOutOfJailCards: enhancedPlayerData?.getOutOfJailCards ?? existing?.getOutOfJailCards ?? 0,
    lastRentCollected: enhancedPlayerData?.lastRentCollected ?? existing?.lastRentCollected ?? Date.now(),
    festivalBoostTurns: enhancedPlayerData?.festivalBoostTurns ?? existing?.festivalBoostTurns ?? 0,
    hasRolledDice: enhancedPlayerData?.hasRolledDice ?? existing?.hasRolledDice ?? false,
    lastDiceRoll: enhancedPlayerData?.lastDiceRoll ?? existing?.lastDiceRoll ?? [0, 0],
    needsPropertyAction: enhancedPlayerData?.needsPropertyAction ?? existing?.needsPropertyAction ?? false,
    pendingPropertyPosition: enhancedPlayerData?.pendingPropertyPosition ?? existing?.pendingPropertyPosition ?? null,
    needsChanceCard: enhancedPlayerData?.needsChanceCard ?? existing?.needsChanceCard ?? false,
    needsCommunityChestCard: enhancedPlayerData?.needsCommunityChestCard ?? existing?.needsCommunityChestCard ?? false,
    needsBankruptcyCheck: enhancedPlayerData?.needsBankruptcyCheck ?? existing?.needsBankruptcyCheck ?? false,
    needsSpecialSpaceAction: enhancedPlayerData?.needsSpecialSpaceAction ?? existing?.needsSpecialSpaceAction ?? false,
    pendingSpecialSpacePosition:
      enhancedPlayerData?.pendingSpecialSpacePosition ?? existing?.pendingSpecialSpacePosition ?? null,
    cardDrawnAt: enhancedPlayerData?.cardDrawnAt ?? existing?.cardDrawnAt ?? null,
    accountCreatedAt: existing?.accountCreatedAt ?? now,
    accountUpdatedAt: now,
    createdSlot: existing?.createdSlot ?? enhancedPlayerData?.slot ?? 0,
    updatedSlot: enhancedPlayerData?.slot ?? existing?.updatedSlot ?? existing?.createdSlot ?? 0,
    lastSignature: existing?.lastSignature ?? null
  }
}

function mergeTradeStateData(
  gameState: NewGameState,
  existingGameState: GameState | null,
  tradeUpdates: TradeInstructionUpdateRecord[]
) {
  const normaliseEmbeddedTrades = (value: unknown): EmbeddedTradeState[] => {
    if (Array.isArray(value)) {
      return value as EmbeddedTradeState[]
    }
    if (typeof value === 'string') {
      return safeJsonParse<EmbeddedTradeState[]>(value, [])
    }
    if (value && Array.isArray((value as any).embedded)) {
      return (value as any).embedded as EmbeddedTradeState[]
    }
    return []
  }

  gameState.trades = normaliseEmbeddedTrades((gameState as any).trades)
  if (!Array.isArray(gameState.activeTrades)) {
    gameState.activeTrades = []
  }

  const mergedTrades = new Map<string, EmbeddedTradeState>()
  const existingTrades = normaliseEmbeddedTrades((existingGameState as any)?.trades ?? [])

  for (const trade of existingTrades) {
    mergedTrades.set(trade.pubkey, { ...trade })
  }

  const activeEmbeddedTrades = Array.isArray(gameState.trades) ? gameState.trades : []
  for (const trade of activeEmbeddedTrades) {
    const existing = mergedTrades.get(trade.pubkey)
    if (existing) {
      mergedTrades.set(trade.pubkey, { ...existing, ...trade })
    } else {
      mergedTrades.set(trade.pubkey, { ...trade })
    }
  }

  const closedTradeIds = new Set<number>()

  for (const update of tradeUpdates) {
    closedTradeIds.add(update.tradeId)
    const tradeKey = buildTradePubkey(gameState.pubkey, update.tradeId)
    const existing = mergedTrades.get(tradeKey)
    if (existing) {
      existing.status = update.status
      existing.accountUpdatedAt = new Date()
      existing.updatedSlot = gameState.updatedSlot ?? existing.updatedSlot
      existing.lastSignature = update.signature ?? gameState.lastSignature ?? existing.lastSignature
    } else {
      logger.warn(
        {
          game: gameState.pubkey,
          tradeId: update.tradeId,
          status: update.status
        },
        '⚠️ Trade update received for unknown trade'
      )
    }
  }

  const sortedTrades = Array.from(mergedTrades.values()).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  gameState.trades = sortedTrades

  gameState.activeTrades = (Array.isArray(gameState.activeTrades) ? gameState.activeTrades : []).filter((trade) => {
    if (closedTradeIds.has(trade.id)) return false
    return trade.status === 'Pending'
  })
}

function buildTradePubkey(gamePubkey: string, tradeId: number): string {
  return `${gamePubkey}-trade-${tradeId}`
}

async function syncGamePlayers(
  db: DatabasePort,
  gamePubkey: string,
  playerWallets: string[],
  cachedSnapshots: PlayerStateSnapshot[] = [],
  propertySnapshots: PropertyStateSnapshot[] = []
) {
  const programId = new PublicKey(env.solana.programId)

  // Build property positions by wallet for enrichment
  const propertyPositionsByWallet = new Map<string, Set<number>>()
  for (const snapshot of propertySnapshots) {
    const owner = snapshot.data.owner ?? 'UNKNOWN'
    if (!propertyPositionsByWallet.has(owner)) propertyPositionsByWallet.set(owner, new Set())
    propertyPositionsByWallet.get(owner)!.add(snapshot.position)
  }

  // Prefetch existing player states for this game in one query
  const existingStates = await db
    .getPlayerStates({ game: gamePubkey }, { limit: 1000 })
    .catch(() => ({ data: [], total: 0 }))
  const existingMap = new Map<string, PlayerState>()
  for (const s of existingStates.data) existingMap.set(s.pubkey, s)

  const upserts: NewPlayerState[] = []

  for (const wallet of playerWallets) {
    let playerStatePubkey = ''
    const cached = cachedSnapshots.find((s) => s.wallet === wallet)

    if (cached?.playerStatePubkey) {
      playerStatePubkey = cached.playerStatePubkey
    } else {
      try {
        const [playerPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('player'), new PublicKey(gamePubkey).toBuffer(), new PublicKey(wallet).toBuffer()],
          programId
        )
        playerStatePubkey = playerPda.toBase58()
      } catch (error) {
        logger.warn(
          { wallet, gamePubkey, error: error instanceof Error ? error.message : String(error) },
          '⚠️ Failed to derive player PDA'
        )
        continue
      }
    }

    try {
      const snapshot = cachedSnapshots.find((s) => s.playerStatePubkey === playerStatePubkey)
      const enhancedPlayerData = snapshot?.data ?? (await blockchainFetcher.fetchEnhancedPlayerData(playerStatePubkey))

      if (!enhancedPlayerData) {
        logger.warn({ playerStatePubkey, wallet, gamePubkey }, '⚠️ Skipping player sync - enhanced data unavailable')
        continue
      }

      const extraPositions = new Set<number>()
      const normalizedWallet =
        enhancedPlayerData.wallet && enhancedPlayerData.wallet !== 'UNKNOWN' ? enhancedPlayerData.wallet : wallet
      const propertyPositionsSet = propertyPositionsByWallet.get(normalizedWallet)
      if (propertyPositionsSet) {
        propertyPositionsSet.forEach((pos) => extraPositions.add(pos))
      }

      const upsertRecord = toPlayerStateRecord(
        existingMap.get(playerStatePubkey) ?? null,
        playerStatePubkey,
        enhancedPlayerData,
        gamePubkey,
        Array.from(extraPositions)
      )
      upserts.push(upsertRecord)

      logger.debug(
        {
          playerStatePubkey,
          wallet: enhancedPlayerData.wallet,
          gamePubkey,
          propertiesOwned: upsertRecord.propertiesOwned.length
        },
        '👤 Prepared player state for batch sync'
      )
    } catch (error: unknown) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          gamePubkey,
          wallet
        },
        '❌ Failed to prepare player for game update'
      )
    }
  }

  if (upserts.length > 0) {
    try {
      await db.bulkUpsertPlayerStates(upserts)
      logger.debug({ gamePubkey, count: upserts.length }, '✅ Bulk upserted player states')
    } catch (err: unknown) {
      logger.error({ gamePubkey, err }, '❌ Bulk upsert failed, falling back to individual upserts')
      for (const rec of upserts) {
        try {
          await db.upsertPlayerState(rec)
        } catch (e) {
          logger.error({ pubkey: rec.pubkey, e }, '❌ Failed individual upsert after bulk failure')
        }
      }
    }
  }
}

export function startWriterWorker(db: DatabasePort) {
  const worker = new Worker<WriterJob>(
    'writer',
    async (job) => {
      const { record } = job.data

      const handle = async (record: MonopolyRecord) => {
        // Fetch actual blockchain data for records with placeholder values
        const enrichedRecord = await enrichRecordWithBlockchainData(record)

        switch (enrichedRecord.kind) {
          case 'gameState':
            {
              const snapshotContainer = enrichedRecord as unknown as {
                __playerSnapshots?: PlayerStateSnapshot[]
                __propertySnapshots?: PropertyStateSnapshot[]
                __tradeUpdates?: Array<{ tradeId: number; status: string; signature?: string }>
              }

              const existingGameState = await db.getGameState(enrichedRecord.data.pubkey).catch(() => null)

              const tradeUpdates = (snapshotContainer.__tradeUpdates ?? []).map((update) => ({
                tradeId: update.tradeId,
                status: update.status as TradeStatus,
                signature: update.signature ?? enrichedRecord.data.lastSignature ?? null
              }))

              mergeTradeStateData(enrichedRecord.data, existingGameState, tradeUpdates)

              await db.upsertGameState(enrichedRecord.data)

              await syncGamePlayers(
                db,
                enrichedRecord.data.pubkey,
                Array.isArray(enrichedRecord.data.players) ? enrichedRecord.data.players : [],
                snapshotContainer.__playerSnapshots ?? [],
                snapshotContainer.__propertySnapshots ?? []
              )

              if (snapshotContainer.__playerSnapshots) {
                delete snapshotContainer.__playerSnapshots
              }
              if (snapshotContainer.__propertySnapshots) {
                delete snapshotContainer.__propertySnapshots
              }
              if (snapshotContainer.__tradeUpdates) {
                delete snapshotContainer.__tradeUpdates
              }
            }
            return
          case 'platformConfig':
            return db.upsertPlatformConfig(enrichedRecord.data)
          case 'playerState':
            return db.upsertPlayerState(enrichedRecord.data)
          case 'propertyState':
            return db.upsertPropertyState(enrichedRecord.data)
          case 'tradeState':
            return db.upsertTradeState(enrichedRecord.data)
          case 'auctionState':
            return db.upsertAuctionState(enrichedRecord.data)
        }
      }

      logger.debug(`Processing ${record.kind} record in writer worker`)
      const stopTimer = metrics.startTimer('writer:duration')
      try {
        const recordData = record.data as { pubkey?: string } | undefined
        logger.debug(
          {
            kind: record.kind,
            pubkey: recordData?.pubkey,
            hasValidData: !!record.data
          },
          `About to call handle for record`
        )
        await handle(record)
        await metrics.incr('writer:processed')
        logger.debug(
          {
            kind: record.kind,
            pubkey: recordData?.pubkey
          },
          `✅ Successfully processed record in database`
        )
      } catch (err: unknown) {
        const error = err as { message?: string; stack?: string }
        const recordData = record.data as { pubkey?: string } | undefined
        logger.error(
          {
            kind: record.kind,
            error: error.message,
            stack: error.stack,
            pubkey: recordData?.pubkey
          },
          `❌ Failed to process record`
        )
        metrics.incr('writer:failed')
        // đẩy vào DLQ, kèm lý do và đếm số lần replay
        await writerDlq.add('dlq', job.data, { jobId: job.id ?? undefined })
        throw err // để BullMQ mark failed
      } finally {
        stopTimer() // histogram
      }
    },
    workerBaseOpts
  )

  writerEvents.on('completed', async () => metrics.incr('writer:completed'))
  writerEvents.on('failed', async () => metrics.incr('writer:failed:event'))

  logger.debug('Writer worker (Monopoly) started')
  return worker
}
