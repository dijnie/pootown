import type { TradeState, NewTradeState, TradeStatus, TradeType } from '#infra/db/schema'
import type { DatabasePort } from '#infra/db/db.port'
import type { BaseService, QueryFilters, PaginationOptions, PaginatedResult } from './base.service'
import { ServiceError, DatabaseError } from './base.service'

/**
 * TradeState-specific query filters
 * Provides type-safe filtering for trade queries
 */
export interface TradeStateQueryFilters extends QueryFilters {
  readonly game?: string // game pubkey, not numeric gameId
  readonly gameId?: number // numeric game ID for convenience
  readonly proposer?: string
  readonly receiver?: string
  readonly status?: TradeStatus
  readonly tradeType?: TradeType
  readonly createdAfter?: number
  readonly createdBefore?: number
  readonly expiresAfter?: number
  readonly expiresBefore?: number
  readonly isActive?: boolean
  readonly isExpired?: boolean
  readonly involvesMoney?: boolean
  readonly involvesProperty?: boolean
}

/**
 * TradeState summary for analytics
 */
export interface TradeStateSummary {
  readonly totalTradeStates: number
  readonly activeTradeStates: number
  readonly completedTradeStates: number
  readonly rejectedTradeStates: number
  readonly expiredTradeStates: number
  readonly averageTradeStateValue: number
  readonly mostTradeStatedProperties: number[]
  readonly topTradeStaters: string[]
}

/**
 * TradeState negotiation history
 */
export interface TradeStateNegotiation {
  readonly tradeId: string
  readonly participants: [string, string]
  readonly proposalHistory: TradeStateProposal[]
  readonly currentStatus: TradeStatus
  readonly totalValue: number
}

/**
 * Individual trade proposal in negotiation chain
 */
export interface TradeStateProposal {
  readonly timestamp: number
  readonly proposer: string
  readonly moneyOffered: number
  readonly moneyRequested: number
  readonly propertyOffered?: number
  readonly propertyRequested?: number
  readonly action: 'propose' | 'counter' | 'accept' | 'reject' | 'expire'
}

/**
 * TradeState service implementation
 * Encapsulates all trade-related database operations
 */
export class TradeService implements BaseService<TradeState, NewTradeState> {
  constructor(private readonly db: DatabasePort) {}

  /**
   * Create or update a trade record
   * Maps directly to TradeStateState blockchain account updates
   */
  async upsert(tradeData: NewTradeState): Promise<void> {
    try {
      await this.db.upsertTradeState(tradeData)
    } catch (error) {
      throw new DatabaseError(`Failed to upsert trade ${tradeData.pubkey}`, error as Error)
    }
  }

  /**
   * Retrieve a trade by its blockchain pubkey
   */
  async getByPubkey(pubkey: string): Promise<TradeState | null> {
    try {
      return await this.db.getTradeState(pubkey)
    } catch (error) {
      throw new DatabaseError(`Failed to get trade ${pubkey}`, error as Error)
    }
  }

  /**
   * Query trades with advanced filtering and pagination
   */
  async query(
    filters: TradeStateQueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    try {
      return await this.db.getTradeStates(filters, pagination)
    } catch (error) {
      throw new DatabaseError('Failed to query trades', error as Error)
    }
  }

  /**
   * Get all trades with filtering and pagination
   * Alias for query method to match BaseService interface
   */
  async getAll(
    filters: TradeStateQueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    return this.query(filters, pagination)
  }

  /**
   * Get all trades in a specific game by game pubkey
   */
  async getTradesByGame(gamePubkey: string, pagination: PaginationOptions = {}): Promise<PaginatedResult<TradeState>> {
    const filters: TradeStateQueryFilters = { game: gamePubkey }
    return this.query(filters, pagination)
  }

  /**
   * Legacy method name - kept for backward compatibility
   */
  async getTradeStatesByGame(
    gamePubkey: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    return this.getTradesByGame(gamePubkey, pagination)
  }

  /**
   * Get trades where a player is the proposer
   */
  async getTradeStatesByProposer(
    proposer: string,
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    const filters: TradeStateQueryFilters = {
      proposer,
      ...(gamePubkey && { game: gamePubkey })
    }
    return this.query(filters, pagination)
  }

  /**
   * Get trades where a player is the receiver
   */
  async getTradeStatesByReceiver(
    receiver: string,
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    const filters: TradeStateQueryFilters = {
      receiver,
      ...(gamePubkey && { game: gamePubkey })
    }
    return this.query(filters, pagination)
  }

