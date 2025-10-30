import type { PlayerState, NewPlayerState } from '#infra/db/schema'
import type { DatabasePort } from '#infra/db/db.port'
import type { BaseService, QueryFilters, PaginationOptions, PaginatedResult } from './base.service'
import { ServiceError, DatabaseError } from './base.service'

/**
 * Player-specific query filters
 * Provides type-safe filtering for player queries
 */
export interface PlayerQueryFilters extends QueryFilters {
  readonly wallet?: string
  readonly game?: string // game pubkey, not numeric gameId
  readonly gameId?: number // numeric game ID for convenience
  readonly inJail?: boolean
  readonly isBankrupt?: boolean
  readonly position?: number
  readonly minCashBalance?: number
  readonly maxCashBalance?: number
  readonly minNetWorth?: number
  readonly maxNetWorth?: number
  readonly hasProperties?: boolean
  readonly hasJailCards?: boolean
  readonly needsAction?: boolean
} /**
 * Player leaderboard entry for rankings
 */
export interface PlayerLeaderboardEntry {
  readonly wallet: string
  readonly netWorth: number
  readonly gamesPlayed: number
  readonly gamesWon: number
  readonly totalWinnings: number
  readonly winRate: number
  readonly averageGameDuration: number
  readonly rank: number
}

/**
 * Player statistics aggregation
 */
export interface PlayerStats {
  readonly totalPlayers: number
  readonly activePlayers: number
  readonly bankruptPlayers: number
  readonly averageCashBalance: number
  readonly averageNetWorth: number
  readonly playersInJail: number
}

/**
 * Player service implementation
 * Encapsulates all player-related database operations
 */
export class PlayerService implements BaseService<PlayerState, NewPlayerState> {
  constructor(private readonly db: DatabasePort) {}

  /**
   * Create or update a player record
   * Maps directly to PlayerState blockchain account updates
   */
  async upsert(playerData: NewPlayerState): Promise<void> {
    try {
      await this.db.upsertPlayerState(playerData)
    } catch (error) {
      throw new DatabaseError(`Failed to upsert player ${playerData.pubkey}`, error as Error)
    }
  }

  /**
   * Retrieve a player by their blockchain pubkey
   */
  async getByPubkey(pubkey: string): Promise<PlayerState | null> {
    try {
      return await this.db.getPlayerState(pubkey)
    } catch (error) {
      throw new DatabaseError(`Failed to get player ${pubkey}`, error as Error)
    }
  }

