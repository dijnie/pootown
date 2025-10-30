/**
 * Database Port Interface
 *
 * Defines the contract for database operations in the Panda Monopoly indexer.
 * Provides type-safe methods that directly correspond to blockchain account types.
 *
 * Architecture principles:
 * - Each blockchain account type has dedicated upsert/get methods
 * - All operations are idempotent and safe for concurrent access
 * - Filtering and pagination follow consistent patterns
 * - Methods map 1:1 with service layer requirements
 *
 * @author Senior Engineer - Following Google Code Standards
 */

import {
  NewGameState,
  NewPlayerState,
  NewPropertyState,
  NewTradeState,
  NewAuctionState,
  NewPlatformConfig,
  GameState,
  PlayerState,
  PropertyState,
  TradeState,
  AuctionState,
  PlatformConfig,
  GameLog,
  NewGameLog,
  GameLogEntry
} from './schema'

// Common query and pagination types
export interface QueryFilters {
  readonly [key: string]: unknown
}

export interface PaginationOptions {
  readonly page?: number
  readonly limit?: number
  readonly sortBy?: string
  readonly sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  readonly data: T[]
  readonly total: number
  readonly page?: number
  readonly limit?: number
}

/**
 * Primary database interface for blockchain data persistence
 *
 * Provides low-level database operations that services build upon.
 * All methods are designed to be implemented by different database adapters.
 */
export interface DatabasePort {
  /**
   * Initialize database connection and verify health
   */
  init(): Promise<void>

  /**
   * Execute raw SQL query (use sparingly, mainly for health checks)
   * @param sql - SQL query string
   * @param params - Query parameters
   */
  query(sql: string, params?: unknown[]): Promise<unknown[]>

  // ==================== CORE BLOCKCHAIN ENTITY OPERATIONS ====================

  /**
   * Platform configuration operations
   */
  upsertPlatformConfig(config: NewPlatformConfig): Promise<void>
  getPlatformConfig(pubkey: string): Promise<PlatformConfig | null>
  getPlatformConfigs(filters?: QueryFilters, pagination?: PaginationOptions): Promise<PaginatedResult<PlatformConfig>>

  /**
   * Game state operations - mirrors GameState blockchain accounts
   */
  upsertGameState(gameState: NewGameState): Promise<void>
  getGameState(pubkey: string): Promise<GameState | null>
  getGameStates(filters?: QueryFilters, pagination?: PaginationOptions): Promise<PaginatedResult<GameState>>
  checkGameExists(pubkey: string): Promise<boolean>

  /**
   * Player state operations - mirrors PlayerState blockchain accounts
   */
  upsertPlayerState(playerState: NewPlayerState): Promise<void>
  getPlayerState(pubkey: string): Promise<PlayerState | null>
  getPlayerStates(filters?: QueryFilters, pagination?: PaginationOptions): Promise<PaginatedResult<PlayerState>>

  /**
   * Bulk upsert player states to reduce write pressure
   */
  bulkUpsertPlayerStates(playerStates: NewPlayerState[]): Promise<void>

  /**
   * Property state operations - mirrors PropertyState blockchain accounts
   */
  upsertPropertyState(propertyState: NewPropertyState): Promise<void>
  getPropertyState(pubkey: string): Promise<PropertyState | null>
  getPropertyStates(filters?: QueryFilters, pagination?: PaginationOptions): Promise<PaginatedResult<PropertyState>>

  /**
   * Trade state operations - mirrors TradeState blockchain accounts
   */
  upsertTradeState(tradeState: NewTradeState): Promise<void>
  getTradeState(pubkey: string): Promise<TradeState | null>
  getTradeStates(filters?: QueryFilters, pagination?: PaginationOptions): Promise<PaginatedResult<TradeState>>

  /**
   * Auction state operations - mirrors AuctionState blockchain accounts
   */
  upsertAuctionState(auctionState: NewAuctionState): Promise<void>
  getAuctionState(pubkey: string): Promise<AuctionState | null>
  getAuctionStates(filters?: QueryFilters, pagination?: PaginationOptions): Promise<PaginatedResult<AuctionState>>

  // ==================== GAME LOG OPERATIONS ====================

  /**
   * Create a new game log entry for event tracking
   */
  createGameLog(log: Omit<NewGameLog, 'id' | 'createdAt' | 'accountCreatedAt' | 'accountUpdatedAt'>): Promise<GameLog>

  /**
   * Query game logs with filtering and pagination
   */
  getGameLogs(gameId: string, filters?: QueryFilters, pagination?: PaginationOptions): Promise<PaginatedResult<GameLog>>

  /**
   * Get game logs formatted for frontend consumption
   */
  getGameLogsAsEntries(
    gameId: string,
    filters?: QueryFilters,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<GameLogEntry>>

  /**
   * Delete all game logs for a specific game (cleanup operation)
   */
  deleteGameLogs(gameId: string): Promise<void>
}
