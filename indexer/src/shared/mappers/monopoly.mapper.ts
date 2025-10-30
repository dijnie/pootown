import type { ParsedTransactionWithMeta } from '@solana/web3.js'
import type { MonopolyRecord } from '#infra/queue/types'
import env from '#config/env'

import {
  parseKeyValueFromLog,
  buildPlatformConfigFromLog,
  buildGameStateFromLog,
  buildPlayerStateFromLog,
  getTransactionSignature,
  getTransactionSlot,
  getTransactionBlockTimeMs
} from './log-parsers'
import { MONOPOLY_LOGS } from '#shared/config/board.config'

// ==================== CONSTANTS ====================

/**
 * Placeholder indicators for missing blockchain data
 * These sentinel values indicate fields that need to be enriched from blockchain account data
 */
const NEEDS_BLOCKCHAIN_ENRICHMENT = -1
const UNKNOWN_ACCOUNT = 'UNKNOWN'

const ACCEPT_TRADE_DISCRIMINATOR = Buffer.from('8bda1d5f7c4b4074', 'hex')
const REJECT_TRADE_DISCRIMINATOR = Buffer.from('93854adf39e84c50', 'hex')
const CANCEL_TRADE_DISCRIMINATOR = Buffer.from('7c425b3baf6bd078', 'hex')

type TradeInstructionStatus = 'Accepted' | 'Rejected' | 'Cancelled'

type TradeInstructionUpdate = {
  game: string
  tradeId: number
  status: TradeInstructionStatus
  signature: string
}

// ==================== MAIN MAPPING FUNCTION ====================

/**
 * Map parsed blockchain transaction to array of monopoly database records
 *
 * This function processes transaction logs and converts them into typed
 * database records based on the detected monopoly events.
 *
 * @param tx - Parsed transaction with metadata
 * @returns Array of monopoly records for queue processing
 */
export function mapTxToMonopolyRecords(tx: ParsedTransactionWithMeta): MonopolyRecord[] {
  const records: MonopolyRecord[] = []
  const logs = tx.meta?.logMessages ?? []

  // Early exit if no logs
  if (logs.length === 0) {
    return records
  }

  // Debug logging for property-related transactions
  if (isPropertyTransaction(logs)) {
    console.log('🔍 PROPERTY TRANSACTION:', getTransactionSignature(tx))
    console.log('🔍 LOG MESSAGES:', logs.slice(0, 10)) // First 10 logs only
  }

  // Process each log message for monopoly events
  for (const logMessage of logs) {
    const processedRecords = processLogMessage(tx, logMessage)
    records.push(...processedRecords)
  }

  // Process instruction-based events (for compatibility with existing logs)
  const instructionRecords = processInstructionLogs(tx, logs)
  records.push(...instructionRecords)

  attachTradeInstructionMetadata(records, tx)

  return records
}

/**
 * Attach trade instruction metadata (accept/reject/cancel) to game state records
 */
export function attachTradeInstructionMetadata(records: MonopolyRecord[], tx: ParsedTransactionWithMeta): void {
  if (records.length === 0) return

  const updates = extractTradeInstructionUpdates(tx)
  if (updates.length === 0) return

  const updatesByGame = new Map<string, TradeInstructionUpdate[]>()
  for (const update of updates) {
    const list = updatesByGame.get(update.game)
    if (list) {
      list.push(update)
    } else {
      updatesByGame.set(update.game, [update])
    }
  }

  for (const record of records) {
    if (record.kind !== 'gameState') continue
    const gamePubkey = record.data.pubkey
    if (!gamePubkey) continue
    const updatesForGame = updatesByGame.get(gamePubkey)
    if (updatesForGame && updatesForGame.length > 0) {
      ;(record.data as any).__tradeUpdates = updatesForGame
    }
  }
}

