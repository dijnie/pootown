import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, count, and, gte, desc, asc } from 'drizzle-orm'
import type { DatabasePort, QueryFilters, PaginationOptions, PaginatedResult } from './db.port'
import {
  platformConfigs,
  gameStates,
  playerStates,
  auctionStates,
  gameLogs,
  type NewPlatformConfig,
  type NewGameState,
  type NewPlayerState,
  type NewPropertyState,
  type NewTradeState,
  type NewAuctionState,
  type PlatformConfig,
  type GameState,
  type PlayerState,
  type PropertyState,
  type TradeState,
  type AuctionState,
  type GameLog,
  type NewGameLog,
  type GameLogEntry
} from './schema'
import { logger } from '#utils/logger'

/**
 * PostgreSQL adapter implementation using Drizzle ORM with proper naming
 */
export class DrizzleAdapter implements DatabasePort {
  public pool: Pool
  public db: ReturnType<typeof drizzle>
  public isConnected = false

  constructor() {
    // Khởi tạo lại Pool với cấu hình mới để đảm bảo sử dụng DATABASE_URL mới nhất
    const dbUrl = process.env.DATABASE_URL
    console.log(`Connecting to database with URL pattern: ${dbUrl ? dbUrl.substring(0, 10) + '...' : 'undefined'}`)

    this.pool = new Pool({
      connectionString: dbUrl,
      ssl: {
        rejectUnauthorized: false
      },
      max: 10, // Giảm số lượng kết nối để tránh quá tải
      min: 2, // Maintain minimum connections
      idleTimeoutMillis: 60000, // Increased idle timeout
      connectionTimeoutMillis: 15000, // Increased connection timeout
      application_name: 'monopoly-indexer',
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      query_timeout: 30000,
      statement_timeout: 30000
    })

    // Thêm xử lý lỗi cho pool
    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err)
      // Don't exit process on pool errors, just log them
    })

    this.pool.on('connect', (client) => {
      console.log('New database client connected')
    })

    this.pool.on('acquire', (client) => {
      logger.debug('Database client acquired from pool')
    })

    this.pool.on('remove', (client) => {
      console.log('Database client removed from pool')
    })

    this.db = drizzle(this.pool)
  }

  private buildDirectSupabaseUrl(url?: string): string | null {
    if (!url) return null
    try {
      const parsed = new URL(url)
      const hostname = parsed.hostname

      const envDirectHost = process.env.SUPABASE_DIRECT_DB_HOST
      const projectRef = process.env.SUPABASE_PROJECT_REF

      let directHost: string | null = null

      // Prefer explicit override via env
      if (envDirectHost && envDirectHost.length > 0) {
        directHost = envDirectHost
      } else if (hostname.includes('pooler.supabase.com') && projectRef && projectRef.length > 0) {
        // Build direct host from project ref when original is region pooler
        directHost = `db.${projectRef}.supabase.co`
      } else if (/^db\.[a-z0-9-]{20,}\.supabase\.co$/.test(hostname)) {
        // Already a direct host
        directHost = hostname
      }

      if (!directHost) return null

      parsed.hostname = directHost
      parsed.port = '5432'
      return parsed.toString()
    } catch {
      return null
    }
  }

  async init(): Promise<void> {
    let retryCount = 0
    const maxRetries = 3
    const retryDelay = 2000 // 2 seconds

    while (retryCount < maxRetries) {
      try {
        // Thử kết nối với timeout ngắn hơn để phát hiện lỗi sớm
        const client = await this.pool.connect()
        try {
          await client.query('SELECT 1 as connection_test')
          console.log('✅ Database connection successful')
          this.isConnected = true
          return
        } finally {
          client.release()
        }
      } catch (error) {
        retryCount++
        const errorMsg = this.formatDbError(error)
        console.warn(`Database connection attempt ${retryCount}/${maxRetries} failed: ${errorMsg}`)

        if (retryCount < maxRetries) {
          console.log(`Retrying in ${retryDelay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
          continue
        }

        // Nếu đã thử hết số lần retry, log lỗi và tiếp tục mà không có DB
        console.warn(`⚠️ Database connection failed after ${maxRetries} attempts, continuing without DB`)
        console.warn('Error details:', errorMsg)

        // Kiểm tra các vấn đề phổ biến và đưa ra gợi ý
        if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
          console.warn('💡 Connection refused/not found. Please check:')
          console.warn('   - DATABASE_URL is correct and accessible')
          console.warn('   - Network connectivity to Supabase')
          console.warn('   - Supabase project is active and not paused')
          console.warn('   - Firewall/proxy settings allow database connections')
        }

        if (errorMsg.includes('timeout')) {
          console.warn('💡 Connection timeout. Consider:')
          console.warn('   - Increasing connectionTimeoutMillis in pool config')
          console.warn('   - Checking network latency to database')
        }

        // Keep isConnected=false and allow app to continue
        this.isConnected = false
        return
      }
    }
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    if (!this.isConnected) {
      console.warn('Database not connected, skipping query:', sql.substring(0, 100) + '...')
      return []
    }

    try {
      const result = await this.pool.query(sql, params)
      return result.rows
    } catch (error: any) {
      const errorMsg = this.formatDbError(error)
      console.error('Database query failed:', errorMsg)

      // Check if it's a connection error and mark as disconnected
      if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
        console.warn('Database connection lost, marking as disconnected')
        this.isConnected = false
        return []
      }

      // Nếu lỗi kết nối bị từ chối, thử chuyển sang endpoint direct 5432 và retry
      if (error?.name === 'AggregateError') {
        const fallbackUrl = this.buildDirectSupabaseUrl(process.env.DATABASE_URL)
        if (fallbackUrl) {
          console.warn('Query failed (AggregateError); switching to direct Supabase 5432 and retrying')
          try {
            const newPool = new Pool({
              connectionString: fallbackUrl,
              ssl: { rejectUnauthorized: false },
              max: 10,
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 10000,
              application_name: 'monopoly-indexer',
              keepAlive: true,
              keepAliveInitialDelayMillis: 10000
            })
            newPool.on('error', (err) => {
              console.error('Unexpected database pool error (fallback):', err)
            })

            const client = await newPool.connect()
            try {
              await client.query('SELECT 1')
              this.isConnected = true
            } finally {
              client.release()
            }

            try {
              await this.pool.end()
            } catch (e) {
              console.warn('Failed to end old pool:', e)
            }
            this.pool = newPool
            this.db = drizzle(this.pool)

            const retry = await this.pool.query(sql, params)
            return retry.rows
          } catch (fallbackErr) {
            console.error('Fallback retry failed:', fallbackErr)
            this.isConnected = false
            return []
          }
        }
      }

      throw new Error(`Raw query failed: ${errorMsg}`)
    }
  }

  // ==================== PLATFORM CONFIG OPERATIONS ====================

  async upsertPlatformConfig(config: NewPlatformConfig): Promise<void> {
    if (!this.isConnected) {
      console.warn('Database not connected, skipping platform config upsert for:', config.pubkey)
      return
    }

    const processedConfig = this.processDateFields(config)

    try {
      await this.db
        .insert(platformConfigs)
        .values(processedConfig)
        .onConflictDoUpdate({
          target: platformConfigs.pubkey,
          set: {
            ...processedConfig,
            accountUpdatedAt: new Date()
          }
        })
    } catch (error) {
      const errorMsg = this.formatDbError(error)
      console.error(`Failed to upsert platform config: ${errorMsg}`)

      // Check if it's a connection error
      if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
        this.isConnected = false
        return
      }

      throw new Error(`Failed to upsert platform config ${config.pubkey}: ${errorMsg}`)
    }
  }

  async getPlatformConfig(pubkey: string): Promise<PlatformConfig | null> {
    if (!this.isConnected) {
      console.warn('Database not connected, returning null for platform config:', pubkey)
      return null
    }

    try {
      const result = await this.db.select().from(platformConfigs).where(eq(platformConfigs.pubkey, pubkey)).limit(1)
      return result[0] ?? null
    } catch (error) {
      const errorMsg = this.formatDbError(error)
      console.error(`Failed to get platform config: ${errorMsg}`)

      // Check if it's a connection error
      if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
        this.isConnected = false
        return null
      }

      throw new Error(`Failed to get platform config ${pubkey}: ${errorMsg}`)
    }
  }

  async getPlatformConfigs(
    filters: QueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PlatformConfig>> {
    return this.executeFilteredQuery(platformConfigs, filters, pagination, this.buildPlatformConfigFilters)
  }

  // ==================== GAME STATE OPERATIONS ====================

  async upsertGameState(gameState: NewGameState): Promise<void> {
    if (!this.isConnected) {
      console.warn('Database not connected, skipping game state upsert for:', gameState.pubkey)
      return
    }

    const processedGameState = this.processDateFields(gameState)

    try {
      // Auto-create platform config if it doesn't exist
      if (gameState.configId && gameState.configId !== 'UNKNOWN') {
        await this.ensurePlatformConfigExists(gameState.configId)

        // Calculate actual gameId from platform config if placeholder value
        if (processedGameState.gameId === -1) {
          processedGameState.gameId = await this.calculateGameId(gameState.configId)
        }
      }

      // Xử lý dữ liệu JSON lớn
      // Giới hạn kích thước của các trường JSON
      if (processedGameState.properties && Array.isArray(processedGameState.properties)) {
        // Giữ lại thông tin cần thiết, loại bỏ dữ liệu không cần thiết
        processedGameState.properties = processedGameState.properties.map((prop) => ({
          pubkey: prop.pubkey,
          game: prop.game,
          position: prop.position,
          owner: prop.owner,
          price: prop.price,
          colorGroup: prop.colorGroup,
          propertyType: prop.propertyType,
          houses: prop.houses,
          hasHotel: prop.hasHotel,
          isMortgaged: prop.isMortgaged,
          rentBase: prop.rentBase || 0,
          rentWithColorGroup: prop.rentWithColorGroup || 0,
          rentWithHouses: prop.rentWithHouses || [0, 0, 0, 0],
          rentWithHotel: prop.rentWithHotel || 0,
          houseCost: prop.houseCost || 0,
          mortgageValue: prop.mortgageValue || 0,
          lastRentPaid: prop.lastRentPaid,
          init: prop.init
        }))
      }

      // Sử dụng raw query để tránh lỗi khi dữ liệu quá lớn
      const query = `
        INSERT INTO game_states (
          pubkey, game_id, config_id, authority, bump, max_players, 
          current_players, current_turn, players, created_at, game_status, 
          turn_started_at, time_limit, bank_balance, free_parking_pool, 
          houses_remaining, hotels_remaining, winner, next_trade_id, 
          active_trades, properties, trades, account_created_at, 
          account_updated_at, created_slot, updated_slot, last_signature, started_at, ended_at, game_end_time,
          entry_fee, token_mint, token_vault, total_prize_pool, prize_claimed
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
        ON CONFLICT (pubkey) DO UPDATE SET
          game_id = $2,
          config_id = $3,
          authority = $4,
          bump = $5,
          max_players = $6,
          current_players = $7,
          current_turn = $8,
          players = $9,
          created_at = COALESCE(game_states.created_at, EXCLUDED.created_at),
          game_status = $11,
          turn_started_at = $12,
          time_limit = $13,
          bank_balance = $14,
          free_parking_pool = $15,
          houses_remaining = $16,
          hotels_remaining = $17,
          winner = $18,
          next_trade_id = $19,
          active_trades = $20,
          properties = $21,
          trades = $22,
          account_created_at = COALESCE(game_states.account_created_at, EXCLUDED.account_created_at),
          account_updated_at = $24,
          created_slot = $25,
          updated_slot = $26,
          last_signature = $27,
          started_at = $28,
          ended_at = $29,
          game_end_time = $30,
          entry_fee = $31,
          token_mint = $32,
          token_vault = $33,
          total_prize_pool = $34,
          prize_claimed = $35
      `

      // Chuẩn bị các tham số
      console.info('🧾 upsertGameState createdAt payload', {
        pubkey: processedGameState.pubkey,
        createdAt: processedGameState.createdAt,
        createdAtType: typeof processedGameState.createdAt
      })

      // Validate createdAt to fit PostgreSQL bigint range and be finite
      const PG_BIGINT_MAX = Number(9223372036854775807n)
      const PG_BIGINT_MIN = Number(-9223372036854775808n)
      let createdAtInsert = processedGameState.createdAt as number
      if (
        typeof createdAtInsert !== 'number' ||
        !Number.isFinite(createdAtInsert) ||
        createdAtInsert < PG_BIGINT_MIN ||
        createdAtInsert > PG_BIGINT_MAX
      ) {
        console.warn('⚠️ Invalid createdAt detected; applying fallback', {
          pubkey: processedGameState.pubkey,
          createdAt: processedGameState.createdAt
        })
        const tsFallback = (() => {
          const t = processedGameState.turnStartedAt as number
          if (typeof t === 'number' && Number.isFinite(t) && t >= PG_BIGINT_MIN && t <= PG_BIGINT_MAX) {
            return t
          }
          return Date.now()
        })()
        createdAtInsert = tsFallback
        console.info('✅ Using fallback createdAt for insert', {
          pubkey: processedGameState.pubkey,
          createdAt: createdAtInsert
        })
      }

      const params = [
        processedGameState.pubkey,
        processedGameState.gameId,
        processedGameState.configId,
        processedGameState.authority,
        processedGameState.bump,
        processedGameState.maxPlayers,
        processedGameState.currentPlayers,
        processedGameState.currentTurn,
        JSON.stringify(processedGameState.players || []),
        createdAtInsert,
        processedGameState.gameStatus,
        processedGameState.turnStartedAt,
        processedGameState.timeLimit,
        processedGameState.bankBalance,
        processedGameState.freeParkingPool,
        processedGameState.housesRemaining,
        processedGameState.hotelsRemaining,
        processedGameState.winner,
        processedGameState.nextTradeId,
        JSON.stringify(processedGameState.activeTrades || []),
        JSON.stringify(processedGameState.properties || []),
        JSON.stringify(processedGameState.trades || []),
        processedGameState.accountCreatedAt,
        processedGameState.accountUpdatedAt || new Date(),
        processedGameState.createdSlot,
        processedGameState.updatedSlot,
        processedGameState.lastSignature,
        processedGameState.startedAt ?? null,
        processedGameState.endedAt ?? null,
        processedGameState.gameEndTime ?? null,
        // Fee-related params
        processedGameState.entryFee ?? 0,
        processedGameState.tokenMint ?? 'UNKNOWN',
        processedGameState.tokenVault ?? 'UNKNOWN',
        processedGameState.totalPrizePool ?? 0,
        processedGameState.prizeClaimed ?? false
      ]

      // Thực hiện truy vấn
      await this.pool.query(query, params)
    } catch (error) {
      const errorMsg = this.formatDbError(error)
      console.error(`Error details for game state ${gameState.pubkey}:`, errorMsg)

      // Check if it's a connection error and mark as disconnected
      if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
        console.warn('Database connection lost during game state upsert, marking as disconnected')
        this.isConnected = false
        return
      }

      // Ghi log lỗi nhưng không dừng quá trình xử lý
      console.warn(`⚠️ Failed to upsert game state ${gameState.pubkey}, continuing with processing: ${errorMsg}`)
    }
  }

  private async ensurePlatformConfigExists(configId: string): Promise<void> {
    try {
      // Check if platform config already exists
      const existing = await this.db
        .select({ id: platformConfigs.id })
        .from(platformConfigs)
        .where(eq(platformConfigs.id, configId))
        .limit(1)

      if (existing.length === 0) {
        // Create fallback platform config to prevent blocking gameState processing
        console.warn(`⚠️ Platform config ${configId} not found - creating fallback to unblock processing`)

        const fallbackConfig = {
          id: configId,
          pubkey: configId,
          feeBasisPoints: 500, // Default 5% fee
          authority: configId, // Placeholder - will be enriched later
          feeVault: configId, // Placeholder - will be enriched later
          totalGamesCreated: 0,
          nextGameId: 0,
          bump: 255, // Placeholder bump
          accountCreatedAt: new Date(),
          accountUpdatedAt: new Date(),
          createdSlot: 0,
          updatedSlot: 0,
          lastSignature: null
        }

        await this.db.insert(platformConfigs).values(fallbackConfig).onConflictDoNothing()
        console.info(`✅ Created fallback platform config ${configId}`)
      }
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (err.message?.includes('RETRYABLE:')) {
        throw error // Re-throw retryable errors
      }
      console.warn(`Failed to check platform config exists: ${error}`)
      // Don't throw non-retryable errors - let gameState insert continue
    }
  }

  private async calculateGameId(configId: string): Promise<number> {
    try {
      // GameId should come from blockchain data, not calculated here
      // This method is only called when gameId is placeholder (-1)
      // In proper implementation, gameId should be extracted from GameState account data

      console.warn(`⚠️ GameId calculation should not be needed - gameId should come from blockchain`)
      console.warn(`⚠️ This indicates incomplete blockchain data parsing for config ${configId}`)

      // Return 0 as fallback, but this should be addressed in account parsing
      return 0
    } catch (error) {
      console.warn(`Failed to process gameId for config ${configId}: ${error}`)
      return 0
    }
  }

  async getGameState(pubkey: string): Promise<GameState | null> {
    try {
      const result = await this.db.select().from(gameStates).where(eq(gameStates.pubkey, pubkey)).limit(1)
      return result[0] ?? null
    } catch (error) {
      throw new Error(`Failed to get game state ${pubkey}: ${error}`)
    }
  }

  async checkGameExists(pubkey: string): Promise<boolean> {
    try {
      const result = await this.db
        .select({ pubkey: gameStates.pubkey })
        .from(gameStates)
        .where(eq(gameStates.pubkey, pubkey))
        .limit(1)
      return result.length > 0
    } catch (error) {
      throw new Error(`Failed to check game existence ${pubkey}: ${error}`)
    }
  }

  async getGameStates(
    filters: QueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<GameState>> {
    return this.executeFilteredQuery(gameStates, filters, pagination, this.buildGameStateFilters)
  }

  async getAllGameStates(): Promise<GameState[]> {
    try {
      return await this.db.select().from(gameStates)
    } catch (error) {
      throw new Error(`Failed to get all game states: ${error}`)
    }
  }

  async updateGameState(pubkey: string, updates: Partial<NewGameState>): Promise<void> {
    try {
      const processedUpdates = this.processDateFields(updates)
      await this.db
        .update(gameStates)
        .set({
          ...processedUpdates,
          accountUpdatedAt: new Date()
        })
        .where(eq(gameStates.pubkey, pubkey))
    } catch (error) {
      throw new Error(`Failed to update game state ${pubkey}: ${error}`)
    }
  }

  // ==================== PLAYER STATE OPERATIONS ====================

  async upsertPlayerState(playerState: NewPlayerState): Promise<void> {
    if (!this.isConnected) {
      console.warn('Database not connected, skipping player state upsert for:', playerState.pubkey)
      return
    }

    const processedPlayerState = this.processDateFields(playerState)

    try {
      await this.db
        .insert(playerStates)
        .values(processedPlayerState)
        .onConflictDoUpdate({
          target: playerStates.pubkey,
          set: {
            ...processedPlayerState,
            accountUpdatedAt: new Date()
          }
        })
    } catch (error) {
      const errorMsg = this.formatDbError(error)
      console.error(`Failed to upsert player state: ${errorMsg}`)

      // Check if it's a connection error
      if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
        this.isConnected = false
        return
      }

      throw new Error(`Failed to upsert player state ${playerState.pubkey}: ${errorMsg}`)
    }
  }

  async bulkUpsertPlayerStates(states: NewPlayerState[]): Promise<void> {
    if (!this.isConnected) {
      console.warn('Database not connected, skipping bulk player states upsert for batch of:', states.length)
      return
    }
    if (!Array.isArray(states) || states.length === 0) return

    const batch = states.map((s) => this.processDateFields(s))

    // Column order must match VALUES tuple order below
    const columns = [
      'pubkey',
      'wallet',
      'game',
      'cash_balance',
      'net_worth',
      'position',
      'in_jail',
      'jail_turns',
      'doubles_count',
      'is_bankrupt',
      'properties_owned',
      'get_out_of_jail_cards',
      'last_rent_collected',
      'festival_boost_turns',
      'has_rolled_dice',
      'last_dice_roll',
      'needs_property_action',
      'pending_property_position',
      'needs_chance_card',
      'needs_community_chest_card',
      'needs_bankruptcy_check',
      'needs_special_space_action',
      'pending_special_space_position',
      'card_drawn_at',
      'account_created_at',
      'account_updated_at',
      'created_slot',
      'updated_slot',
      'last_signature'
    ]

    // Build parameterized placeholders
    const valuePlaceholders: string[] = []
    const params: any[] = []
    let p = 1
    for (const row of batch) {
      valuePlaceholders.push(`(${columns.map(() => `$${p++}`).join(', ')})`)
      // push params in same order as columns
      params.push(
        (row as any).pubkey,
        (row as any).wallet,
        (row as any).game,
        (row as any).cashBalance,
        (row as any).netWorth,
        (row as any).position,
        (row as any).inJail,
        (row as any).jailTurns,
        (row as any).doublesCount,
        (row as any).isBankrupt,
        (row as any).propertiesOwned,
        (row as any).getOutOfJailCards,
        (row as any).lastRentCollected,
        (row as any).festivalBoostTurns,
        (row as any).hasRolledDice,
        (row as any).lastDiceRoll,
        (row as any).needsPropertyAction,
        (row as any).pendingPropertyPosition ?? null,
        (row as any).needsChanceCard,
        (row as any).needsCommunityChestCard,
        (row as any).needsBankruptcyCheck,
        (row as any).needsSpecialSpaceAction,
        (row as any).pendingSpecialSpacePosition ?? null,
        (row as any).cardDrawnAt ?? null,
        (row as any).accountCreatedAt,
        (row as any).accountUpdatedAt,
        (row as any).createdSlot,
        (row as any).updatedSlot,
        (row as any).lastSignature ?? null
      )
    }

    const sql = `
      INSERT INTO player_states (${columns.join(',')})
      VALUES ${valuePlaceholders.join(',')}
      ON CONFLICT (pubkey) DO UPDATE SET
        wallet = EXCLUDED.wallet,
        game = EXCLUDED.game,
        cash_balance = EXCLUDED.cash_balance,
        net_worth = EXCLUDED.net_worth,
        position = EXCLUDED.position,
        in_jail = EXCLUDED.in_jail,
        jail_turns = EXCLUDED.jail_turns,
        doubles_count = EXCLUDED.doubles_count,
        is_bankrupt = EXCLUDED.is_bankrupt,
        properties_owned = EXCLUDED.properties_owned,
        get_out_of_jail_cards = EXCLUDED.get_out_of_jail_cards,
        last_rent_collected = EXCLUDED.last_rent_collected,
        festival_boost_turns = EXCLUDED.festival_boost_turns,
        has_rolled_dice = EXCLUDED.has_rolled_dice,
        last_dice_roll = EXCLUDED.last_dice_roll,
        needs_property_action = EXCLUDED.needs_property_action,
        pending_property_position = EXCLUDED.pending_property_position,
        needs_chance_card = EXCLUDED.needs_chance_card,
        needs_community_chest_card = EXCLUDED.needs_community_chest_card,
        needs_bankruptcy_check = EXCLUDED.needs_bankruptcy_check,
        needs_special_space_action = EXCLUDED.needs_special_space_action,
        pending_special_space_position = EXCLUDED.pending_special_space_position,
        card_drawn_at = EXCLUDED.card_drawn_at,
        account_created_at = EXCLUDED.account_created_at,
        account_updated_at = NOW(),
        created_slot = EXCLUDED.created_slot,
        updated_slot = EXCLUDED.updated_slot,
        last_signature = EXCLUDED.last_signature;
    `

    try {
      await this.pool.query(sql, params)
    } catch (error) {
      const errorMsg = this.formatDbError(error)
      console.error(`Failed bulk upsert player states: ${errorMsg}`)
      if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
        this.isConnected = false
        return
      }
      throw new Error(`Failed bulk upsert player states: ${errorMsg}`)
    }
  }

  async getPlayerState(pubkey: string): Promise<PlayerState | null> {
    if (!this.isConnected) {
      console.warn('Database not connected, returning null for player state:', pubkey)
      return null
    }

    try {
      const result = await this.db.select().from(playerStates).where(eq(playerStates.pubkey, pubkey)).limit(1)
      return result[0] ?? null
    } catch (error) {
      const errorMsg = this.formatDbError(error)
      console.error(`Failed to get player state: ${errorMsg}`)

      // Check if it's a connection error
      if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
        this.isConnected = false
        return null
      }

      throw new Error(`Failed to get player state ${pubkey}: ${errorMsg}`)
    }
  }

  async getPlayerStates(
    filters: QueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PlayerState>> {
    return this.executeFilteredQuery(playerStates, filters, pagination, this.buildPlayerStateFilters)
  }

  // ==================== PROPERTY STATE OPERATIONS ====================

  async upsertPropertyState(propertyState: NewPropertyState): Promise<void> {
    const processed = this.processDateFields(propertyState)

    const targetGamePubkey = (processed as any).game as string | undefined
    if (!targetGamePubkey) {
      throw new Error(`Failed to upsert property state ${propertyState.pubkey}: missing game pubkey for embedding`)
    }

    try {
      const games = await this.db.select().from(gameStates).where(eq(gameStates.pubkey, targetGamePubkey)).limit(1)
      const game = games[0] as any
      if (!game) {
        // Log more details for debugging
        console.warn(`⚠️ Target game ${targetGamePubkey} not found for property ${propertyState.pubkey}`)
        console.warn(`⚠️ This might be a race condition - game may not be processed yet`)
        console.warn(`⚠️ Property details:`, {
          property: propertyState.pubkey,
          position: propertyState.position,
          owner: propertyState.owner
        })

        // Throw a retryable error - this will be handled by the worker with exponential backoff
        throw new Error(
          `RETRYABLE: Target game ${targetGamePubkey} not found for property ${propertyState.pubkey} - likely race condition`
        )
      }

      const currentList: PropertyState[] = game.properties ?? []
      const nextList = updateEmbeddedPropertyList(currentList, processed)

      await this.db
        .update(gameStates)
        .set({ properties: nextList as any, accountUpdatedAt: new Date() })
        .where(eq(gameStates.pubkey, targetGamePubkey))
    } catch (error) {
      throw new Error(`Failed to upsert property state ${propertyState.pubkey}: ${error}`)
    }
  }

  async getPropertyState(pubkey: string): Promise<PropertyState | null> {
    try {
      const games = (await this.db.select().from(gameStates)) as any[]
      for (const game of games) {
        const props: PropertyState[] = game.properties ?? []
        const found = props.find((p) => p.pubkey === pubkey)
        if (found) return { ...found, game: game.pubkey }
      }
      return null
    } catch (error) {
      throw new Error(`Failed to get property state ${pubkey}: ${error}`)
    }
  }

  async getPropertyStates(
    filters: QueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PropertyState>> {
    try {
      const page = pagination.page ?? 1
      const limit = Math.min(pagination.limit ?? 20, 100)
      const offset = (page - 1) * limit

      let games: any[]
      if (filters.game) {
        games = (await this.db
          .select()
          .from(gameStates)
          .where(eq(gameStates.pubkey, filters.game as string))) as any[]
      } else {
        games = (await this.db.select().from(gameStates)) as any[]
      }

      let all: PropertyState[] = []
      for (const g of games) {
        const props: PropertyState[] = g.properties ?? []
        all = all.concat(props.map((p) => ({ ...p, game: g.pubkey }) as any))
      }

      const predicates = this.buildEmbeddedPropertyPredicates(filters)
      const filtered = all.filter((p) => predicates.every((fn) => fn(p)))

      const sortBy = (pagination.sortBy as keyof PropertyState) || 'accountUpdatedAt'
      const sortOrder = pagination.sortOrder === 'asc' ? 1 : -1
      filtered.sort((a: any, b: any) => {
        const av = a?.[sortBy]
        const bv = b?.[sortBy]
        if (av === bv) return 0
        return av > bv ? sortOrder : -sortOrder
      })

      const data = filtered.slice(offset, offset + limit)
      return { data, total: filtered.length, page, limit }
    } catch (error) {
      throw new Error(`Failed to get property states: ${error}`)
    }
  }

  // ==================== TRADE STATE OPERATIONS ====================

  async upsertTradeState(tradeState: NewTradeState): Promise<void> {
    const processed = this.processDateFields(tradeState)

    const targetGamePubkey = (processed as any).game as string | undefined
    if (!targetGamePubkey) {
      throw new Error(`Failed to upsert trade state ${tradeState.pubkey}: missing game pubkey for embedding`)
    }

    try {
      const games = await this.db.select().from(gameStates).where(eq(gameStates.pubkey, targetGamePubkey)).limit(1)
      const game = games[0] as any
      if (!game) {
        // Log more details for debugging
        console.warn(`⚠️ Target game ${targetGamePubkey} not found for trade ${tradeState.pubkey}`)
        console.warn(`⚠️ This might be a race condition - game may not be processed yet`)
        console.warn(`⚠️ Trade details:`, {
          trade: tradeState.pubkey,
          proposer: tradeState.proposer,
          receiver: tradeState.receiver,
          status: tradeState.status
        })

        // Throw a retryable error instead of skipping - this will allow the job to be retried
        throw new Error(
          `RETRYABLE: Target game ${targetGamePubkey} not found for trade ${tradeState.pubkey} - likely race condition`
        )
      }

      const currentList: TradeState[] = game.trades ?? []
      const nextList = updateEmbeddedTradeList(currentList, processed)

      await this.db
        .update(gameStates)
        .set({ trades: nextList as any, accountUpdatedAt: new Date() })
        .where(eq(gameStates.pubkey, targetGamePubkey))
    } catch (error) {
      throw new Error(`Failed to upsert trade state ${tradeState.pubkey}: ${error}`)
    }
  }

  async getTradeState(pubkey: string): Promise<TradeState | null> {
    try {
      const games = (await this.db.select().from(gameStates)) as any[]
      for (const game of games) {
        const trades: TradeState[] = game.trades ?? []
        const found = trades.find((t) => t.pubkey === pubkey)
        if (found) return { ...found, game: game.pubkey }
      }
      return null
    } catch (error) {
      throw new Error(`Failed to get trade state ${pubkey}: ${error}`)
    }
  }

  async getTradeStates(
    filters: QueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    try {
      const page = pagination.page ?? 1
      const limit = Math.min(pagination.limit ?? 20, 100)
      const offset = (page - 1) * limit

      let games: any[]
      if (filters.game) {
        games = (await this.db
          .select()
          .from(gameStates)
          .where(eq(gameStates.pubkey, filters.game as string))) as any[]
      } else {
        games = (await this.db.select().from(gameStates)) as any[]
      }

      let all: TradeState[] = []
      for (const g of games) {
        const trades: TradeState[] = g.trades ?? []
        all = all.concat(trades.map((t) => ({ ...t, game: g.pubkey }) as any))
      }

      const predicates = this.buildEmbeddedTradePredicates(filters)
      const filtered = all.filter((t) => predicates.every((fn) => fn(t)))

      const sortBy = (pagination.sortBy as keyof TradeState) || 'accountUpdatedAt'
      const sortOrder = pagination.sortOrder === 'asc' ? 1 : -1
      filtered.sort((a: any, b: any) => {
        const av = a?.[sortBy]
        const bv = b?.[sortBy]
        if (av === bv) return 0
        return av > bv ? sortOrder : -sortOrder
      })

      const data = filtered.slice(offset, offset + limit)
      return { data, total: filtered.length, page, limit }
    } catch (error) {
      throw new Error(`Failed to get trade states: ${error}`)
    }
  }

  // ==================== AUCTION STATE OPERATIONS ====================

  async upsertAuctionState(auctionState: NewAuctionState): Promise<void> {
    if (!this.isConnected) {
      console.warn('Database not connected, skipping auction state upsert for:', auctionState.pubkey)
      return
    }

    const processedAuctionState = this.processDateFields(auctionState)

    try {
      await this.db
        .insert(auctionStates)
        .values(processedAuctionState)
        .onConflictDoUpdate({
          target: auctionStates.pubkey,
          set: {
            ...processedAuctionState,
            accountUpdatedAt: new Date()
          }
        })
    } catch (error) {
      const errorMsg = this.formatDbError(error)
      console.error(`Failed to upsert auction state: ${errorMsg}`)

      // Check if it's a connection error
      if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
        this.isConnected = false
        return
      }

      throw new Error(`Failed to upsert auction state ${auctionState.pubkey}: ${errorMsg}`)
    }
  }

  async getAuctionState(pubkey: string): Promise<AuctionState | null> {
    if (!this.isConnected) {
      console.warn('Database not connected, returning null for auction state:', pubkey)
      return null
    }

    try {
      const result = await this.db.select().from(auctionStates).where(eq(auctionStates.pubkey, pubkey)).limit(1)
      return result[0] ?? null
    } catch (error) {
      const errorMsg = this.formatDbError(error)
      console.error(`Failed to get auction state: ${errorMsg}`)

      // Check if it's a connection error
      if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
        this.isConnected = false
        return null
      }

      throw new Error(`Failed to get auction state ${pubkey}: ${errorMsg}`)
    }
  }

  async getAuctionStates(
    filters: QueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<AuctionState>> {
    return this.executeFilteredQuery(auctionStates, filters, pagination, this.buildAuctionStateFilters)
  }

  // ==================== GAME LOG OPERATIONS ====================

  async createGameLog(
    log: Omit<NewGameLog, 'id' | 'createdAt' | 'accountCreatedAt' | 'accountUpdatedAt'>
  ): Promise<GameLog> {
    const logData = {
      ...log,
      timestamp: log.timestamp || Date.now()
    }

    try {
      const result = await this.db.insert(gameLogs).values(logData).returning()
      return result[0]
    } catch (error) {
      throw new Error(`Failed to create game log: ${error}`)
    }
  }

  async getGameLogs(
    gameId: string,
    filters: QueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<GameLog>> {
    const gameFilters = { ...filters, gameId }
    return this.executeFilteredQuery(gameLogs, gameFilters, pagination, this.buildGameLogFilters)
  }

  async getGameLogsAsEntries(
    gameId: string,
    filters: QueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<GameLogEntry>> {
    const result = await this.getGameLogs(gameId, filters, pagination)

    const entries: GameLogEntry[] = result.data.map((log) => ({
      id: log.id,
      timestamp: Number(log.timestamp),
      type: log.type,
      playerId: log.playerId,
      playerName: log.playerName || undefined,
      message: log.message,
      details: {
        propertyName: log.propertyName || undefined,
        position: log.position || undefined,
        price: log.price ? Number(log.price) : undefined,
        owner: log.owner || undefined,
        cardType: log.cardType as 'chance' | 'community-chest' | undefined,
        cardTitle: log.cardTitle || undefined,
        cardDescription: log.cardDescription || undefined,
        cardIndex: log.cardIndex || undefined,
        effectType: log.effectType || undefined,
        amount: log.amount ? Number(log.amount) : undefined,
        tradeId: log.tradeId || undefined,
        action: log.action || undefined,
        targetPlayer: log.targetPlayer || undefined,
        targetPlayerName: log.targetPlayerName || undefined,
        offeredProperties: log.offeredProperties || undefined,
        requestedProperties: log.requestedProperties || undefined,
        offeredMoney: log.offeredMoney ? Number(log.offeredMoney) : undefined,
        requestedMoney: log.requestedMoney ? Number(log.requestedMoney) : undefined,
        fromPosition: log.fromPosition || undefined,
        toPosition: log.toPosition || undefined,
        diceRoll: log.diceRoll as [number, number] | undefined,
        doublesCount: log.doublesCount || undefined,
        passedGo: log.passedGo || undefined,
        jailReason: log.jailReason as 'doubles' | 'go_to_jail' | 'card' | undefined,
        fineAmount: log.fineAmount ? Number(log.fineAmount) : undefined,
        buildingType: log.buildingType as 'house' | 'hotel' | undefined,
        taxType: log.taxType || undefined,
        signature: log.signature || undefined,
        error: log.error || undefined
      }
    }))

    return {
      data: entries,
      total: result.total,
      page: result.page,
      limit: result.limit
    }
  }

  async deleteGameLogs(gameId: string): Promise<void> {
    try {
      await this.db.delete(gameLogs).where(eq(gameLogs.gameId, gameId))
    } catch (error) {
      throw new Error(`Failed to delete game logs for game ${gameId}: ${error}`)
    }
  }

  // ==================== PRIVATE UTILITY METHODS ====================

  private processDateFields<T extends object>(data: T): T {
    const processed = { ...data } as any

    if ('accountCreatedAt' in processed && typeof processed.accountCreatedAt === 'string') {
      processed.accountCreatedAt = new Date(processed.accountCreatedAt)
    }

    if ('accountUpdatedAt' in processed && typeof processed.accountUpdatedAt === 'string') {
      processed.accountUpdatedAt = new Date(processed.accountUpdatedAt)
    }

    // Do NOT convert numeric `createdAt` fields to Date.
    // Some payloads may accidentally send `createdAt` as a string; normalize to number.
    if ('createdAt' in processed && typeof processed.createdAt === 'string') {
      const maybeNum = Number(processed.createdAt)
      processed.createdAt = Number.isFinite(maybeNum) ? maybeNum : processed.createdAt
    }

    return processed as T
  }

  private async executeFilteredQuery<T extends Record<string, unknown>>(
    table: any,
    filters: QueryFilters,
    pagination: PaginationOptions,
    filterBuilder: (filters: QueryFilters) => any[]
  ): Promise<PaginatedResult<T>> {
    try {
      const page = Math.max(1, pagination.page ?? 1)
      const limit = Math.min(pagination.limit ?? 20, 100)
      const offset = (page - 1) * limit

      // Xây dựng điều kiện với Drizzle cho các bảng nói chung
      const conditions = filterBuilder.call(this, filters)
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined

      const fallbackSortField = 'accountUpdatedAt'
      const resolvedSortField = this.resolveSortField(table, pagination.sortBy, fallbackSortField)
      const sortDirection = pagination.sortOrder === 'asc' ? asc : desc
      const orderBy = sortDirection((table as any)[resolvedSortField])

      // Riêng bảng game_states: dùng raw SQL để tránh lỗi dữ liệu lớn
      if (table === gameStates) {
        try {
          const whereParts: string[] = []
          const params: unknown[] = []
          let idx = 1
          const f = filters || {}

          if (f.gameStatus !== undefined) {
            whereParts.push(`game_status = $${idx++}`)
            params.push(f.gameStatus as string)
          }
          if (f.authority !== undefined) {
            whereParts.push(`authority = $${idx++}`)
            params.push(f.authority as string)
          }
          if (f.maxPlayers !== undefined) {
            whereParts.push(`max_players = $${idx++}`)
            params.push(Number(f.maxPlayers))
          }
          if (f.winner !== undefined) {
            whereParts.push(`winner = $${idx++}`)
            params.push(f.winner as string)
          }
          if (f.gameId !== undefined) {
            whereParts.push(`game_id = $${idx++}`)
            params.push(Number(f.gameId))
          }
          if (f.startedAt !== undefined) {
            whereParts.push(`started_at = $${idx++}`)
            params.push(Number(f.startedAt))
          }
          if (f.endedAt !== undefined) {
            whereParts.push(`ended_at = $${idx++}`)
            params.push(Number(f.endedAt))
          }
          if (f.gameEndTime !== undefined) {
            whereParts.push(`game_end_time = $${idx++}`)
            params.push(Number(f.gameEndTime))
          }

          const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

          const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
          const sortRequested = pagination.sortBy ?? 'accountUpdatedAt'
          const candidate = sortRequested.includes('_') ? sortRequested : toSnake(sortRequested)
          const allowedSortColumns = new Set([
            'pubkey',
            'game_id',
            'config_id',
            'authority',
            'bump',
            'max_players',
            'current_players',
            'current_turn',
            'created_at',
            'game_status',
            'turn_started_at',
            'time_limit',
            'bank_balance',
            'free_parking_pool',
            'houses_remaining',
            'hotels_remaining',
            'winner',
            'next_trade_id',
            'account_created_at',
            'account_updated_at',
            'created_slot',
            'updated_slot',
            'last_signature',
            'started_at',
            'ended_at',
            'game_end_time'
          ])
          const sortColumn = allowedSortColumns.has(candidate) ? candidate : 'account_updated_at'
          const sortDir = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC'
          const orderByClause = `ORDER BY ${sortColumn} ${sortDir}`

          const countQuery = `SELECT COUNT(*) FROM game_states ${whereSql}`
          const countRows = (await this.query(countQuery, params)) as any[]
          const total = parseInt(countRows[0]?.count ?? '0', 10)

          const dataQuery = `
            SELECT 
              pubkey, game_id, config_id, authority, bump, max_players, 
              current_players, current_turn, players, created_at, game_status, 
              turn_started_at, time_limit, bank_balance, free_parking_pool, 
              houses_remaining, hotels_remaining, winner, next_trade_id,
              account_created_at, account_updated_at, created_slot, updated_slot, last_signature,
              started_at, ended_at, game_end_time,
              entry_fee, total_prize_pool, token_mint, token_vault, prize_claimed
            FROM game_states
            ${whereSql}
            ${orderByClause}
            LIMIT ${limit} OFFSET ${offset}
          `
          const dataRows = (await this.query(dataQuery, params)) as any[]

          const data = dataRows.map((row) => {
            const camelCaseRow: any = {}
            for (const [key, value] of Object.entries(row)) {
              const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
              camelCaseRow[camelKey] = value
            }
            camelCaseRow.activeTrades = []
            camelCaseRow.properties = []
            camelCaseRow.trades = []
            return camelCaseRow
          })

          return {
            data: data as T[],
            total,
            page,
            limit
          }
        } catch (err) {
          console.warn('DB not connected for game_states; returning empty result', err)
          return { data: [] as T[], total: 0, page, limit }
        }
      }

      // Các bảng khác: nếu DB chưa kết nối thì trả về rỗng thay vì throw
      if (!this.isConnected) {
        console.warn('DB not connected; returning empty result for non-game table query')
        return {
          data: [] as T[],
          total: 0,
          page,
          limit
        }
      }

      const [data, totalResult] = await Promise.all([
        this.db.select().from(table).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
        this.db.select({ count: count() }).from(table).where(whereClause)
      ])

      return {
        data: data as T[],
        total: totalResult[0]?.count ?? 0,
        page,
        limit
      }
    } catch (error) {
      console.error('Query error details:', error)
      throw new Error(`Failed to execute filtered query: ${error}`)
    }
  }

  private resolveSortField(table: any, requested: string | undefined, fallback: string): string {
    const target = requested ?? fallback
    const camelCase = target.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    if ((table as any)[camelCase]) {
      return camelCase
    }
    if ((table as any)[target]) {
      return target
    }
    return fallback
  }

  // ==================== FILTER BUILDERS ====================

  private buildPlatformConfigFilters(filters: QueryFilters) {
    const conditions: any[] = []

    if (filters.authority) {
      conditions.push(eq(platformConfigs.authority, filters.authority as string))
    }
    if (filters.feeVault) {
      conditions.push(eq(platformConfigs.feeVault, filters.feeVault as string))
    }

    return conditions
  }

  private buildGameStateFilters(filters: QueryFilters) {
    const conditions: any[] = []

    if (filters.gameStatus != null) {
      conditions.push(eq(gameStates.gameStatus, filters.gameStatus as any))
    }
    if (filters.authority != null) {
      conditions.push(eq(gameStates.authority, filters.authority as string))
    }
    if (filters.maxPlayers != null) {
      conditions.push(eq(gameStates.maxPlayers, Number(filters.maxPlayers)))
    }
    if (filters.winner != null) {
      conditions.push(eq(gameStates.winner, filters.winner as string))
    }
    if (filters.gameId != null) {
      conditions.push(eq(gameStates.gameId, Number(filters.gameId)))
    }
    if (filters.startedAt != null) {
      conditions.push(eq(gameStates.startedAt, Number(filters.startedAt)))
    }
    if (filters.endedAt != null) {
      conditions.push(eq(gameStates.endedAt, Number(filters.endedAt)))
    }
    if (filters.gameEndTime != null) {
      conditions.push(eq(gameStates.gameEndTime, Number(filters.gameEndTime)))
    }

    return conditions
  }

  private buildPlayerStateFilters(filters: QueryFilters) {
    const conditions: any[] = []

    if (filters.wallet) {
      conditions.push(eq(playerStates.wallet, filters.wallet as string))
    }
    if (filters.gameId) {
      conditions.push(eq(playerStates.game, filters.gameId as string))
    }
    if (filters.inJail !== undefined) {
      conditions.push(eq(playerStates.inJail, filters.inJail as boolean))
    }
    if (filters.isBankrupt !== undefined) {
      conditions.push(eq(playerStates.isBankrupt, filters.isBankrupt as boolean))
    }
    if (filters.position !== undefined) {
      conditions.push(eq(playerStates.position, filters.position as number))
    }

    return conditions
  }

  private buildEmbeddedPropertyPredicates(filters: QueryFilters) {
    const conditions: Array<(p: PropertyState) => boolean> = []

    if (filters.owner) {
      const owner = filters.owner as string
      conditions.push((p) => (p.owner ?? undefined) === owner)
    }
    if (filters.colorGroup) {
      const cg = filters.colorGroup as any
      conditions.push((p) => (p as any).colorGroup === cg)
    }
    if (filters.propertyType) {
      const pt = filters.propertyType as any
      conditions.push((p) => (p as any).propertyType === pt)
    }
    if (filters.isMortgaged !== undefined) {
      const m = !!filters.isMortgaged
      conditions.push((p) => !!p.isMortgaged === m)
    }
    if (filters.position !== undefined) {
      const pos = filters.position as number
      conditions.push((p) => (p.position as number) === pos)
    }

    return conditions
  }

  private buildEmbeddedTradePredicates(filters: QueryFilters) {
    const conditions: Array<(t: TradeState) => boolean> = []

    if (filters.proposer) {
      const proposer = filters.proposer as string
      conditions.push((t) => t.proposer === proposer)
    }
    if (filters.receiver) {
      const receiver = filters.receiver as string
      conditions.push((t) => t.receiver === receiver)
    }
    if (filters.status) {
      const status = filters.status as any
      conditions.push((t) => (t as any).status === status)
    }
    if (filters.tradeType) {
      const tt = filters.tradeType as any
      conditions.push((t) => (t as any).tradeType === tt)
    }
    if (filters.expiresBefore !== undefined) {
      const v = filters.expiresBefore as number
      conditions.push((t) => (t.expiresAt ?? Number.MAX_SAFE_INTEGER) < v)
    }
    if (filters.expiresAfter !== undefined) {
      const v = filters.expiresAfter as number
      conditions.push((t) => (t.expiresAt ?? 0) > v)
    }

    return conditions
  }

  private buildAuctionStateFilters(filters: QueryFilters) {
    const conditions: any[] = []

    if (filters.gameId) {
      conditions.push(eq(auctionStates.game, filters.gameId as string))
    }
    if (filters.isActive !== undefined) {
      conditions.push(eq(auctionStates.isActive, filters.isActive as boolean))
    }
    if (filters.propertyPosition !== undefined) {
      conditions.push(eq(auctionStates.propertyPosition, filters.propertyPosition as number))
    }

    return conditions
  }

  private buildGameLogFilters(filters: QueryFilters) {
    const conditions: any[] = []

    if (filters.gameId) {
      conditions.push(eq(gameLogs.gameId, filters.gameId as string))
    }
    if (filters.playerId) {
      conditions.push(eq(gameLogs.playerId, filters.playerId as string))
    }
    if (filters.type) {
      conditions.push(eq(gameLogs.type, filters.type as any))
    }
    if (filters.position !== undefined) {
      conditions.push(eq(gameLogs.position, filters.position as number))
    }
    if (filters.startTime) {
      conditions.push(gte(gameLogs.timestamp, filters.startTime as number))
    }

    return conditions
  }

  private formatDbError(error: unknown): string {
    if (error instanceof AggregateError) {
      const collected: unknown[] = []

      // Handle errors array
      if (Array.isArray(error.errors)) {
        collected.push(...error.errors)
      }

      if (collected.length === 0) {
        return error.message || 'AggregateError'
      }

      const formatted = collected.map((err) => this.formatDbError(err)).join('; ')
      return formatted ? `AggregateError(${formatted})` : 'AggregateError'
    }

    if (error instanceof Error) {
      const parts = [error.message]
      const pgError = error as { code?: string; detail?: string }

      if (pgError.code) {
        parts.push(`code=${pgError.code}`)
      }
      if (pgError.detail) {
        parts.push(`detail=${pgError.detail}`)
      }
      if (error.cause) {
        parts.push(`cause=${this.formatDbError(error.cause)}`)
      }
      return parts.join(' | ')
    }

    return typeof error === 'string' ? error : JSON.stringify(error)
  }
}

// ==================== EMBEDDED LIST HELPERS ====================

function updateEmbeddedPropertyList(list: PropertyState[], incoming: NewPropertyState): PropertyState[] {
  const idx = list.findIndex((p) => p.pubkey === (incoming as any).pubkey)
  if (idx >= 0) {
    const next = [...list]
    const merged = { ...next[idx], ...(incoming as any) }
    delete (merged as any).game
    next[idx] = merged as any
    return next
  }

  const item = { ...(incoming as any) }
  delete (item as any).game
  return [...list, item as any]
}

function updateEmbeddedTradeList(list: TradeState[], incoming: NewTradeState): TradeState[] {
  const idx = list.findIndex((t) => t.pubkey === (incoming as any).pubkey)
  if (idx >= 0) {
    const next = [...list]
    const merged = { ...next[idx], ...(incoming as any) }
    delete (merged as any).game
    next[idx] = merged as any
    return next
  }

  const item = { ...(incoming as any) }
  delete (item as any).game
  return [...list, item as any]
}
