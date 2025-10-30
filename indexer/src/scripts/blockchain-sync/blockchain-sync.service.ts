import { Connection, PublicKey } from '@solana/web3.js'
import { DrizzleAdapter } from '#infra/db/drizzle.adapter'
import env from '#config/env'
import { parseGameStateFromBlockchain } from '#infra/rpc/rust-based-mapping'
import { buildEnhancedGameDataFromBuffer, MIN_GAME_STATE_ACCOUNT_SIZE } from '#infra/rpc/account-fetcher'
import { logger } from '#utils/logger'

const GAME_STATE_DISCRIMINATOR = 8684738851132956304n
const PLAYER_STATE_DISCRIMINATOR = 14119929072670475064n
const PLATFORM_CONFIG_DISCRIMINATOR = 11594046615337324192n

export class BlockchainSyncService {
  private connection: Connection
  private programId: PublicKey
  private db: DrizzleAdapter

  constructor(db: DrizzleAdapter) {
    this.connection = new Connection(env.rpc.helius.http)
    this.programId = new PublicKey(env.solana.programId)
    this.db = db
  }

  private toAccountDataBuffer(data: any): Buffer {
    if (Buffer.isBuffer(data)) return data
    if (typeof data === 'string') return Buffer.from(data, 'base64')
    if (Array.isArray(data)) {
      const [base64Data] = data as [string, string?]
      return Buffer.from(base64Data, 'base64')
    }
    if (data?.data) return this.toAccountDataBuffer(data.data)
    throw new Error('Unsupported account data format')
  }

  async syncAllAccounts(): Promise<void> {
    try {
      logger.info('🚀 Starting blockchain sync...')

      // 1. Fetch all program accounts with comprehensive strategy
      const accounts = await this.fetchAllProgramAccountsComprehensive()
      logger.info(`📊 Found ${accounts.length} accounts on blockchain`)

      if (accounts.length === 0) {
        logger.warn('❌ No accounts found on blockchain')
        return
      }

      // 2. (Removed) raw account backup storage

      // 3. Parse and classify accounts (using original robust method)
      const { gameStates, playerStates, platformConfigs } = this.parseAccounts(accounts)

      logger.info(`📋 Parsed accounts:`)
      logger.info(`  🎮 GameStates: ${gameStates.length}`)
      logger.info(`  👤 PlayerStates: ${playerStates.length}`)
      logger.info(`  ⚙️ PlatformConfigs: ${platformConfigs.length}`)

      // 4. Execute database sync with retry mechanism
      await this.syncToDatabaseWithRetry(gameStates, playerStates, platformConfigs)

      logger.info('✅ Comprehensive blockchain crawl completed successfully!')
    } catch (error) {
      logger.error(error, '❌ Blockchain sync failed')
      throw error
    }
  }

  private async fetchAllProgramAccountsComprehensive() {
    logger.info('🔍 Fetching ALL program accounts with comprehensive strategy...')

    // Strategy 1: Direct fetch all accounts
    try {
      const directAccounts = await this.fetchAllProgramAccounts()
      if (directAccounts.length > 0) {
        logger.info(`✅ Direct fetch successful: ${directAccounts.length} accounts`)
        return directAccounts
      }
    } catch (error) {
      logger.warn(`⚠️ Direct fetch failed: ${error}`)
    }

    // Strategy 2: Batch fetch with retries
    return await this.fetchAccountsInBatches()
  }

  private async fetchAllProgramAccounts() {
    logger.info('🔍 Fetching ALL program accounts without any limits...')

    try {
      const accounts = await this.connection.getProgramAccounts(this.programId, {
        encoding: 'base64',
        commitment: 'confirmed',
        // Remove any implicit limits by being explicit
        dataSlice: undefined,
        filters: [] // No filters to get everything
      })

      logger.info(`📊 Raw accounts fetched: ${accounts.length}`)

      // Get current slot for metadata (avoid rate limiting individual account lookups)
      const commitment = 'confirmed'
      const currentSlot = await this.connection.getSlot(commitment)
      const currentTime = Math.floor(Date.now() / 1000)

      const processedAccounts = accounts
        .filter((account) => account.account.data.length > 0)
        .map((account) => ({
          pubkey: account.pubkey.toString(),
          data: this.toAccountDataBuffer(account.account.data),
          lamports: account.account.lamports,
          size: account.account.data.length,
          executable: account.account.executable,
          rentEpoch: account.account.rentEpoch,
          createdSlot: currentSlot,
          updatedSlot: currentSlot,
          lastSignature: null,
          blockTime: currentTime
        }))

      logger.info(`📊 Processed accounts (after filtering empty data): ${processedAccounts.length}`)

      return processedAccounts
    } catch (error) {
      logger.error(`❌ Error fetching program accounts: ${error}`)

      // If normal fetch fails, try with alternative method
      logger.info('🔄 Trying alternative fetch method with multiple requests...')
      return await this.fetchAccountsInBatches()
    }
  }

