import type {
  NewGameState,
  NewPlayerState,
  NewAuctionState,
  NewPlatformConfig,
  NewPropertyState,
  NewTradeState
} from '#infra/db/schema'

/**
 * Real-time processing job for live blockchain event streaming
 */
export interface RealtimeJob {
  readonly signature: string
}

/**
 * Backfill processing job for historical data synchronization
 */
export interface BackfillJob {
  readonly signature: string
}

/**
 * Program account discovery job for scanning existing accounts
 */
export interface DiscoveryJob {
  readonly signature: string
  readonly accountAddress: string
  readonly accountType: 'gameState' | 'platformConfig' | 'playerState' | 'propertyState'
}

/**
 * Discriminated union for all supported blockchain account types
 * Each variant maps to exactly one database table and Rust struct
 */
export type MonopolyRecord =
  | { readonly kind: 'platformConfig'; readonly data: NewPlatformConfig }
  | { readonly kind: 'gameState'; readonly data: NewGameState }
  | { readonly kind: 'playerState'; readonly data: NewPlayerState }
  | { readonly kind: 'propertyState'; readonly data: NewPropertyState }
  | { readonly kind: 'tradeState'; readonly data: NewTradeState }
  | { readonly kind: 'auctionState'; readonly data: NewAuctionState }

/**
 * Database writer job containing a processed blockchain record
 * Used by the writer worker to persist data to PostgreSQL
 */
export interface WriterJob {
  readonly record: MonopolyRecord
}