  /**
   * Get all trades involving a specific player (as proposer or receiver)
   */
  async getTradesForPlayer(
    gamePubkey: string,
    player: string,
    _pagination?: PaginationOptions
  ): Promise<PaginatedResult<TradeState>> {
    // This requires OR logic which might need special adapter handling
    try {
      // Implementation would need to combine proposer and receiver queries
      throw new ServiceError('getTradesForPlayer not yet implemented - requires OR query logic', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError(`Failed to get trades for player ${player}`, error as Error)
    }
  }

  /**
   * Get trades by status in a game
   */
  async getTradesByStatus(
    gamePubkey: string,
    status: TradeStatus,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    const filters: TradeStateQueryFilters = {
      game: gamePubkey,
      status
    }
    return this.query(filters, pagination)
  }

  /**
   * Get active (pending) trades in a game
   */
  async getActiveTrades(gamePubkey: string, pagination: PaginationOptions = {}): Promise<PaginatedResult<TradeState>> {
    return this.getTradesByStatus(gamePubkey, 'Pending', pagination)
  }

  /**
   * Get all trades involving a specific player (as proposer or receiver)
   */
  async getTradeStatesByPlayer(
    player: string,

    _pagination?: PaginationOptions
  ): Promise<PaginatedResult<TradeState>> {
    // This requires OR logic which might need special adapter handling
    try {
      // Implementation would need to combine proposer and receiver queries
      throw new ServiceError('getTradeStatesByPlayer not yet implemented - requires OR query logic', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError(`Failed to get trades for player ${player}`, error as Error)
    }
  }

  /**
   * Get active (pending) trades - legacy method
   */
  async getActiveTradeStates(
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    const filters: TradeStateQueryFilters = {
      status: 'Pending',
      isActive: true,
      ...(gamePubkey && { game: gamePubkey })
    }
    return this.query(filters, pagination)
  }

  /**
   * Get expired trades that need cleanup
   */
  async getExpiredTradeStates(
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    const currentTime = Math.floor(Date.now() / 1000)
    const filters: TradeStateQueryFilters = {
      isExpired: true,
      expiresBefore: currentTime,
      ...(gamePubkey && { game: gamePubkey })
    }
    return this.query(filters, pagination)
  }

  /**
   * Get trade statistics for analytics
   */
  async getTradeStats(): Promise<Record<string, unknown>> {
    try {
      // This would require aggregate queries
      // Implementation depends on database adapter capabilities
      throw new ServiceError('getTradeStats not yet implemented - requires aggregate queries', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError('Failed to get trade statistics', error as Error)
    }
  }

  /**
   * Get completed trades (accepted or rejected)
   */
  async getCompletedTradeStates(_pagination?: PaginationOptions): Promise<PaginatedResult<TradeState>> {
    // This requires filtering by multiple status values
    try {
      // Implementation would need to filter by Accepted, Rejected, Expired, Cancelled
      throw new ServiceError(
        'getCompletedTradeStates not yet implemented - requires multi-value status filter',
        'NOT_IMPLEMENTED'
      )
    } catch (error) {
      throw new DatabaseError('Failed to get completed trades', error as Error)
    }
  }

  /**
   * Get trades involving specific property
   */
  async getTradeStatesByProperty(
    propertyPosition: number,

    _pagination?: PaginationOptions
  ): Promise<PaginatedResult<TradeState>> {
    // This requires OR logic for proposerProperty and receiverProperty
    try {
      // Implementation would need to check both proposer and receiver property fields
      throw new ServiceError(
        'getTradeStatesByProperty not yet implemented - requires OR query logic',
        'NOT_IMPLEMENTED'
      )
    } catch (error) {
      throw new DatabaseError(`Failed to get trades for property ${propertyPosition}`, error as Error)
    }
  }

  /**
   * Get trade statistics for analytics
   */
  async getTradeStateSummary(): Promise<TradeStateSummary> {
    try {
      // This would require aggregate queries and complex statistics
      throw new ServiceError('getTradeStateSummary not yet implemented - requires aggregate queries', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError('Failed to get trade summary', error as Error)
    }
  }

  /**
   * Calculate total trade value (money + estimated property values)
   */
  calculateTradeValue(trade: TradeState): number {
    const proposerMoney = trade.proposerMoney ?? 0
    const receiverMoney = trade.receiverMoney ?? 0

    // Property values would need to be looked up from property service
    // For now, just return money values
    return Math.abs(proposerMoney - receiverMoney)
  }

  /**
   * Check if a trade is still valid and not expired
   */
  isTradeActive(trade: TradeState): boolean {
    const currentTime = Math.floor(Date.now() / 1000)
    const expiresAt = trade.expiresAt ?? 0

    return trade.status === 'Pending' && expiresAt > currentTime
  }

  /**
   * Get trades expiring soon (within specified minutes)
   */
  async getTradeStatesExpiringSoon(
    minutesAhead: number = 30,
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<TradeState>> {
    const currentTime = Math.floor(Date.now() / 1000)
    const cutoffTime = currentTime + minutesAhead * 60

    const filters: TradeStateQueryFilters = {
      status: 'Pending',
      expiresAfter: currentTime,
      expiresBefore: cutoffTime,
      ...(gamePubkey && { game: gamePubkey })
    }

    return this.query(filters, pagination)
  }

  /**
   * Validate trade state consistency
   * Business logic validation for trade data integrity
   */
  validateTradeState(trade: TradeState): string[] {
    const errors: string[] = []

    // Validate basic fields
    if (!trade.proposer || !trade.receiver) {
      errors.push('TradeState must have both proposer and receiver')
    }

    if (trade.proposer === trade.receiver) {
      errors.push('Proposer and receiver cannot be the same')
    }

    // Validate timing
    const createdAt = trade.createdAt ?? 0
    const expiresAt = trade.expiresAt ?? 0

    if (expiresAt <= createdAt) {
      errors.push('TradeState expiration must be after creation time')
    }

    const currentTime = Math.floor(Date.now() / 1000)
    if (createdAt > currentTime) {
      errors.push('TradeState creation time cannot be in the future')
    }

    // Validate money amounts
    const proposerMoney = trade.proposerMoney ?? 0
    const receiverMoney = trade.receiverMoney ?? 0

    if (proposerMoney < 0 || receiverMoney < 0) {
      errors.push('Money amounts cannot be negative')
    }

    // Validate property positions
    const proposerProperty = trade.proposerProperty
    const receiverProperty = trade.receiverProperty

    if (proposerProperty !== null && proposerProperty !== undefined) {
      if (proposerProperty < 0 || proposerProperty > 39) {
        errors.push('Proposer property position must be between 0 and 39')
      }
    }

    if (receiverProperty !== null && receiverProperty !== undefined) {
      if (receiverProperty < 0 || receiverProperty > 39) {
        errors.push('Receiver property position must be between 0 and 39')
      }
    }

    if (proposerProperty === receiverProperty && proposerProperty !== null) {
      errors.push('Cannot trade the same property position')
    }

    // Validate trade type consistency
    const hasProposerMoney = proposerMoney > 0
    const hasReceiverMoney = receiverMoney > 0
    const hasProposerProperty = proposerProperty !== null && proposerProperty !== undefined
    const hasReceiverProperty = receiverProperty !== null && receiverProperty !== undefined

    switch (trade.tradeType) {
      case 'MoneyOnly':
        if (hasProposerProperty || hasReceiverProperty) {
          errors.push('MoneyOnly trade should not involve properties')
        }
        if (!hasProposerMoney && !hasReceiverMoney) {
          errors.push('MoneyOnly trade must involve money exchange')
        }
        break

      case 'PropertyOnly':
        if (hasProposerMoney || hasReceiverMoney) {
          errors.push('PropertyOnly trade should not involve money')
        }
        if (!hasProposerProperty && !hasReceiverProperty) {
          errors.push('PropertyOnly trade must involve property exchange')
        }
        break

      case 'MoneyForProperty':
        if (!hasProposerMoney || !hasReceiverProperty) {
          errors.push('MoneyForProperty trade must have proposer money and receiver property')
        }
        if (hasReceiverMoney || hasProposerProperty) {
          errors.push('MoneyForProperty trade should not have receiver money or proposer property')
        }
        break

      case 'PropertyForMoney':
        if (!hasProposerProperty || !hasReceiverMoney) {
          errors.push('PropertyForMoney trade must have proposer property and receiver money')
        }
        if (hasProposerMoney || hasReceiverProperty) {
          errors.push('PropertyForMoney trade should not have proposer money or receiver property')
        }
        break
    }

    // Validate status transitions
    if (trade.status === 'Accepted' || trade.status === 'Rejected') {
      // These should be final states
      if (expiresAt > currentTime) {
        // This might be acceptable, depending on business rules
      }
    }

    if (trade.status === 'Expired' && expiresAt > currentTime) {
      errors.push('TradeState marked as expired but expiration time is in the future')
    }

    return errors
  }
}