  private parseAccounts(accounts: any[]) {
    const gameStates: any[] = []
    const playerStates: any[] = []
    const platformConfigs: any[] = []

    for (const account of accounts) {
      try {
        const { pubkey, data } = account

        if (!Buffer.isBuffer(data) || data.length < 8) {
          continue
        }

        const discriminator = data.readBigUInt64LE(0)

        if (discriminator === PLATFORM_CONFIG_DISCRIMINATOR) {
          const config = this.parsePlatformConfig(data)
          platformConfigs.push({
            pubkey,
            ...config,
            createdSlot: account.createdSlot,
            updatedSlot: account.updatedSlot,
            lastSignature: account.lastSignature,
            blockTime: account.blockTime
          })
        } else if (discriminator === PLAYER_STATE_DISCRIMINATOR) {
          const player = this.parsePlayerState(data)
          playerStates.push({
            pubkey,
            ...player,
            createdSlot: account.createdSlot,
            updatedSlot: account.updatedSlot,
            lastSignature: account.lastSignature,
            blockTime: account.blockTime
          })
        } else if (discriminator === GAME_STATE_DISCRIMINATOR) {
          const game = this.parseGameState(data, pubkey)
          if (game !== null) {
            gameStates.push({
              pubkey,
              lamports: account.lamports,
              rentEpoch: account.rentEpoch,
              ...game,
              createdSlot: account.createdSlot,
              updatedSlot: account.updatedSlot,
              lastSignature: account.lastSignature,
              blockTime: account.blockTime
            })
          }
        }
      } catch (error) {
        logger.warn(`Failed to parse account ${account.pubkey}: ${error}`)
      }
    }

    return { gameStates, playerStates, platformConfigs }
  }

  private parsePlatformConfig(data: Buffer) {
    let offset = 8 // Skip discriminator

    const totalGamesRaw = this.readU64(data, offset)
    offset += 8

    const nextGameIdRaw = this.readU64(data, offset)
    offset += 8

    const platformFeeRaw = this.readU64(data, offset)
    offset += 8

    const authority = this.readPubkey(data, offset)
    offset += 32

    // Parse bump field - read from blockchain data or skip if not available
    let bump = 0
    if (data.length > offset) {
      bump = data.readUInt8(offset)
      offset += 1
    } else {
      logger.debug('Bump field not available in blockchain data, using default 0')
    }

    return {
      total_games: this.validateBigInt(totalGamesRaw, 'totalGames'),
      next_game_id: this.validateBigInt(nextGameIdRaw, 'nextGameId'),
      platform_fee: this.validateSmallInt(platformFeeRaw, 'platformFee'),
      authority,
      bump
    }
  }

