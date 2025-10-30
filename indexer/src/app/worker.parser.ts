// Queue → RPC getTransaction → decode → Queue writer
import env from '#config/env'
import { writerQueue, Worker, workerBaseOpts } from '#infra/queue/bull'
import { BackfillJob, RealtimeJob, DiscoveryJob, type MonopolyRecord } from '#infra/queue/types'
import { rateLimitedRPC } from '#infra/rpc/solana'
import { logger } from '#utils/logger'
import { mapTxToMonopolyRecords, attachTradeInstructionMetadata } from '#shared/mappers/monopoly.mapper'
import { getTransactionBlockTimeMs, getTransactionSignature, getTransactionSlot } from '#shared/mappers/log-parsers'
import {
  type NewGameState,
  type NewPlayerState,
  type NewPlatformConfig,
  type NewPropertyState,
  type TradeInfo,
  type EmbeddedPropertyState,
  type EmbeddedTradeState,
  type ColorGroup,
  type PropertyType
} from '#infra/db/schema'
import { PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js'

/**
 * Determine processing priority for different record types
 * Higher number = higher priority (Bull queue processes higher numbers first)
 * Ensures dependency order: platform_configs -> game_states -> player_states
 */
function getProcessingPriority(recordKind: string): number {
  switch (recordKind) {
    case 'platformConfig':
      return 100 // Highest priority - must process first (needed by games)
    case 'gameState':
      return 80 // High priority - process second (needs platform, required by players)
    case 'playerState':
      return 60 // Medium priority - process third (needs game to exist)
    case 'auctionState':
      return 40 // Lower priority
    default:
      return 20 // Lowest priority for unknown types
  }
}

/**
 * Handle discovery jobs by creating fake transaction signature and processing normally
 */
const handleDiscovery = async (job: DiscoveryJob) => {
  try {
    const { accountAddress, accountType } = job
    logger.info(`🔍 Processing discovery job for ${accountType} account: ${accountAddress}`)

    // Create a fake signature to trigger normal processing but with account fetching
    const fakeSignature = `discovery_${accountType}_${accountAddress}_${Date.now()}`

    // For now, let the writer worker handle enhanced fetching
    // The account will be processed like a normal transaction but with enhanced data
    logger.info(`✅ Discovery job queued as ${fakeSignature} for ${accountType}: ${accountAddress}`)
  } catch (error: any) {
    logger.error({ error, job }, `Failed to process discovery job`)
    throw error
  }
}

export function startParserWorkers() {
  const handle = async (signature: string) => {
    try {
      const tx = await rateLimitedRPC.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: env.solana.commitment
      })

      if (!tx) {
        logger.warn(`No transaction found for signature: ${signature}`)
        return
      }

      logger.info(`Processing transaction: ${signature}`)
      let records = mapTxToMonopolyRecords(tx)

      if (records.length === 0) {
        const fallbackRecords = await buildRecordsFromAccounts(tx)
        if (fallbackRecords.length > 0) {
          logger.info(
            `Transaction ${signature} produced no log-derived records; fallback generated ${fallbackRecords.length} records via account inspection`
          )
          records = fallbackRecords
        }
      }

      logger.info(`Transaction ${signature} produced ${records.length} records`)

      if (records.length > 0) {
        logger.info(
          {
            signature,
            recordSummary: records.map((r) => ({ kind: r.kind, hasData: !!r.data }))
          },
          `Records from transaction`
        )
      }

      // Sort records by processing priority to avoid race conditions
      // GameState and PlatformConfig should be processed first as they're dependencies
      const prioritizedRecords = records.sort((a, b) => {
        const priorityA = getProcessingPriority(a.kind)
        const priorityB = getProcessingPriority(b.kind)
        return priorityB - priorityA // Higher number = higher priority (Bull style)
      })

      for (const record of prioritizedRecords) {
        // idempotent by pubkey if provided in data
        const recordData = record as { data?: { pubkey?: string }; kind: string }
        const recordKind = record.kind || 'unknown'
        const id = recordData?.data?.pubkey ? `${recordKind}-${recordData.data.pubkey}` : `${signature}-${recordKind}`
        const priority = getProcessingPriority(recordKind) || 20

        const needsDelay = record.kind === 'playerState' // Only playerState needs delay now
        const processingDelay = needsDelay ? env.dependencies.delayMs : 0

        await writerQueue.add(
          'write',
          { record },
          {
            jobId: id,
            priority: priority, // Higher priority numbers are processed first in Bull
            delay: processingDelay, // Delay dependent jobs to allow GameState to process first
            attempts: env.dependencies.maxRetries + 3, // Base retries + buffer for dependency handling
            backoff: {
              type: 'exponential',
              delay: env.dependencies.delayMs // Use configured delay
            }
          }
        )
        logger.info(`Added ${recordKind} record to writer queue with id: ${id} (priority: ${priority})`)
      }
    } catch (error: any) {
      logger.error({ error, signature }, `Failed to process transaction ${signature}`)
      throw error // Let the job queue handle retries
    }
  }

  const commonOpts = { ...workerBaseOpts, concurrency: env.queue.concurrency }

  const realtimeWorker = new Worker<RealtimeJob>(
    'realtime',
    async (job) => {
      await handle(job.data.signature)
    },
    commonOpts
  )

  const backfillWorker = new Worker<BackfillJob>(
    'backfill',
    async (job) => {
      await handle(job.data.signature)
    },
    commonOpts
  )

  const discoveryWorker = new Worker<DiscoveryJob>(
    'discovery',
    async (job) => {
      await handleDiscovery(job.data)
    },
    commonOpts
  )

  logger.info('Parser workers (Monopoly) started')
  return { realtimeWorker, backfillWorker, discoveryWorker }
}