function extractTradeInstructionUpdates(tx: ParsedTransactionWithMeta): TradeInstructionUpdate[] {
  const updates: TradeInstructionUpdate[] = []
  const message = tx.transaction.message
  const signature = getTransactionSignature(tx)
  const accountKeys = message.accountKeys.map((key) => toBase58(key)).map((key) => key ?? '')
  const programIdString = env.solana.programId

  for (const instruction of message.instructions as ReadonlyArray<any>) {
    let programId: string | null = null
    let instructionData: string | undefined
    let instructionAccounts: string[] = []

    if (typeof instruction?.programIdIndex === 'number') {
      programId = accountKeys[instruction.programIdIndex] ?? null
      instructionData = instruction.data
      instructionAccounts = (instruction.accounts ?? [])
        .map((index: number) => accountKeys[index] ?? '')
        .filter(Boolean)
    } else if (instruction?.programId) {
      programId = toBase58(instruction.programId)
      instructionData = typeof instruction.data === 'string' ? instruction.data : undefined
      const rawAccounts = instruction.accounts ?? []
      instructionAccounts = rawAccounts.map((acc: any) => toBase58(acc) ?? '').filter(Boolean)
    }

    if (!programId || programId !== programIdString) continue

    const data = Buffer.from(instructionData ?? '', 'base64')
    if (data.length < 9) continue

    const discriminator = data.subarray(0, 8)
    let status: TradeInstructionStatus | null = null
    if (discriminatorEquals(discriminator, ACCEPT_TRADE_DISCRIMINATOR)) {
      status = 'Accepted'
    } else if (discriminatorEquals(discriminator, REJECT_TRADE_DISCRIMINATOR)) {
      status = 'Rejected'
    } else if (discriminatorEquals(discriminator, CANCEL_TRADE_DISCRIMINATOR)) {
      status = 'Cancelled'
    }

    if (!status) continue

    const tradeId = data.readUInt8(8)
    const gamePubkey = instructionAccounts[0] ?? null
    if (!gamePubkey) continue

    updates.push({
      game: gamePubkey,
      tradeId,
      status,
      signature
    })
  }

  return updates
}

function toBase58(key: any): string | null {
  if (!key) return null
  if (typeof key === 'string') return key
  if (typeof key.toBase58 === 'function') return key.toBase58()
  if (typeof key.pubkey === 'string') return key.pubkey
  if (key.pubkey && typeof key.pubkey.toBase58 === 'function') return key.pubkey.toBase58()
  return null
}