  private parsePlayerState(data: Buffer) {
    let offset = 8 // Skip discriminator

    // Basic boundary check
    if (data.length < 100) {
      throw new Error(`PlayerState data too small: ${data.length} bytes`)
    }

    const walletAddress = this.readPubkey(data, offset)
    offset += 32

    const gameId = this.readPubkey(data, offset)
    offset += 32

    const cash = this.readU64(data, offset)
    offset += 8

    const position = data.readUInt8(offset)
    offset += 1

    const inJail = data.readUInt8(offset) === 1
    offset += 1

    const jailTurns = data.readUInt8(offset)
    offset += 1

    const doublesCount = data.readUInt8(offset)
    offset += 1

    const isBankrupt = data.readUInt8(offset) === 1
    offset += 1

    // Safer properties array parsing
    if (offset + 4 > data.length) {
      throw new Error(`Cannot read properties length at offset ${offset}, buffer size: ${data.length}`)
    }

    const propertiesLength = data.readUInt32LE(offset)
    offset += 4

    // Validate properties array length - increased limit to handle large properties arrays
    if (propertiesLength > 10000 || offset + propertiesLength > data.length) {
      logger.warn(
        `Large or invalid properties array: length=${propertiesLength}, remaining_bytes=${data.length - offset}`
      )
      throw new Error(`Invalid properties array: length=${propertiesLength}, remaining_bytes=${data.length - offset}`)
    }

    logger.debug(`📋 Parsing properties array with ${propertiesLength} items`)

    // Parse properties owned (array of property indices)
    const propertiesOwned: number[] = []
    const propertiesEndOffset = offset + propertiesLength

    try {
      // Each property is typically 1 byte (property index)
      while (offset < propertiesEndOffset && propertiesOwned.length < propertiesLength) {
        const propertyIndex = data.readUInt8(offset)
        propertiesOwned.push(propertyIndex)
        offset += 1
      }
    } catch (error) {
      // If parsing fails, skip to end of properties array
      offset = propertiesEndOffset
    }

    // Ensure we're at the correct position
    offset = propertiesEndOffset

    // Continue with safer boundary checks
    if (offset >= data.length) {
      throw new Error(`Insufficient data for remaining fields at offset ${offset}`)
    }

    const getOutOfJailCards = data.readUInt8(offset)
    offset += 1

    if (offset + 8 > data.length) {
      throw new Error(`Cannot read netWorth at offset ${offset}`)
    }

    const netWorth = this.readU64(data, offset)
    offset += 8

    if (offset + 8 > data.length) {
      throw new Error(`Cannot read lastRentCollected at offset ${offset}`)
    }

    const lastRentCollected = this.readU64(data, offset)
    offset += 8

    if (offset >= data.length) {
      throw new Error(`Cannot read festivalBoostTurns at offset ${offset}`)
    }

    const festivalBoostTurns = data.readUInt8(offset)
    offset += 1

    if (offset >= data.length) {
      throw new Error(`Cannot read hasRolledDice at offset ${offset}`)
    }

    const hasRolledDice = data.readUInt8(offset) === 1

    return {
      game_id: gameId,
      wallet_address: walletAddress,
      cash: Number(cash),
      position,
      in_jail: inJail,
      jail_turns: jailTurns,
      doubles_count: doublesCount,
      is_bankrupt: isBankrupt,
      properties_owned: JSON.stringify(propertiesOwned),
      get_out_of_jail_cards: getOutOfJailCards,
      net_worth: Number(netWorth),
      last_rent_collected: Number(lastRentCollected),
      festival_boost_turns: festivalBoostTurns,
      has_rolled_dice: hasRolledDice
    }
  }

