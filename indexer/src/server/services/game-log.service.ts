import type { GameLog, NewGameLog, GameLogType, GameLogEntry } from '#infra/db/schema'
import type { DatabasePort } from '#infra/db/db.port'
import type { BaseService, QueryFilters, PaginatedResult } from './base.service'
import { ServiceError, DatabaseError } from './base.service'

/**
 * Game log-specific query filters
 * Provides type-safe filtering for game log queries
 */
export interface GameLogQueryFilters extends QueryFilters {
  readonly type?: GameLogType
  readonly playerId?: string
  readonly playerName?: string
  readonly position?: number
  readonly propertyName?: string
  readonly cardType?: 'chance' | 'community-chest'
  readonly tradeId?: string
  readonly targetPlayer?: string
  readonly action?: string
  readonly jailReason?: 'doubles' | 'go_to_jail' | 'card'
  readonly buildingType?: 'house' | 'hotel'
  readonly taxType?: string
  readonly signature?: string
  readonly timestampFrom?: number
  readonly timestampTo?: number
  readonly hasError?: boolean
}

/**
 * Game log creation request
 * Simplified interface for creating new game logs
 */
export interface CreateGameLogRequest {
  readonly gameId: string
  readonly playerId: string
  readonly playerName?: string
  readonly type: GameLogType
  readonly message: string
  readonly details?: GameLogEntry['details']
  readonly signature?: string
  readonly slot?: number
  readonly timestamp?: number
}

/**
 * Game log service implementation
 * Encapsulates all game log-related database operations
 */
export class GameLogService implements BaseService<GameLog, NewGameLog> {
  constructor(private readonly db: DatabasePort) {}

  /**
   * Create a new game log entry
   * Maps CreateGameLogRequest to database format
   */
  async create(request: CreateGameLogRequest): Promise<GameLog> {
    try {
      const logData: Omit<NewGameLog, 'id' | 'createdAt' | 'accountCreatedAt' | 'accountUpdatedAt'> = {
        gameId: request.gameId,
        playerId: request.playerId,
        playerName: request.playerName,
        type: request.type,
        message: request.message,
        timestamp: request.timestamp || Date.now(),
        signature: request.signature,
        slot: request.slot,

        // Extract details from request
        ...(request.details && this.extractDetailsToFields(request.details))
      }

      return await this.db.createGameLog(logData)
    } catch (error) {
      throw new DatabaseError(`Failed to create game log for game ${request.gameId}`, error as Error)
    }
  }

  /**
   * Create or update a game log record
   * Required by BaseService interface
   */
  async upsert(logData: NewGameLog): Promise<void> {
    // Game logs are typically append-only, but we implement upsert for interface compliance
    try {
      await this.db.createGameLog(logData)
    } catch (error) {
      throw new DatabaseError(`Failed to upsert game log ${logData.id || 'new'}`, error as Error)
    }
  }

  /**
   * Get game logs for a specific game
   */
  async getGameLogs(
    gameId: string,
    filters: GameLogQueryFilters = {},
    pagination = {}
  ): Promise<PaginatedResult<GameLog>> {
    try {
      return await this.db.getGameLogs(gameId, filters, pagination)
    } catch (error) {
      throw new DatabaseError(`Failed to get game logs for game ${gameId}`, error as Error)
    }
  }

  /**
   * Get game logs as formatted entries for frontend
   */
  async getGameLogEntries(
    gameId: string,
    filters: GameLogQueryFilters = {},
    pagination = {}
  ): Promise<PaginatedResult<GameLogEntry>> {
    try {
      return await this.db.getGameLogsAsEntries(gameId, filters, pagination)
    } catch (error) {
      throw new DatabaseError(`Failed to get game log entries for game ${gameId}`, error as Error)
    }
  }

