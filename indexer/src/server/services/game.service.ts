import type { GameState, NewGameState, GameStatus } from '#infra/db/schema'
import type { DatabasePort } from '#infra/db/db.port'
import type { BaseService, QueryFilters, PaginatedResult } from './base.service'
import { ServiceError, DatabaseError } from './base.service'

/**
 * Game-specific query filters
 * Provides type-safe filtering for game queries
 */
export interface GameQueryFilters extends QueryFilters {
  readonly gameStatus?: GameStatus
  readonly authority?: string
  readonly maxPlayers?: number
  readonly currentPlayers?: number
  readonly winner?: string
  readonly configId?: string
  readonly createdAfter?: number
  readonly createdBefore?: number
  readonly hasWinner?: boolean
  readonly isActive?: boolean
}

/**
 * Game statistics aggregation
 * Provides metrics for game analytics
 */
export interface GameStats {
  readonly totalGames: number
  readonly activeGames: number
  readonly completedGames: number
  readonly averageGameDuration: number | null
  readonly averagePlayersPerGame: number
}

/**
 * Game service implementation
 * Encapsulates all game-related database operations
 */
export class GameService implements BaseService<GameState, NewGameState> {
  constructor(private readonly db: DatabasePort) {}

  /**
   * Create or update a game record
   * Maps directly to GameState blockchain account updates
   */
  async upsert(gameData: NewGameState): Promise<void> {
    try {
      await this.db.upsertGameState(gameData)
    } catch (error) {
      throw new DatabaseError(`Failed to upsert game ${gameData.pubkey}`, error as Error)
    }
  }

  /**
   * Retrieve a game by its blockchain pubkey
   */
  async getByPubkey(pubkey: string): Promise<GameState | null> {
    try {
      return await this.db.getGameState(pubkey)
    } catch (error) {
      throw new DatabaseError(`Failed to get game ${pubkey}`, error as Error)
    }
  }

  /**
   * Get a game by its game ID (more user-friendly than pubkey)
   */
  async getByGameId(gameId: number): Promise<GameState | null> {
    try {
      const filters: GameQueryFilters = { gameId }
      const result = await this.query(filters, { limit: 1 })
      return result.data[0] ?? null
    } catch (error) {
      throw new DatabaseError(`Failed to get game by ID ${gameId}`, error as Error)
    }
  }

  /**
   * Query games with advanced filtering and pagination
   */
  async query(filters: GameQueryFilters = {}, pagination = {}): Promise<PaginatedResult<GameState>> {
    try {
      return await this.db.getGameStates(filters, pagination)
    } catch (error) {
      throw new DatabaseError('Failed to query games', error as Error)
    }
  }

  /**
   * Get all games with filtering and pagination
   * Alias for query method to match BaseService interface
   */
  async getAll(filters: GameQueryFilters = {}, pagination = {}): Promise<PaginatedResult<GameState>> {
    return this.query(filters, pagination)
  }

  /**
   * Get games by authority (creator)
   * Useful for user dashboards showing created games
   */
  async getGamesByAuthority(authority: string, pagination = {}): Promise<PaginatedResult<GameState>> {
    const filters: GameQueryFilters = { authority }
    return this.query(filters, pagination)
  }

  /**
   * Get active games (in progress or waiting for players)
   */
  async getActiveGames(pagination = {}): Promise<PaginatedResult<GameState>> {
    const filters: GameQueryFilters = { isActive: true }
    return this.query(filters, pagination)
  }

  /**
   * Get completed games with winners
   */
  async getCompletedGames(pagination = {}): Promise<PaginatedResult<GameState>> {
    const filters: GameQueryFilters = {
      gameStatus: 'Finished',
      hasWinner: true
    }
    return this.query(filters, pagination)
  }

  /**
   * Get games by player participation
   * Searches for games where the player wallet is in the players array
   */
  async getGamesByPlayer(playerWallet: string, pagination = {}): Promise<PaginatedResult<GameState>> {
    // This requires a custom query since we're searching within JSON array
    // Implementation would depend on specific database adapter capabilities
    throw new ServiceError('getGamesByPlayer not yet implemented - requires JSON array search', 'NOT_IMPLEMENTED')
  }

  /**
   * Get game statistics for analytics
   */
  async getGameStats(): Promise<GameStats> {
    try {
      // This would require aggregate queries
      // Implementation depends on database adapter capabilities
      throw new ServiceError('getGameStats not yet implemented - requires aggregate queries', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError('Failed to get game statistics', error as Error)
    }
  }

  /**
   * Get recent games with activity
   * Useful for homepage/dashboard display
   */
  async getRecentGames(limit: number = 10): Promise<GameState[]> {
    const result = await this.query(
      {},
      {
        limit,
        sortBy: 'accountUpdatedAt',
        sortOrder: 'desc'
      }
    )
    return result.data
  }

  /**
   * Check if a game exists by game ID
   * Lightweight existence check without full data retrieval
   */
  async gameExists(gameId: number): Promise<boolean> {
    const game = await this.getByGameId(gameId)
    return game !== null
  }

  /**
   * Validate game state consistency
   * Business logic validation for game data integrity
   */
  validateGameState(game: GameState): string[] {
    const errors: string[] = []

    // Validate player count consistency
    const currentPlayers = game.currentPlayers ?? 0
    const maxPlayers = game.maxPlayers ?? 0
    const currentTurn = game.currentTurn ?? 0
    const housesRemaining = game.housesRemaining ?? 0
    const hotelsRemaining = game.hotelsRemaining ?? 0

    if (currentPlayers > maxPlayers) {
      errors.push('Current players exceeds maximum players')
    }

    if (game.players.length !== currentPlayers) {
      errors.push('Players array length does not match current players count')
    }

    // Validate turn index
    if (currentTurn >= currentPlayers && currentPlayers > 0) {
      errors.push('Current turn index is invalid for player count')
    }

    // Validate game status transitions
    if (game.gameStatus === 'Finished' && !game.winner) {
      errors.push('Finished game must have a winner')
    }

    if (game.gameStatus === 'WaitingForPlayers' && currentPlayers >= maxPlayers) {
      errors.push('Game should be in progress when full')
    }

    // Validate resource counts
    if (housesRemaining > 32 || housesRemaining < 0) {
      errors.push('Invalid houses remaining count')
    }

    if (hotelsRemaining > 12 || hotelsRemaining < 0) {
      errors.push('Invalid hotels remaining count')
    }

    return errors
  }
}
