// Base service types and utilities
export * from './base.service'

// Core entity services - mirrors blockchain account types
export * from './game.service'
export * from './player.service'
export * from './property.service'
export * from './trade.service'

// Service factory for dependency injection
import type { DatabasePort } from '#infra/db/db.port'
import { GameService } from './game.service'
import { PlayerService } from './player.service'
import { PropertyService } from './property.service'
import { TradeService } from './trade.service'

/**
 * Service container for dependency management
 * Provides centralized service instantiation with shared database connection
 */
export class ServiceContainer {
  private readonly gameService: GameService
  private readonly playerService: PlayerService
  private readonly propertyService: PropertyService
  private readonly tradeService: TradeService

  constructor(private readonly database: DatabasePort) {
    this.gameService = new GameService(database)
    this.playerService = new PlayerService(database)
    this.propertyService = new PropertyService(database)
    this.tradeService = new TradeService(database)
  }

  /**
   * Get the game service instance
   */
  get games(): GameService {
    return this.gameService
  }

  /**
   * Get the player service instance
   */
  get players(): PlayerService {
    return this.playerService
  }

  /**
   * Get the property service instance
   */
  get properties(): PropertyService {
    return this.propertyService
  }

  /**
   * Get the trade service instance
   */
  get trades(): TradeService {
    return this.tradeService
  }

  /**
   * Initialize all services (if needed)
   */
  async initialize(): Promise<void> {}

  /**
   * Cleanup resources when shutting down
   */
  async cleanup(): Promise<void> {}
}