  /**
   * Get recent logs across all games (for admin/monitoring)
   */
  async getRecentLogs(
    _filters: GameLogQueryFilters = {},
    _pagination = { limit: 50, sortBy: 'timestamp', sortOrder: 'desc' as const }
  ): Promise<PaginatedResult<GameLog>> {
    try {
      // This would require a cross-game query - implementation depends on adapter
      throw new ServiceError('getRecentLogs not yet implemented - requires cross-game queries', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError('Failed to get recent game logs', error as Error)
    }
  }

  /**
   * Get logs by player across all games
   */
  async getPlayerLogs(
    playerId: string,
    _filters: GameLogQueryFilters = {},
    _pagination = {}
  ): Promise<PaginatedResult<GameLog>> {
    try {
      // This would require cross-game query - implementation depends on adapter
      throw new ServiceError('getPlayerLogs not yet implemented - requires cross-game queries', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError(`Failed to get logs for player ${playerId}`, error as Error)
    }
  }

  /**
   * Get logs by type for analytics
   */
  async getLogsByType(
    gameId: string,
    type: GameLogType,
    filters: GameLogQueryFilters = {},
    pagination = {}
  ): Promise<PaginatedResult<GameLog>> {
    const typeFilters = { ...filters, type }
    return this.getGameLogs(gameId, typeFilters, pagination)
  }

  /**
   * Delete all logs for a game (cleanup operation)
   */
  async deleteGameLogs(gameId: string): Promise<void> {
    try {
      await this.db.deleteGameLogs(gameId)
    } catch (error) {
      throw new DatabaseError(`Failed to delete game logs for game ${gameId}`, error as Error)
    }
  }

  /**
   * Get log statistics for a game
   */
  async getGameLogStats(gameId: string): Promise<{
    totalLogs: number
    logsByType: Record<GameLogType, number>
    mostActivePlayer: string | null
    lastActivity: number | null
  }> {
    try {
      // This would require aggregate queries - implementation depends on adapter
      throw new ServiceError('getGameLogStats not yet implemented - requires aggregate queries', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError(`Failed to get log statistics for game ${gameId}`, error as Error)
    }
  }

  /**
   * Required by BaseService interface - not applicable for logs
   */
  async getByPubkey(_pubkey: string): Promise<GameLog | null> {
    throw new ServiceError('getByPubkey not applicable for game logs', 'NOT_IMPLEMENTED')
  }

  /**
   * Query logs with filters - alias for getGameLogs
   */
  async query(_filters: GameLogQueryFilters = {}, _pagination = {}): Promise<PaginatedResult<GameLog>> {
    // This method needs a gameId - not directly applicable without context
    throw new ServiceError('Use getGameLogs with gameId parameter instead', 'INVALID_OPERATION')
  }

  /**
   * Get all logs - not recommended without game context
   */
  async getAll(_filters: GameLogQueryFilters = {}, _pagination = {}): Promise<PaginatedResult<GameLog>> {
    throw new ServiceError('Use getGameLogs with gameId parameter instead', 'INVALID_OPERATION')
  }

  // ==================== PRIVATE UTILITY METHODS ====================

  /**
   * Extract GameLogEntry details to database fields
   */
  private extractDetailsToFields(details: GameLogEntry['details']): Partial<NewGameLog> {
    if (!details) return {}

    return {
      // Property-related
      propertyName: details.propertyName,
      position: details.position,
      price: details.price,
      owner: details.owner,

      // Card event details
      cardType: details.cardType,
      cardTitle: details.cardTitle,
      cardDescription: details.cardDescription,
      cardIndex: details.cardIndex,
      effectType: details.effectType,
      amount: details.amount,

      // Trade event details
      tradeId: details.tradeId,
      action: details.action,
      targetPlayer: details.targetPlayer,
      targetPlayerName: details.targetPlayerName,
      offeredProperties: details.offeredProperties,
      requestedProperties: details.requestedProperties,
      offeredMoney: details.offeredMoney,
      requestedMoney: details.requestedMoney,

      // Movement event details
      fromPosition: details.fromPosition,
      toPosition: details.toPosition,
      diceRoll: details.diceRoll,
      doublesCount: details.doublesCount,
      passedGo: details.passedGo,

      // Jail event details
      jailReason: details.jailReason,
      fineAmount: details.fineAmount,

      // Building event details
      buildingType: details.buildingType,

      // Tax event details
      taxType: details.taxType,

      // Blockchain tracing
      error: details.error
    }
  }

  /**
   * Validate game log data before creation
   */
  validateGameLogData(request: CreateGameLogRequest): string[] {
    const errors: string[] = []

    // Required fields validation
    if (!request.gameId?.trim()) {
      errors.push('Game ID is required')
    }

    if (!request.playerId?.trim()) {
      errors.push('Player ID is required')
    }

    if (!request.message?.trim()) {
      errors.push('Message is required')
    }

    // Game ID format validation (assuming Solana pubkey format)
    if (request.gameId && (request.gameId.length < 32 || request.gameId.length > 44)) {
      errors.push('Invalid game ID format')
    }

    // Player ID format validation
    if (request.playerId && (request.playerId.length < 32 || request.playerId.length > 44)) {
      errors.push('Invalid player ID format')
    }

    // Timestamp validation
    if (request.timestamp && (request.timestamp < 0 || request.timestamp > Date.now() + 60000)) {
      errors.push('Invalid timestamp - must be in the past or near present')
    }

    // Type-specific validations
    if (request.type === 'move' && request.details) {
      if (request.details.fromPosition === undefined || request.details.toPosition === undefined) {
        errors.push('Move logs require fromPosition and toPosition')
      }
    }

    if (request.type === 'purchase' && request.details) {
      if (!request.details.propertyName || request.details.price === undefined) {
        errors.push('Purchase logs require propertyName and price')
      }
    }

    if (request.type === 'trade' && request.details) {
      if (!request.details.tradeId || !request.details.targetPlayer) {
        errors.push('Trade logs require tradeId and targetPlayer')
      }
    }

    return errors
  }
}