  /**
   * Query players with advanced filtering and pagination
   */
  async query(
    filters: PlayerQueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PlayerState>> {
    try {
      return await this.db.getPlayerStates(filters, pagination)
    } catch (error) {
      throw new DatabaseError('Failed to query players', error as Error)
    }
  }

  /**
   * Get all players in a specific game by game pubkey
   */
  async getPlayersByGame(
    _gamePubkey: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PlayerState>> {
    const filters: PlayerQueryFilters = { game: _gamePubkey }
    return this.query(filters, pagination)
  }

  /**
   * Get all players with filtering and pagination
   * Alias for query method to match BaseService interface
   */
  async getAll(
    filters: PlayerQueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PlayerState>> {
    return this.query(filters, pagination)
  }

  /**
   * Get specific player by wallet in a game
   */
  async getPlayerByWallet(_gamePubkey: string, wallet: string): Promise<PlayerState | null> {
    const filters: PlayerQueryFilters = { game: _gamePubkey, wallet }
    const result = await this.query(filters, { limit: 1 })
    return result.data[0] ?? null
  }

  /**
   * Get active (non-bankrupt) players in a game
   */
  async getActivePlayers(
    _gamePubkey: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PlayerState>> {
    const filters: PlayerQueryFilters = {
      game: _gamePubkey,
      isBankrupt: false
    }
    return this.query(filters, pagination)
  }

  /**
   * Get player by wallet address across all games
   */
  async getPlayersByWallet(wallet: string, pagination: PaginationOptions = {}): Promise<PaginatedResult<PlayerState>> {
    const filters: PlayerQueryFilters = { wallet }
    return this.query(filters, pagination)
  }

  /**
   * Get players at specific board position
   * Useful for rent calculations and collision detection
   */
  async getPlayersAtPosition(_gamePubkey: string, position: number): Promise<PlayerState[]> {
    const filters: PlayerQueryFilters = { game: _gamePubkey, position }
    const result = await this.query(filters)
    return result.data
  }

  /**
   * Get players currently in jail
   */
  async getPlayersInJail(
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PlayerState>> {
    const filters: PlayerQueryFilters = {
      inJail: true,
      ...(gamePubkey && { game: gamePubkey })
    }
    return this.query(filters, pagination)
  }

  /**
   * Get bankrupt players
   */
  async getBankruptPlayers(
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PlayerState>> {
    const filters: PlayerQueryFilters = {
      isBankrupt: true,
      ...(gamePubkey && { game: gamePubkey })
    }
    return this.query(filters, pagination)
  }

  /**
   * Get wealthy players (top net worth)
   */
  async getWealthyPlayers(gamePubkey?: string, limit: number = 10): Promise<PlayerState[]> {
    const filters: PlayerQueryFilters = gamePubkey ? { game: gamePubkey } : {}
    const result = await this.query(filters, {
      limit,
      sortBy: 'netWorth',
      sortOrder: 'desc'
    })
    return result.data
  }

  /**
   * Get players needing action (pending moves, decisions, etc.)
   */
  async getPlayersNeedingAction(
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PlayerState>> {
    const filters: PlayerQueryFilters = {
      needsAction: true,
      ...(gamePubkey && { game: gamePubkey })
    }
    return this.query(filters, pagination)
  }

  /**
   * Get player leaderboard with rankings
   * Aggregates player performance across all games
   */
  async getLeaderboard(limit: number = 100): Promise<PlayerLeaderboardEntry[]> {
    try {
      // This would require complex aggregation queries
      // Implementation depends on database adapter capabilities
      throw new ServiceError('getLeaderboard not yet implemented - requires aggregate queries', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError('Failed to get player leaderboard', error as Error)
    }
  }

  /**
   * Get player statistics for analytics
   */
  async getPlayerStats(gamePubkey?: string): Promise<PlayerStats> {
    try {
      // This would require aggregate queries
      // Implementation depends on database adapter capabilities
      throw new ServiceError('getPlayerStats not yet implemented - requires aggregate queries', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError('Failed to get player statistics', error as Error)
    }
  }

  /**
   * Check if a player exists in a specific game
   */
  async playerExistsInGame(wallet: string, _gamePubkey: string): Promise<boolean> {
    const filters: PlayerQueryFilters = { wallet, game: _gamePubkey }
    const result = await this.query(filters, { limit: 1 })
    return result.data.length > 0
  }

  /**
   * Get current turn player for a game
   * Requires cross-referencing with game state
   */
  async getCurrentTurnPlayer(_gamePubkey: string): Promise<PlayerState | null> {
    // This would require joining with games table to get currentTurn
    // Implementation depends on cross-service capabilities
    throw new ServiceError(
      'getCurrentTurnPlayer not yet implemented - requires game service integration',
      'NOT_IMPLEMENTED'
    )
  }

  /**
   * Calculate player's total property value
   * Requires cross-referencing with property values
   */
  async calculatePlayerPropertyValue(_playerPubkey: string): Promise<number> {
    // This would require joining with properties table
    // Implementation depends on cross-service capabilities
    throw new ServiceError(
      'calculatePlayerPropertyValue not yet implemented - requires property service integration',
      'NOT_IMPLEMENTED'
    )
  }

  /**
   * Validate player state consistency
   * Business logic validation for player data integrity
   */
  validatePlayerState(player: PlayerState): string[] {
    const errors: string[] = []

    // Validate position range
    const position = player.position ?? 0
    if (position < 0 || position > 39) {
      errors.push('Player position must be between 0 and 39')
    }

    // Validate cash balance
    const cashBalance = player.cashBalance ?? 0
    if (cashBalance < 0) {
      errors.push('Cash balance cannot be negative')
    }

    // Validate jail state consistency
    const inJail = player.inJail ?? false
    const jailTurns = player.jailTurns ?? 0
    if (inJail && jailTurns <= 0) {
      errors.push('Player in jail must have jail turns > 0')
    }
    if (!inJail && jailTurns > 0) {
      errors.push('Player not in jail should have jail turns = 0')
    }

    // Validate doubles count
    const doublesCount = player.doublesCount ?? 0
    if (doublesCount < 0 || doublesCount > 3) {
      errors.push('Doubles count must be between 0 and 3')
    }

    // Validate properties array
    const propertiesOwned = player.propertiesOwned ?? []
    const uniqueProperties = new Set(propertiesOwned)
    if (uniqueProperties.size !== propertiesOwned.length) {
      errors.push('Player cannot own duplicate properties')
    }

    // Validate property positions
    for (const propertyPosition of propertiesOwned) {
      if (propertyPosition < 0 || propertyPosition > 39) {
        errors.push(`Invalid property position: ${propertyPosition}`)
      }
    }

    // Validate bankruptcy state
    const isBankrupt = player.isBankrupt ?? false
    if (isBankrupt && cashBalance > 0) {
      errors.push('Bankrupt player should have zero cash balance')
    }

    // Validate dice roll
    const lastDiceRoll = player.lastDiceRoll ?? [0, 0]
    if (lastDiceRoll.length !== 2) {
      errors.push('Dice roll must be array of exactly 2 numbers')
    }
    for (const die of lastDiceRoll) {
      if (die < 1 || die > 6) {
        errors.push(`Invalid die value: ${die}`)
      }
    }

    return errors
  }
}