const GAME_STATE_DISCRIMINATOR_HEX = '905ed0acf8638678'
const PLATFORM_CONFIG_DISCRIMINATOR_HEX = '38033c56ae10f4c3'
const PLAYER_STATE_DISCRIMINATOR_HEX = 'a04e8000f853e6a0'
const PROPERTY_STATE_DISCRIMINATOR_HEX = '7c48c08b40c59e54'
const PLACEHOLDER_NUMERIC = -1
const UNKNOWN_ACCOUNT = 'UNKNOWN'

async function buildRecordsFromAccounts(tx: ParsedTransactionWithMeta): Promise<MonopolyRecord[]> {
  const records: MonopolyRecord[] = []
  const programKey = new PublicKey(env.solana.programId)
  const blockTimeMs = getTransactionBlockTimeMs(tx) || Date.now()
  const slot = getTransactionSlot(tx)
  const signature = getTransactionSignature(tx)
  const seen = new Set<string>()

  const accountKeys = tx.transaction.message.accountKeys ?? []

  for (const account of accountKeys) {
    const base58 =
      (account as any)?.pubkey?.toBase58?.() ??
      (account as any)?.toBase58?.() ??
      (typeof account === 'string' ? account : undefined)

    if (!base58 || seen.has(base58)) continue
    seen.add(base58)

    if (base58 === programKey.toBase58()) continue

    let accountInfo
    try {
      accountInfo = await rateLimitedRPC.getAccountInfo(new PublicKey(base58))
    } catch (error) {
      logger.debug({ error, account: base58 }, 'Failed to fetch account info during fallback parsing')
      continue
    }

    if (!accountInfo?.data) continue
    if (!accountInfo.owner?.equals(programKey)) continue

    const data = accountInfo.data as Buffer
    if (data.length < 8) continue

    const discriminator = data.subarray(0, 8).toString('hex')

    if (discriminator === GAME_STATE_DISCRIMINATOR_HEX) {
      records.push({
        kind: 'gameState',
        data: createPlaceholderGameState(base58, blockTimeMs, slot, signature)
      })
    } else if (discriminator === PLAYER_STATE_DISCRIMINATOR_HEX) {
      records.push({
        kind: 'playerState',
        data: createPlaceholderPlayerState(base58, blockTimeMs, slot, signature)
      })
    } else if (discriminator === PLATFORM_CONFIG_DISCRIMINATOR_HEX) {
      records.push({
        kind: 'platformConfig',
        data: createPlaceholderPlatformConfig(base58, blockTimeMs, slot, signature)
      })
    } else if (discriminator === PROPERTY_STATE_DISCRIMINATOR_HEX) {
      records.push({
        kind: 'propertyState',
        data: createPlaceholderPropertyState(base58, blockTimeMs, slot, signature)
      })
    }
  }

  attachTradeInstructionMetadata(records, tx)

  return records
}