  private parseGameState(data: Buffer, pubkey: string) {
    const enhanced = buildEnhancedGameDataFromBuffer(data, pubkey)

    if (enhanced) {
      const gameId = this.validateGameId(BigInt(enhanced.gameId))
      if (gameId === null) {
        return null
      }

      const players = enhanced.players ?? []
      const activeTrades = (enhanced.activeTrades ?? []).map((trade) => ({
        id: trade.id,
        proposer: trade.proposer,
        acceptor: trade.receiver
      }))

      const tradesPayload = {
        embedded: enhanced.trades ?? [],
        entry_fee: enhanced.entryFee ?? 0,
        token_mint: enhanced.tokenMint ?? 'UNKNOWN',
        token_vault: enhanced.tokenVault ?? 'UNKNOWN',
        total_prize_pool: enhanced.totalPrizePool ?? 0,
        prize_claimed: enhanced.prizeClaimed ?? false,
        end_condition_met: false,
        end_reason: null,
        created_at: Date.now(),
        started_at: null,
        ended_at: null,
        game_end_time: null,
        player_eliminated: [],
        total_players: enhanced.currentPlayers ?? players.length,
        active_players: enhanced.currentPlayers ?? players.length
      }

      return {
        game_id: gameId,
        config_id: enhanced.configId,
        authority: enhanced.authority,
        bump: enhanced.bump,
        max_players: enhanced.maxPlayers,
        current_players: enhanced.currentPlayers,
        current_turn: enhanced.currentTurn,
        players: JSON.stringify(players),
        game_status: (enhanced.gameStatus as any) ?? 'WaitingForPlayers',
        turn_started_at: enhanced.turnStartedAt ?? 0,
        time_limit: enhanced.timeLimit ?? null,
        created_at: typeof enhanced.createdAt === 'number' ? enhanced.createdAt : null,
        started_at: enhanced.startedAt ?? null,
        ended_at: enhanced.endedAt ?? null,
        game_end_time: enhanced.gameEndTime ?? null,
        bank_balance: this.validateBigInt(BigInt(enhanced.bankBalance ?? 0), 'bankBalance'),
        free_parking_pool: this.validateBigInt(BigInt(enhanced.freeParkingPool ?? 0), 'freeParkingPool'),
        houses_remaining: enhanced.housesRemaining,
        hotels_remaining: enhanced.hotelsRemaining,
        winner: enhanced.winner ?? null,
        next_trade_id: enhanced.nextTradeId ?? 0,
        active_trades: JSON.stringify(activeTrades),
        properties: JSON.stringify(enhanced.properties ?? []),
        trades: JSON.stringify(tradesPayload),
        // Fee-related fields
        entry_fee: this.validateBigInt(BigInt(enhanced.entryFee ?? 0), 'entryFee'),
        token_mint: enhanced.tokenMint ?? 'UNKNOWN',
        token_vault: enhanced.tokenVault ?? 'UNKNOWN',
        total_prize_pool: this.validateBigInt(BigInt(enhanced.totalPrizePool ?? 0), 'totalPrizePool'),
        prize_claimed: enhanced.prizeClaimed ?? false
      }
    }

    if (data.length < MIN_GAME_STATE_ACCOUNT_SIZE) {
      logger.warn(`⚠️ GameState account ${pubkey} too small (${data.length} bytes), skipping`)
      return null
    }

    const parsed = parseGameStateFromBlockchain(data, pubkey)

    if (!parsed) {
      return null
    }

    const gameId = this.validateGameId(BigInt(parsed.gameId))
    if (gameId === null) {
      return null
    }

    const players = parsed.players.map((player) => player.toString())
    const activeTrades = (parsed.activeTrades || []).map((trade) => ({
      id: trade.tradeId,
      proposer: trade.proposer.toString(),
      acceptor: trade.acceptor.toString()
    }))

    const clamp = (value: number | undefined, min: number, max: number, field: string, fallback: number): number => {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        logger.warn(`${field} is invalid (${value}), using fallback ${fallback}`)
        return fallback
      }

      const normalized = Math.trunc(value)

      if (normalized < min || normalized > max) {
        logger.warn(`${field} value ${normalized} outside [${min}, ${max}], clamping`)
        return Math.max(min, Math.min(normalized, max))
      }

      return normalized
    }

    const maxPlayers = clamp(parsed.maxPlayers, 1, 16, 'max_players', 4)
    const currentPlayers = clamp(parsed.currentPlayers, 0, maxPlayers, 'current_players', 0)
    const currentTurn = clamp(parsed.currentTurn, 0, Math.max(maxPlayers - 1, 0), 'current_turn', 0)
    const housesRemaining = clamp(parsed.housesRemaining, 0, 32, 'houses_remaining', 32)
    const hotelsRemaining = clamp(parsed.hotelsRemaining, 0, 12, 'hotels_remaining', 12)
    const nextTradeId = clamp(parsed.nextTradeId ?? 0, 0, 255, 'next_trade_id', 0)

    const gameStatusMap = ['WaitingForPlayers', 'InProgress', 'Finished'] as const
    const gameStatus =
      gameStatusMap[parsed.gameStatus] ??
      (logger.warn(`Unknown game status discriminator: ${parsed.gameStatus}, defaulting to WaitingForPlayers`),
      'WaitingForPlayers')