function discriminatorEquals(a: Buffer, b: Buffer): boolean {
  if (a.length < 8 || b.length < 8) return false
  for (let i = 0; i < 8; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// ==================== LOG MESSAGE PROCESSING ====================

/**
 * Process individual log message and extract monopoly records
 *
 * @param tx - Transaction metadata
 * @param logMessage - Single log message to process
 * @returns Array of monopoly records extracted from this log
 */
function processLogMessage(tx: ParsedTransactionWithMeta, logMessage: string): MonopolyRecord[] {
  const records: MonopolyRecord[] = []

  // Only debug platform and config related logs
  if (
    logMessage.includes('Platform') ||
    logMessage.includes('platform') ||
    logMessage.includes('config') ||
    logMessage.includes('Config')
  ) {
    console.log('🔍 DEBUG LOG FORMAT:', logMessage.substring(0, 200))
  }

  // Process key-value formatted logs (new format)
  if (logMessage.includes('=')) {
    // Determine log type and parse accordingly
    if (logMessage.startsWith(MONOPOLY_LOGS.PLATFORM_CREATE) || logMessage.startsWith(MONOPOLY_LOGS.PLATFORM_UPDATE)) {
      console.log('🏗️ Platform config log detected:', logMessage.substring(0, 100))
      const platformRecord = parsePlatformConfigLog(tx, logMessage)
      if (platformRecord) {
        records.push({ kind: 'platformConfig', data: platformRecord })
        console.log('🏗️ Platform config parsed successfully:', platformRecord.pubkey)
      } else {
        console.log('🏗️ Platform config parsing failed')
      }
    } else if (logMessage.startsWith(MONOPOLY_LOGS.GAME_CREATE) || logMessage.startsWith(MONOPOLY_LOGS.GAME_UPDATE)) {
      const gameStateRecord = parseGameStateLog(tx, logMessage)
      if (gameStateRecord) {
        records.push({ kind: 'gameState', data: gameStateRecord })
      }
    } else if (logMessage.startsWith(MONOPOLY_LOGS.PLAYER_UPDATE)) {
      console.log('👤 Player log detected:', logMessage.substring(0, 100))
      const playerRecord = parsePlayerLog(tx, logMessage)
      if (playerRecord) {
        records.push({ kind: 'playerState', data: playerRecord })
        console.log('👤 Player parsed successfully:', playerRecord.pubkey)
      } else {
        console.log('👤 Player parsing failed')
      }
    }
    // Note: Trade data is now embedded in game_states.trades JSON field, not separate records
  }

  return records
}

/**
 * Process instruction-based logs for backward compatibility
 *
 * @param tx - Transaction metadata
 * @param logs - All log messages from transaction
 * @returns Array of monopoly records from instruction parsing
 */
function processInstructionLogs(tx: ParsedTransactionWithMeta, logs: string[]): MonopolyRecord[] {
  const records: MonopolyRecord[] = []

  for (let i = 0; i < logs.length; i++) {
    const logMessage = logs[i]

    // Debug all instruction types
    if (logMessage.includes('Instruction:')) {
      console.log('🔍 INSTRUCTION DETECTED:', logMessage)

      // Check specifically for platform config instructions
      if (logMessage.includes('CreatePlatformConfig') || logMessage.includes('create_platform_config')) {
        console.log('🏗️ PLATFORM CONFIG INSTRUCTION FOUND!', logMessage)
      }
    }

    // Parse InitializePlatform instruction - try various patterns
    if (
      logMessage.includes('InitializePlatform') ||
      logMessage.includes('CreatePlatformConfig') ||
      logMessage.includes('create_platform_config') ||
      logMessage.includes('Platform') ||
      logMessage.includes('platform')
    ) {
      console.log('🏗️ Platform instruction detected:', logMessage.substring(0, 100))
      const platformRecord = parseInitializePlatformInstruction(tx, logs, i)
      if (platformRecord) {
        records.push({ kind: 'platformConfig', data: platformRecord })
        console.log('🏗️ Platform config created via instruction:', platformRecord.pubkey)
      } else {
        console.log('🏗️ Platform config instruction parsing failed')
      }
    }

    // Parse InitializeGame instruction (actual account creation)
    else if (logMessage.includes('InitializeGame') || logMessage.includes('Instruction: InitializeGame')) {
      console.log('🏗️ InitializeGame instruction found, parsing...')

      // Validate this transaction actually creates accounts by checking account balance changes
      const hasAccountCreation =
        tx.meta?.preBalances &&
        tx.meta?.postBalances &&
        tx.meta.preBalances.some((preBalance, index) => preBalance === 0 && tx.meta!.postBalances[index] > 0)

      if (!hasAccountCreation) {
        console.log('🏗️ InitializeGame: No account creation detected (no balance changes)')
        return []
      }

      const gameStateRecord = parseInitializeGameInstruction(tx)
      if (gameStateRecord) {
        console.log('🏗️ GameState record created successfully:', gameStateRecord.pubkey)
        records.push({ kind: 'gameState', data: gameStateRecord })
      } else {
        console.log('🏗️ GameState record creation failed')
      }
    }

    // Parse StartGame instruction (updates existing game - don't create new records)
    else if (logMessage.includes('StartGame') || logMessage.includes('Instruction: StartGame')) {
      console.log('🚀 StartGame instruction found - game update, not creating new record')
      // StartGame doesn't create new accounts, it updates existing game state
      // The game account should already exist from InitializeGame
      // No need to create new gameState records here
    }

    // Parse JoinGame instruction
    else if (logMessage.includes('JoinGame') || logMessage.includes('Join game:')) {
      console.log('👤 JoinGame instruction detected:', logMessage.substring(0, 80))
      // Try to parse using player instruction parser since JoinGame creates player
      const playerRecord = parsePlayerInstruction(tx, logs, i)
      if (playerRecord) {
        records.push({ kind: 'playerState', data: playerRecord })
        console.log('👤 Player created via JoinGame:', playerRecord.pubkey)
      } else {
        console.log('👤 JoinGame parsing failed')
      }
    }

    // Property initialization is now handled via game state updates - no separate property records

    // Parse Player creation/update - only for specific patterns to avoid duplicates
    else if (logMessage.includes('Player') && (logMessage.includes('joined') || logMessage.includes('delegated'))) {
      const playerRecord = parsePlayerInstruction(tx, logs, i)
      if (playerRecord) {
        records.push({ kind: 'playerState', data: playerRecord })
      }
    }
  }

  return records
}

// ==================== SPECIFIC LOG PARSERS ====================

/**
 * Parse platform config-related log message
 */
function parsePlatformConfigLog(tx: ParsedTransactionWithMeta, logMessage: string) {
  try {
    const keyValueMap = parseKeyValueFromLog(logMessage)
    return buildPlatformConfigFromLog(tx, keyValueMap)
  } catch (error) {
    console.error('Failed to parse platform config log:', error, logMessage)
    return null
  }
}

/**
 * Parse game state-related log message
 */
function parseGameStateLog(tx: ParsedTransactionWithMeta, logMessage: string) {
  try {
    const keyValueMap = parseKeyValueFromLog(logMessage)
    return buildGameStateFromLog(tx, keyValueMap)
  } catch (error) {
    console.error('Failed to parse game state log:', error, logMessage)
    return null
  }
}

/**
 * Parse player-related log message
 */
function parsePlayerLog(tx: ParsedTransactionWithMeta, logMessage: string) {
  try {
    const keyValueMap = parseKeyValueFromLog(logMessage)
    return buildPlayerStateFromLog(tx, keyValueMap)
  } catch (error) {
    console.error('Failed to parse player log:', error, logMessage)
    return null
  }
}

// Trade parsing removed - trades are now embedded in game_states.trades JSON field

// ==================== INSTRUCTION-BASED PARSERS ====================

/**
 * Parse InitializePlatform instruction from multiple log lines
 */
function parseInitializePlatformInstruction(tx: ParsedTransactionWithMeta, logs: string[], startIndex: number) {
  let platformAccount = ''
  let authority = ''
  let feeVault = ''
  let feeBasisPoints = '500' // Default 5%

  // Extract platform account from transaction accounts
  const accounts = tx.transaction.message.accountKeys || []
  console.log('🏗️ Transaction accounts for platform:', accounts.map((acc) => acc.pubkey.toBase58()).slice(0, 6))

  // In CreatePlatformConfig: [admin, config, system_program]
  if (accounts.length >= 2) {
    authority = accounts[0]?.pubkey.toBase58() || ''
    platformAccount = accounts[1]?.pubkey.toBase58() || ''
    console.log('🏗️ Extracted from tx accounts - authority:', authority, 'platform:', platformAccount)
  }

  // Look for platform details in subsequent lines (backup)
  for (let j = startIndex + 1; j < Math.min(startIndex + 5, logs.length); j++) {
    const logLine = logs[j]

    const authMatch = logLine.match(/authority: ([A-Za-z0-9]+)/)
    if (authMatch && !authority) {
      authority = authMatch[1]
    }

    const vaultMatch = logLine.match(/fee_vault: ([A-Za-z0-9]+)/)
    if (vaultMatch) {
      feeVault = vaultMatch[1]
    }

    const feeMatch = logLine.match(/fee_basis_points: (\d+)/)
    if (feeMatch) {
      feeBasisPoints = feeMatch[1]
    }
  }

  if (!platformAccount || !authority) {
    console.log('🏗️ Missing required platform fields:', { platformAccount, authority })
    return null
  }

  const blockTimeMs = getTransactionBlockTimeMs(tx)

  return {
    pubkey: platformAccount,
    id: platformAccount, // Platform config ID same as pubkey
    feeBasisPoints: parseInt(feeBasisPoints),
    authority,
    feeVault: feeVault || authority, // Fallback to authority if no fee vault
    totalGamesCreated: 0,
    nextGameId: 0,
    bump: 255, // Default bump for platform config

    // Blockchain metadata
    accountCreatedAt: new Date(blockTimeMs),
    accountUpdatedAt: new Date(blockTimeMs),
    createdSlot: getTransactionSlot(tx),
    updatedSlot: getTransactionSlot(tx),
    lastSignature: getTransactionSignature(tx)
  }
}

/**
 * Parse InitializeGame instruction from multiple log lines
 */
function parseInitializeGameInstruction(tx: ParsedTransactionWithMeta) {
  // Extract accounts from transaction - InitializeGame typically has:
  // [game_account, player_state, authority, config, system_program, clock]
  const accounts = tx.transaction.message.accountKeys || []
  if (accounts.length < 4) {
    console.log('🏗️ InitializeGame: Not enough accounts in transaction')
    return null
  }

  // Extract from transaction accounts instead of relying on logs
  const gameAccount = accounts[0]?.pubkey.toBase58() || ''
  const authority = accounts[2]?.pubkey.toBase58() || ''
  const configId = accounts[3]?.pubkey.toBase58() || ''

  console.log(
    `🏗️ InitializeGame detected - Game: ${gameAccount.slice(0, 8)}..., Authority: ${authority.slice(0, 8)}..., Config: ${configId.slice(0, 8)}...`
  )

  if (!gameAccount || !authority) {
    console.log('🏗️ InitializeGame: Missing gameAccount or authority')
    return null
  }

  // Try to extract game parameters from instruction data or logs
  const gameParams = parseGameParametersFromTransaction(tx)

  // Build game record with placeholder values for blockchain enrichment
  return {
    pubkey: gameAccount,
    gameId: gameParams.gameId || NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    configId: configId || UNKNOWN_ACCOUNT,
    authority,
    bump: gameParams.bump || NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    maxPlayers: gameParams.maxPlayers || NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    currentPlayers: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    currentTurn: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    nextTradeId: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    players: [], // Will be enriched from blockchain
    createdAt: getTransactionBlockTimeMs(tx), // Use transaction timestamp
    // Time fields
    startedAt: null,
    endedAt: null,
    gameEndTime: null,
    gameStatus: 'WaitingForPlayers' as const, // Default status for new games
    turnStartedAt: getTransactionSlot(tx),
    timeLimit: null,
    // Fee and earnings
    entryFee: 0,
    totalPrizePool: 0,
    tokenMint: UNKNOWN_ACCOUNT,
    tokenVault: UNKNOWN_ACCOUNT,
    prizeClaimed: false,
    // Financial state
    bankBalance: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    freeParkingPool: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    // Resources
    housesRemaining: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    hotelsRemaining: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be enriched from blockchain
    // Completion
    winner: null,
    // Initialize properties as empty array - will be populated when properties are created
    properties: [],
    // Initialize trades arrays
    activeTrades: [],
    trades: [],
    // Blockchain metadata
    accountCreatedAt: new Date(),
    accountUpdatedAt: new Date(),
    createdSlot: getTransactionSlot(tx),
    updatedSlot: getTransactionSlot(tx),
    lastSignature: getTransactionSignature(tx)
  }
}

/**
 * Parse game parameters from transaction instruction data or logs
 */
function parseGameParametersFromTransaction(tx: ParsedTransactionWithMeta) {
  const logs = tx.meta?.logMessages || []

  // Default values - CRITICAL: gameId must come from blockchain, not generated by server
  let gameId = NEEDS_BLOCKCHAIN_ENRICHMENT // Never generate gameId on server - always fetch from blockchain
  let maxPlayers = 4
  let bump = 255

  // Try to extract from program logs - BUT NEVER FALLBACK TO HARDCODED gameId
  for (const log of logs) {
    // Look for patterns in logs that contain game parameters
    if (log.includes('max_players') || log.includes('maxPlayers')) {
      const numbers = log.match(/\d+/g)
      if (numbers && numbers.length > 0) {
        maxPlayers = Math.min(parseInt(numbers[0]) || 4, 8) // Cap at 8 players
      }
    }

    // CRITICAL: Only parse gameId if it exists in logs, never fallback to hardcode
    if (log.includes('game_id') || log.includes('gameId')) {
      const numbers = log.match(/\d+/g)
      if (numbers && numbers.length > 0) {
        const parsedGameId = parseInt(numbers[0])
        if (parsedGameId && parsedGameId > 0) {
          gameId = parsedGameId
          console.log(`✅ Found gameId ${gameId} in transaction logs`)
        }
      }
    }

    if (log.includes('bump')) {
      const numbers = log.match(/\d+/g)
      if (numbers && numbers.length > 0) {
        bump = parseInt(numbers[0]) || 255
      }
    }
  }

  return { gameId, maxPlayers, bump }
}

/**
}



/**
 * Parse InitProperty instruction from multiple log lines
 */
function parsePlayerInstruction(tx: ParsedTransactionWithMeta, logs: string[], startIndex: number) {
  let playerAccount = ''
  let wallet = ''
  let gameAccount = ''

  // Try to extract from transaction accounts first
  const accounts = tx.transaction.message.accountKeys || []

  // In JoinGame: [game, player_state, player, system_program, clock]
  if (accounts.length >= 3) {
    gameAccount = accounts[0]?.pubkey.toBase58() || ''
    playerAccount = accounts[1]?.pubkey.toBase58() || ''
    wallet = accounts[2]?.pubkey.toBase58() || ''
    console.log('👤 Extracted from tx accounts - game:', gameAccount, 'player:', playerAccount, 'wallet:', wallet)
  }

  // Extract from starting log as backup - "Player X joined game"
  const startLog = logs[startIndex]

  // Parse "Player [ID] joined game" pattern
  const joinedMatch = startLog.match(/Player ([A-Za-z0-9]+) joined game/)
  if (joinedMatch && !playerAccount) {
    playerAccount = joinedMatch[1]
    wallet = joinedMatch[1] // For now, assume wallet = player ID
  }

  // Look for additional info in logs, but prioritize transaction accounts
  const initialGameAccount = gameAccount // Store initial value from tx accounts

  for (let j = Math.max(0, startIndex - 5); j < Math.min(startIndex + 5, logs.length); j++) {
    const logLine = logs[j]

    // Only parse player and wallet from logs if not already extracted from tx accounts
    const playerMatch = logLine.match(/Player account: ([A-Za-z0-9]+)/) || logLine.match(/player: ([A-Za-z0-9]+)/)
    if (playerMatch && !playerAccount) {
      playerAccount = playerMatch[1]
    }

    const walletMatch = logLine.match(/wallet: ([A-Za-z0-9]+)/)
    if (walletMatch && !wallet) {
      wallet = walletMatch[1]
    }

    // Only parse game from logs if tx accounts failed AND avoid overwriting with player pubkey
    const gameMatch = logLine.match(/Game account: ([A-Za-z0-9]+)/) || logLine.match(/game: ([A-Za-z0-9]+)/)
    if (gameMatch && !initialGameAccount && gameMatch[1] !== playerAccount) {
      gameAccount = gameMatch[1]
    }

    // AVOID: Join game: [ID] parsing as it often contains player ID, not game account
    // The transaction accounts approach is more reliable for JoinGame
  }

  if (!playerAccount || !gameAccount) {
    return null
  }

  // Critical validation: game account should never equal player account
  if (gameAccount === playerAccount) {
    console.log(`🚨 PARSER ERROR: Game account equals player account (${gameAccount}), skipping record`)
    return null
  }

  if (!wallet) {
    wallet = playerAccount // Default fallback
  }

  const blockTimeMs = getTransactionBlockTimeMs(tx)

  // Return minimal data for instruction-based parsing
  // The writer worker will enrich this with actual blockchain data via enrichRecordWithBlockchainData
  return {
    pubkey: playerAccount,
    wallet,
    game: gameAccount,
    cashBalance: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be overridden by blockchain data
    netWorth: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be overridden by blockchain data
    position: NEEDS_BLOCKCHAIN_ENRICHMENT, // Will be overridden by blockchain data
    inJail: false, // Will be overridden by blockchain data
    jailTurns: 0, // Will be overridden by blockchain data
    doublesCount: 0, // Will be overridden by blockchain data
    isBankrupt: false, // Will be overridden by blockchain data
    propertiesOwned: [], // Will be overridden by blockchain data
    getOutOfJailCards: 0, // Will be overridden by blockchain data
    lastRentCollected: 0, // Will be overridden by blockchain data
    festivalBoostTurns: 0, // Will be overridden by blockchain data
    hasRolledDice: false, // Will be overridden by blockchain data
    lastDiceRoll: [0, 0] as [number, number], // Will be overridden by blockchain data
    needsPropertyAction: false, // Will be overridden by blockchain data
    pendingPropertyPosition: null, // Will be overridden by blockchain data
    needsChanceCard: false, // Will be overridden by blockchain data
    needsCommunityChestCard: false, // Will be overridden by blockchain data
    needsBankruptcyCheck: false, // Will be overridden by blockchain data
    needsSpecialSpaceAction: false, // Will be overridden by blockchain data
    pendingSpecialSpacePosition: null, // Will be overridden by blockchain data
    cardDrawnAt: null, // Will be overridden by blockchain data
    accountCreatedAt: new Date(blockTimeMs),
    accountUpdatedAt: new Date(blockTimeMs),
    createdSlot: getTransactionSlot(tx),
    updatedSlot: getTransactionSlot(tx),
    lastSignature: getTransactionSignature(tx)
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Check if transaction contains property-related events
 */
function isPropertyTransaction(logs: string[]): boolean {
  const propertyKeywords = ['property', 'rent', 'house', 'Init property', 'mortgage']

  return logs.some((log) => propertyKeywords.some((keyword) => log.toLowerCase().includes(keyword.toLowerCase())))
}