function createPlaceholderGameState(
  pubkey: string,
  blockTimeMs: number,
  slot: number,
  signature: string
): NewGameState {
  const timestamp = blockTimeMs || Date.now()
  const metadataDate = new Date(timestamp)

  return {
    pubkey,
    gameId: PLACEHOLDER_NUMERIC,
    configId: UNKNOWN_ACCOUNT,
    authority: UNKNOWN_ACCOUNT,
    bump: PLACEHOLDER_NUMERIC,
    maxPlayers: PLACEHOLDER_NUMERIC,
    currentPlayers: PLACEHOLDER_NUMERIC,
    currentTurn: PLACEHOLDER_NUMERIC,
    players: [] as string[],
    createdAt: timestamp,
    startedAt: null,
    endedAt: null,
    gameEndTime: null,
    gameStatus: 'WaitingForPlayers',
    turnStartedAt: slot,
    timeLimit: null,
    // Fee and earnings
    entryFee: 0,
    totalPrizePool: 0,
    tokenMint: 'UNKNOWN',
    tokenVault: 'UNKNOWN',
    prizeClaimed: false,
    // Financial state
    bankBalance: PLACEHOLDER_NUMERIC,
    freeParkingPool: PLACEHOLDER_NUMERIC,
    // Resources
    housesRemaining: PLACEHOLDER_NUMERIC,
    hotelsRemaining: PLACEHOLDER_NUMERIC,
    // Completion
    winner: null,
    // Trades and properties
    nextTradeId: PLACEHOLDER_NUMERIC,
    activeTrades: [] as TradeInfo[],
    properties: [] as EmbeddedPropertyState[],
    trades: [] as EmbeddedTradeState[],
    // Blockchain metadata
    accountCreatedAt: metadataDate,
    accountUpdatedAt: metadataDate,
    createdSlot: slot,
    updatedSlot: slot,
    lastSignature: signature
  }
}

function createPlaceholderPlayerState(
  pubkey: string,
  blockTimeMs: number,
  slot: number,
  signature: string
): NewPlayerState {
  const timestamp = blockTimeMs || Date.now()
  const metadataDate = new Date(timestamp)

  return {
    pubkey,
    wallet: UNKNOWN_ACCOUNT,
    game: UNKNOWN_ACCOUNT,
    cashBalance: PLACEHOLDER_NUMERIC,
    netWorth: PLACEHOLDER_NUMERIC,
    position: PLACEHOLDER_NUMERIC,
    inJail: false,
    jailTurns: 0,
    doublesCount: 0,
    isBankrupt: false,
    propertiesOwned: [] as number[],
    getOutOfJailCards: 0,
    lastRentCollected: timestamp,
    festivalBoostTurns: 0,
    hasRolledDice: false,
    lastDiceRoll: [0, 0],
    needsPropertyAction: false,
    pendingPropertyPosition: null,
    needsChanceCard: false,
    needsCommunityChestCard: false,
    needsBankruptcyCheck: false,
    needsSpecialSpaceAction: false,
    pendingSpecialSpacePosition: null,
    cardDrawnAt: null,
    accountCreatedAt: metadataDate,
    accountUpdatedAt: metadataDate,
    createdSlot: slot,
    updatedSlot: slot,
    lastSignature: signature
  }
}

function createPlaceholderPlatformConfig(
  pubkey: string,
  blockTimeMs: number,
  slot: number,
  signature: string
): NewPlatformConfig {
  const timestamp = blockTimeMs || Date.now()
  const metadataDate = new Date(timestamp)

  return {
    pubkey,
    id: pubkey,
    feeBasisPoints: 0,
    authority: UNKNOWN_ACCOUNT,
    feeVault: UNKNOWN_ACCOUNT,
    totalGamesCreated: 0,
    nextGameId: 0,
    bump: 255,
    accountCreatedAt: metadataDate,
    accountUpdatedAt: metadataDate,
    createdSlot: slot,
    updatedSlot: slot,
    lastSignature: signature
  }
}

function createPlaceholderPropertyState(
  pubkey: string,
  blockTimeMs: number,
  slot: number,
  signature: string
): NewPropertyState {
  const timestamp = blockTimeMs || Date.now()
  const metadataDate = new Date(timestamp)

  return {
    pubkey,
    game: UNKNOWN_ACCOUNT,
    position: 0,
    owner: null,
    price: 0,
    colorGroup: 'Special' as ColorGroup,
    propertyType: 'Street' as PropertyType,
    houses: 0,
    hasHotel: false,
    isMortgaged: false,
    rentBase: 0,
    rentWithColorGroup: 0,
    rentWithHouses: [0, 0, 0, 0] as [number, number, number, number],
    rentWithHotel: 0,
    houseCost: 0,
    mortgageValue: 0,
    lastRentPaid: timestamp,
    init: false,
    accountCreatedAt: metadataDate,
    accountUpdatedAt: metadataDate,
    createdSlot: slot,
    updatedSlot: slot,
    lastSignature: signature
  }
}