    return {
      game_id: gameId,
      config_id: parsed.configId.toString(),
      authority: parsed.authority.toString(),
      bump: parsed.bump,
      max_players: maxPlayers,
      current_players: currentPlayers,
      current_turn: currentTurn,
      players: JSON.stringify(players),
      game_status: gameStatus,
      turn_started_at: parsed.turnStartedAt ?? 0,
      time_limit: parsed.timeLimit ?? null,
      created_at: typeof parsed.createdAt === 'number' ? parsed.createdAt : null,
      started_at: parsed.startedAt ?? null,
      ended_at: parsed.endedAt ?? null,
      game_end_time: parsed.gameEndTime ?? null,
      bank_balance: this.validateBigInt(parsed.bankBalance ?? 0n, 'bankBalance'),
      free_parking_pool: this.validateBigInt(parsed.freeParkingPool ?? 0n, 'freeParkingPool'),
      houses_remaining: housesRemaining,
      hotels_remaining: hotelsRemaining,
      winner: parsed.winner ? parsed.winner.toString() : null,
      next_trade_id: nextTradeId,
      active_trades: JSON.stringify(activeTrades),
      properties: JSON.stringify([]),
      trades: JSON.stringify([]),
      // Fee-related fields
      entry_fee: this.validateBigInt(parsed.entryFee ?? 0n, 'entryFee'),
      token_mint: parsed.tokenMint?.toString() || 'UNKNOWN',
      token_vault: parsed.tokenVault?.toString() || 'UNKNOWN',
      total_prize_pool: this.validateBigInt(parsed.totalPrizePool ?? 0n, 'totalPrizePool'),
      prize_claimed: parsed.prizeClaimed ?? false
    }
  }

  private async syncToDatabase(gameStates: any[], playerStates: any[], platformConfigs: any[]) {
    // Sync GameStates
    for (const gameState of gameStates) {
      const query = `
        INSERT INTO game_states (
          pubkey, game_id, config_id, authority, bump, max_players, current_players,
          current_turn, players, game_status, turn_started_at, time_limit, bank_balance,
          free_parking_pool, houses_remaining, hotels_remaining, winner, next_trade_id,
          active_trades, properties, trades, account_created_at, account_updated_at,
          created_slot, updated_slot, last_signature, started_at, ended_at, game_end_time, created_at,
          entry_fee, token_mint, token_vault, total_prize_pool, prize_claimed
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35
        ) ON CONFLICT (pubkey) DO UPDATE SET
          game_id = EXCLUDED.game_id,
          config_id = EXCLUDED.config_id,
          authority = EXCLUDED.authority,
          bank_balance = EXCLUDED.bank_balance,
          current_players = EXCLUDED.current_players,
          game_status = EXCLUDED.game_status,
          free_parking_pool = EXCLUDED.free_parking_pool,
          houses_remaining = EXCLUDED.houses_remaining,
          hotels_remaining = EXCLUDED.hotels_remaining,
          winner = EXCLUDED.winner,
          next_trade_id = EXCLUDED.next_trade_id,
          active_trades = EXCLUDED.active_trades,
          properties = EXCLUDED.properties,
          trades = EXCLUDED.trades,
          started_at = EXCLUDED.started_at,
          ended_at = EXCLUDED.ended_at,
          game_end_time = EXCLUDED.game_end_time,
          created_at = COALESCE(game_states.created_at, EXCLUDED.created_at),
          entry_fee = EXCLUDED.entry_fee,
          token_mint = EXCLUDED.token_mint,
          token_vault = EXCLUDED.token_vault,
          total_prize_pool = EXCLUDED.total_prize_pool,
          prize_claimed = EXCLUDED.prize_claimed,
          account_updated_at = NOW()
      `

      await this.db.query(query, [
        gameState.pubkey,
        gameState.game_id,
        gameState.config_id,
        gameState.authority,
        gameState.bump,
        gameState.max_players,
        gameState.current_players,
        gameState.current_turn,
        gameState.players,
        gameState.game_status,
        gameState.turn_started_at,
        gameState.time_limit,
        gameState.bank_balance,
        gameState.free_parking_pool,
        gameState.houses_remaining,
        gameState.hotels_remaining,
        gameState.winner,
        gameState.next_trade_id,
        gameState.active_trades,
        gameState.properties,
        gameState.trades,
        // Blockchain metadata from account info
        gameState.blockTime ? new Date(gameState.blockTime * 1000) : new Date(),
        new Date(),
        gameState.createdSlot || 0,
        gameState.updatedSlot || 0,
        gameState.lastSignature ?? null,
        gameState.started_at ?? null,
        gameState.ended_at ?? null,
        gameState.game_end_time ?? null,
        typeof gameState.created_at === 'number'
          ? gameState.created_at < 1e12
            ? gameState.created_at * 1000
            : gameState.created_at
          : gameState.blockTime
            ? gameState.blockTime * 1000
            : Date.now(),
        // Fee-related params
        gameState.entry_fee ?? 0,
        gameState.token_mint ?? 'UNKNOWN',
        gameState.token_vault ?? 'UNKNOWN',
        gameState.total_prize_pool ?? 0,
        gameState.prize_claimed ?? false
      ])
    }

    // Sync PlayerStates
    for (const playerState of playerStates) {
      const query = `
        INSERT INTO player_states (
          pubkey, game, wallet, cash_balance, position, in_jail, jail_turns,
          doubles_count, is_bankrupt, properties_owned, get_out_of_jail_cards,
          net_worth, last_rent_collected, festival_boost_turns, has_rolled_dice,
          last_dice_roll, needs_property_action, needs_chance_card, needs_community_chest_card,
          needs_bankruptcy_check, needs_special_space_action, 
          account_created_at, account_updated_at, created_slot, updated_slot, last_signature
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        ) ON CONFLICT (pubkey) DO UPDATE SET
          cash_balance = EXCLUDED.cash_balance,
          position = EXCLUDED.position,
          net_worth = EXCLUDED.net_worth,
          in_jail = EXCLUDED.in_jail,
          properties_owned = EXCLUDED.properties_owned,
          is_bankrupt = EXCLUDED.is_bankrupt,
          account_updated_at = NOW()
      `

      await this.db.query(query, [
        playerState.pubkey,
        playerState.game_id,
        playerState.wallet_address,
        playerState.cash,
        playerState.position,
        playerState.in_jail,
        playerState.jail_turns,
        playerState.doubles_count,
        playerState.is_bankrupt,
        playerState.properties_owned,
        playerState.get_out_of_jail_cards,
        playerState.net_worth,
        playerState.last_rent_collected,
        playerState.festival_boost_turns,
        playerState.has_rolled_dice,
        // Parameters $16-$21: Additional fields we're not using yet
        '[0,0]', // last_dice_roll
        false, // needs_property_action
        false, // needs_chance_card
        false, // needs_community_chest_card
        false, // needs_bankruptcy_check
        false, // needs_special_space_action
        // Parameters $22-$26: Blockchain metadata from account info
        playerState.blockTime ? new Date(playerState.blockTime * 1000) : new Date(),
        new Date(),
        playerState.createdSlot || 0,
        playerState.updatedSlot || 0,
        playerState.lastSignature ?? null
      ])
    }

    // Sync PlatformConfigs
    for (const config of platformConfigs) {
      const query = `
        INSERT INTO platform_configs (
          pubkey, total_games_created, next_game_id, fee_basis_points, authority, id, fee_vault, bump,
          account_created_at, account_updated_at, created_slot, updated_slot, last_signature
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) ON CONFLICT (pubkey) DO UPDATE SET
          total_games_created = EXCLUDED.total_games_created,
          next_game_id = EXCLUDED.next_game_id,
          fee_basis_points = EXCLUDED.fee_basis_points,
          account_updated_at = NOW()
      `

      await this.db.query(query, [
        config.pubkey,
        config.total_games,
        config.next_game_id,
        config.platform_fee,
        config.authority,
        config.pubkey, // id field = pubkey
        config.fee_vault || config.pubkey, // fee_vault field
        config.bump, // bump field from blockchain
        // Blockchain metadata from account info
        config.blockTime ? new Date(config.blockTime * 1000) : new Date(),
        new Date(),
        config.createdSlot || 0,
        config.updatedSlot || 0,
        config.lastSignature ?? null
      ])
    }

    logger.info(
      `📝 Synced to database: ${gameStates.length} GameStates, ${playerStates.length} PlayerStates, ${platformConfigs.length} PlatformConfigs`
    )
  }

  private readU64(buffer: Buffer, offset: number): bigint {
    return buffer.readBigUInt64LE(offset)
  }

  private readI64(buffer: Buffer, offset: number): bigint {
    return buffer.readBigInt64LE(offset)
  }

  private readPubkey(buffer: Buffer, offset: number): string {
    return new PublicKey(buffer.subarray(offset, offset + 32)).toString()
  }

  private validateBigInt(value: bigint, fieldName: string): number {
    const MAX_SAFE_BIGINT = 9223372036854775807n // PostgreSQL bigint max
    const MIN_SAFE_BIGINT = -9223372036854775808n // PostgreSQL bigint min

    if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT) {
      logger.warn(`${fieldName} value ${value} is out of PostgreSQL bigint range, using fallback`)
      // Use a reasonable fallback value
      return value > 0n ? Number(value % 1000000n) : -1
    }

    return Number(value)
  }

  private validateSmallInt(value: bigint, fieldName: string): number {
    const MAX_SMALLINT = 32767
    const MIN_SMALLINT = -32768

    const numValue = Number(value)

    if (numValue > MAX_SMALLINT || numValue < MIN_SMALLINT) {
      logger.warn(`${fieldName} value ${value} is out of PostgreSQL smallint range, using fallback`)
      // Use a reasonable fallback value (5% = 500 basis points)
      return Math.max(0, Math.min(MAX_SMALLINT, numValue % 10000))
    }

    return numValue
  }

  private async fetchAccountsInBatches() {
    logger.info('🔄 Fetching accounts in batches to avoid RPC limits...')

    // Get accounts without any filters to get ALL accounts
    const allAccounts = []

    try {
      // Try fetching all accounts in chunks using different approaches
      logger.info('📦 Attempting to fetch all accounts without size filters...')

      const accounts = await this.connection.getProgramAccounts(this.programId, {
        encoding: 'base64',
        commitment: 'finalized', // Use finalized for more reliable data
        dataSlice: undefined
      })

      logger.info(`✅ Successfully fetched ${accounts.length} accounts`)
      allAccounts.push(...accounts)
    } catch (error) {
      logger.error(`❌ Batch fetch failed: ${error}`)
      logger.info('🔄 Falling back to individual size-based fetches...')

      // Fallback: discover actual account sizes dynamically from blockchain
      const discoveredSizes = await this.discoverAccountSizes()

      for (const size of discoveredSizes) {
        try {
          logger.info(`📦 Fetching accounts with exact size ${size}...`)

          const accounts = await this.connection.getProgramAccounts(this.programId, {
            encoding: 'base64',
            commitment: 'confirmed',
            filters: [{ dataSize: size }]
          })

          logger.info(`  ✅ Found ${accounts.length} accounts of size ${size}`)
          allAccounts.push(...accounts)

          // Add delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 50))
        } catch (sizeError) {
          logger.warn(`⚠️ Failed to fetch accounts of size ${size}: ${sizeError}`)
        }
      }
    }

    logger.info(`📊 Total accounts from batch operation: ${allAccounts.length}`)

    // Remove duplicates based on pubkey
    const uniqueAccounts = allAccounts.filter(
      (account, index, arr) => arr.findIndex((a) => a.pubkey.toString() === account.pubkey.toString()) === index
    )

    logger.info(`📊 Unique accounts after deduplication: ${uniqueAccounts.length}`)

    // Get current slot for consistent metadata
    const commitment = 'confirmed'
    const currentSlot = await this.connection.getSlot(commitment)
    const currentTime = Math.floor(Date.now() / 1000)

    return uniqueAccounts
      .filter((account) => account.account.data.length > 0)
      .map((account) => ({
        pubkey: account.pubkey.toString(),
        data: this.toAccountDataBuffer(account.account.data),
        lamports: account.account.lamports,
        size: account.account.data.length,
        executable: account.account.executable,
        rentEpoch: account.account.rentEpoch,
        // Use current blockchain state for metadata
        createdSlot: currentSlot,
        updatedSlot: currentSlot,
        lastSignature: null,
        blockTime: currentTime
      }))
  }

  private validateGameId(value: bigint): number | null {
    const PG_MAX = 9223372036854775807n

    if (value < 0n) {
      logger.warn(`GameID ${value} is negative, skipping this account`)
      return null
    }

    if (value > PG_MAX) {
      logger.warn(`GameID ${value} exceeds PostgreSQL bigint range, skipping this account`)
      return null
    }

    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      logger.warn(`GameID ${value} exceeds JS safe integer range; precision may be lost when storing in database`)
    }

    return Number(value)
  }

  private async discoverAccountSizes(): Promise<number[]> {
    logger.info('🔍 Discovering actual account sizes from blockchain...')

    try {
      // First, try to get a small sample of accounts to discover sizes
      const sampleAccounts = await this.connection.getProgramAccounts(this.programId, {
        encoding: 'base64',
        commitment: 'confirmed',
        dataSlice: { offset: 0, length: 0 } // Just get metadata, no data
      })

      // Extract unique sizes from the sample
      const sizesSet = new Set<number>()
      sampleAccounts.forEach((account) => {
        sizesSet.add(account.account.data.length)
      })

      const discoveredSizes = Array.from(sizesSet).sort((a, b) => a - b)
      logger.info(`📊 Discovered account sizes: ${discoveredSizes.join(', ')}`)

      return discoveredSizes.length > 0 ? discoveredSizes : [123, 242, 293, 178, 240, 6363] // Fallback only if discovery fails
    } catch (error) {
      logger.warn(`⚠️ Size discovery failed: ${error}, using common sizes as fallback`)
      return [123, 242, 293, 178, 240, 6363]
    }
  }

  // raw_accounts backup removed per data model cleanup
  private async saveRawAccountData(_accounts: any[]): Promise<void> {
    return
  }

  private parseAccountsWithRecovery(accounts: any[]) {
    logger.info('🔧 Parsing accounts with error recovery...')

    const gameStates: any[] = []
    const playerStates: any[] = []
    const platformConfigs: any[] = []
    const failed: any[] = []

    for (const account of accounts) {
      try {
        const parsed = this.parseSingleAccount(account)

        if (parsed.type === 'GameState') {
          gameStates.push(parsed.data)
        } else if (parsed.type === 'PlayerState') {
          playerStates.push(parsed.data)
        } else if (parsed.type === 'PlatformConfig') {
          platformConfigs.push(parsed.data)
        } else {
          failed.push({ account, reason: `Unknown type: ${parsed.type}` })
        }
      } catch (error) {
        failed.push({ account, reason: `Parse error: ${error}` })
        logger.debug(`❌ Failed to parse account ${account.pubkey}: ${error}`)
      }
    }

    return { gameStates, playerStates, platformConfigs, failed }
  }

  private async syncToDatabaseWithRetry(gameStates: any[], playerStates: any[], platformConfigs: any[]): Promise<void> {
    logger.info('🔄 Syncing to database with retry mechanism...')

    const maxRetries = 3
    let attempt = 0

    while (attempt < maxRetries) {
      try {
        await this.syncToDatabase(gameStates, playerStates, platformConfigs)
        return // Success
      } catch (error) {
        attempt++
        logger.warn(`❌ Database sync attempt ${attempt} failed: ${error}`)

        if (attempt >= maxRetries) {
          throw error
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000
        logger.info(`⏳ Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  private parseSingleAccount(account: any) {
    const data = account.data
    const size = data.length

    // Determine account type based on size and discriminator
    if (size >= 8) {
      const discriminator = data.readBigUInt64LE(0)

      if (discriminator === GAME_STATE_DISCRIMINATOR) {
        // GameState
        const game = this.parseGameState(data, account.pubkey)
        if (game !== null) {
          return {
            type: 'GameState',
            data: {
              pubkey: account.pubkey,
              lamports: account.lamports,
              ...game,
              createdSlot: account.createdSlot,
              updatedSlot: account.updatedSlot,
              lastSignature: account.lastSignature,
              blockTime: account.blockTime
            }
          }
        }
      } else if (discriminator === PLAYER_STATE_DISCRIMINATOR) {
        // PlayerState
        const player = this.parsePlayerState(data)
        return {
          type: 'PlayerState',
          data: {
            pubkey: account.pubkey,
            ...player,
            createdSlot: account.createdSlot,
            updatedSlot: account.updatedSlot,
            lastSignature: account.lastSignature,
            blockTime: account.blockTime
          }
        }
      } else if (discriminator === PLATFORM_CONFIG_DISCRIMINATOR) {
        // PlatformConfig
        const config = this.parsePlatformConfig(data)
        return {
          type: 'PlatformConfig',
          data: {
            pubkey: account.pubkey,
            ...config,
            createdSlot: account.createdSlot,
            updatedSlot: account.updatedSlot,
            lastSignature: account.lastSignature,
            blockTime: account.blockTime
          }
        }
      }
    }

    return { type: 'Unknown', data: null }
  }

  private async reportFailedAccounts(failed: any[]): Promise<void> {
    logger.warn(`⚠️ Reporting ${failed.length} failed account parsing attempts`)

    try {
      // Create failed_accounts table if not exists
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS failed_accounts (
          id SERIAL PRIMARY KEY,
          pubkey TEXT NOT NULL,
          reason TEXT NOT NULL,
          data_base64 TEXT NOT NULL,
          size INTEGER NOT NULL,
          reported_at TIMESTAMP DEFAULT NOW()
        )
      `)

      // Insert failed accounts for manual review
      for (const fail of failed) {
        await this.db.query(
          `
          INSERT INTO failed_accounts (pubkey, reason, data_base64, size)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `,
          [fail.account.pubkey, fail.reason, fail.account.data.toString('base64'), fail.account.size]
        )
      }

      logger.info(`📝 Reported ${failed.length} failed accounts for manual review`)
    } catch (error) {
      logger.error(`❌ Failed to report failed accounts: ${error}`)
    }
  }
}
