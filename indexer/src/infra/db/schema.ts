import {
  pgTable,
  varchar,
  bigint,
  integer,
  smallint,
  boolean,
  timestamp,
  pgEnum,
  json,
  index,
  serial,
  text
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ==================== TYPE UTILITIES ====================

export type InferEnum<T extends { enumValues: string[] }> = T['enumValues'][number]

// ==================== BLOCKCHAIN-MIRRORED ENUMS ====================

/**
 * Game status enum - directly mirrors GameStatus in mod.rs
 */
export const gameStatusEnum = pgEnum('game_status', ['WaitingForPlayers', 'InProgress', 'Finished'] as const)

/**
 * Trade status enum - directly mirrors TradeStatus in mod.rs
 */
export const tradeStatusEnum = pgEnum('trade_status', [
  'Pending',
  'Accepted',
  'Rejected',
  'Cancelled',
  'Expired'
] as const)

/**
 * Property color group enum - directly mirrors ColorGroup in mod.rs
 */
export const colorGroupEnum = pgEnum('color_group', [
  'Brown',
  'LightBlue',
  'Pink',
  'Orange',
  'Red',
  'Yellow',
  'Green',
  'DarkBlue',
  'Railroad',
  'Utility',
  'Special'
] as const)

/**
 * Property type enum - directly mirrors PropertyType in mod.rs
 */
export const propertyTypeEnum = pgEnum('property_type', [
  'Property',
  'Street',
  'Railroad',
  'Utility',
  'Corner',
  'Chance',
  'CommunityChest',
  'Tax',
  'Beach',
  'Festival'
] as const)

/**
 * Building type enum - directly mirrors BuildingType in mod.rs
 */
export const buildingTypeEnum = pgEnum('building_type', ['House', 'Hotel'] as const)

/**
 * Trade type enum - directly mirrors TradeType in mod.rs
 */
export const tradeTypeEnum = pgEnum('trade_type', [
  'MoneyOnly',
  'PropertyOnly',
  'MoneyForProperty',
  'PropertyForMoney'
] as const)

/**
 * Game log type enum for event tracking and frontend display
 */
export const gameLogTypeEnum = pgEnum('game_log_type', [
  'move',
  'purchase',
  'rent',
  'card',
  'jail',
  'bankruptcy',
  'turn',
  'dice',
  'building',
  'trade',
  'game',
  'skip',
  'join'
] as const)

// ==================== CORE BLOCKCHAIN TABLES ====================

/**
 * Platform configuration table - mirrors PlatformConfig struct
 * Stores global platform settings and fee configuration
 */
export const platformConfigs = pgTable(
  'platform_configs',
  {
    // Primary key - blockchain account pubkey
    pubkey: varchar('pubkey', { length: 44 }).primaryKey(),

    // Core platform fields from PlatformConfig struct
    id: varchar('id', { length: 44 }).notNull(),
    feeBasisPoints: smallint('fee_basis_points').notNull(), // 500 = 5%
    authority: varchar('authority', { length: 44 }).notNull(),
    feeVault: varchar('fee_vault', { length: 44 }).notNull(),
    totalGamesCreated: bigint('total_games_created', { mode: 'number' }).default(0),
    nextGameId: bigint('next_game_id', { mode: 'number' }).default(0),
    bump: smallint('bump').notNull(),

    // Blockchain metadata - consistent across all tables
    accountCreatedAt: timestamp('account_created_at', { withTimezone: true }).notNull(),
    accountUpdatedAt: timestamp('account_updated_at', { withTimezone: true }).notNull(),
    createdSlot: bigint('created_slot', { mode: 'number' }).notNull(),
    updatedSlot: bigint('updated_slot', { mode: 'number' }).notNull(),
    lastSignature: varchar('last_signature', { length: 88 })
  },
  (table) => [
    // Performance-optimized indexes for common queries
    index('idx_platform_authority').on(table.authority),
    index('idx_platform_fee_vault').on(table.feeVault),
    index('idx_platform_next_game_id').on(table.nextGameId),
    index('idx_platform_updated_at').on(table.accountUpdatedAt)
  ]
)

/**
 * Game States table - mirrors GameState struct from blockchain
 *
 * Each record represents the complete state of one Monopoly game instance.
 * This is a direct mapping of the GameState account from the Solana program.
 */
export const gameStates = pgTable(
  'game_states',
  {
    // Primary key - blockchain account pubkey
    pubkey: varchar('pubkey', { length: 44 }).primaryKey(),

    // Core game fields from GameState struct
    gameId: bigint('game_id', { mode: 'number' }).notNull(),
    configId: varchar('config_id', { length: 44 }).notNull(),
    authority: varchar('authority', { length: 44 }).notNull(), // game creator
    bump: smallint('bump').notNull(), // PDA bump seed
    maxPlayers: smallint('max_players').notNull(), // 2-8 players
    currentPlayers: smallint('current_players').notNull(),
    currentTurn: smallint('current_turn').notNull(), // player index whose turn

    // Players array - stores pubkeys of joined players
    players: json('players').$type<string[]>().notNull(),

    // Game timing
    createdAt: bigint('created_at', { mode: 'number' }).notNull(), // i64 timestamp
    startedAt: bigint('started_at', { mode: 'number' }),
    endedAt: bigint('ended_at', { mode: 'number' }),
    gameEndTime: bigint('game_end_time', { mode: 'number' }),
    gameStatus: gameStatusEnum('game_status').notNull(),
    turnStartedAt: bigint('turn_started_at', { mode: 'number' }).notNull(),
    timeLimit: bigint('time_limit', { mode: 'number' }), // Optional<i64>

    // Fee and earnings tracking
    entryFee: bigint('entry_fee', { mode: 'number' }).notNull().default(0), // Entry fee per player
    totalPrizePool: bigint('total_prize_pool', { mode: 'number' }).notNull().default(0), // Total prize pool
    tokenMint: varchar('token_mint', { length: 44 }), // Token mint address
    tokenVault: varchar('token_vault', { length: 44 }), // Token vault address
    prizeClaimed: boolean('prize_claimed').notNull().default(false), // Whether prize has been claimed

    // Financial state
    bankBalance: bigint('bank_balance', { mode: 'number' }).notNull(),
    freeParkingPool: bigint('free_parking_pool', { mode: 'number' }).notNull(),

    // Resource management
    housesRemaining: smallint('houses_remaining').notNull(), // 32 total
    hotelsRemaining: smallint('hotels_remaining').notNull(), // 12 total

    // Game completion
    winner: varchar('winner', { length: 44 }), // Optional<Pubkey>

    // Trade management from GameState (embedded trades)
    nextTradeId: smallint('next_trade_id').notNull(),
    activeTrades: json('active_trades').$type<TradeInfo[]>().notNull().default([]),

    // Embedded properties: one row per game contains all property states
    properties: json('properties').$type<EmbeddedPropertyState[]>().notNull().default([]),

    // Embedded historical/active trades if needed (optional mirror of activeTrades with details)
    trades: json('trades').$type<EmbeddedTradeState[]>().notNull().default([]),

    // Blockchain metadata
    accountCreatedAt: timestamp('account_created_at', { withTimezone: true }).notNull(),
    accountUpdatedAt: timestamp('account_updated_at', { withTimezone: true }).notNull(),
    createdSlot: bigint('created_slot', { mode: 'number' }).notNull(),
    updatedSlot: bigint('updated_slot', { mode: 'number' }).notNull(),
    lastSignature: varchar('last_signature', { length: 88 })
  },
  (table) => [
    // Performance indexes for game queries
    index('idx_games_game_id').on(table.gameId),
    index('idx_games_config_id').on(table.configId),
    index('idx_games_authority').on(table.authority),
    index('idx_games_status').on(table.gameStatus),
    index('idx_games_current_turn').on(table.currentTurn),
    index('idx_games_winner').on(table.winner),
    index('idx_games_created_at').on(table.createdAt),
    index('idx_games_updated_at').on(table.accountUpdatedAt),
    index('idx_games_composite_status_created').on(table.gameStatus, table.createdAt)
  ]
)

/**
 * Player states table - mirrors PlayerState struct
 * Each row represents one player account in one game
 */
export const playerStates = pgTable(
  'player_states',
  {
    // Primary key - blockchain account pubkey
    pubkey: varchar('pubkey', { length: 44 }).primaryKey(),

    // Core identification from PlayerState struct
    wallet: varchar('wallet', { length: 44 }).notNull(), // player's wallet
    game: varchar('game', { length: 44 }).notNull(), // game account pubkey

    // Financial state
    cashBalance: bigint('cash_balance', { mode: 'number' }).notNull(),
    netWorth: bigint('net_worth', { mode: 'number' }).notNull(),

    // Board position and status
    position: smallint('position').notNull(), // 0-39 board position
    inJail: boolean('in_jail').notNull(),
    jailTurns: smallint('jail_turns').notNull(),
    doublesCount: smallint('doubles_count').notNull(), // consecutive doubles
    isBankrupt: boolean('is_bankrupt').notNull(),

    // Property ownership - array of position numbers
    propertiesOwned: json('properties_owned').$type<number[]>().notNull(),

    // Special items and timing
    getOutOfJailCards: smallint('get_out_of_jail_cards').notNull(),
    lastRentCollected: bigint('last_rent_collected', { mode: 'number' }).notNull(),
    festivalBoostTurns: smallint('festival_boost_turns').notNull(),

    // Turn state management
    hasRolledDice: boolean('has_rolled_dice').notNull(),
    lastDiceRoll: json('last_dice_roll').$type<[number, number]>().notNull(),

    // Pending action flags
    needsPropertyAction: boolean('needs_property_action').notNull(),
    pendingPropertyPosition: smallint('pending_property_position'), // Optional<u8>
    needsChanceCard: boolean('needs_chance_card').notNull(),
    needsCommunityChestCard: boolean('needs_community_chest_card').notNull(),
    needsBankruptcyCheck: boolean('needs_bankruptcy_check').notNull(),
    needsSpecialSpaceAction: boolean('needs_special_space_action').notNull(),
    pendingSpecialSpacePosition: smallint('pending_special_space_position'), // Optional<u8>

    cardDrawnAt: bigint('card_drawn_at', { mode: 'number' }), // Optional<i64>

    // Blockchain metadata
    accountCreatedAt: timestamp('account_created_at', { withTimezone: true }).notNull(),
    accountUpdatedAt: timestamp('account_updated_at', { withTimezone: true }).notNull(),
    createdSlot: bigint('created_slot', { mode: 'number' }).notNull(),
    updatedSlot: bigint('updated_slot', { mode: 'number' }).notNull(),
    lastSignature: varchar('last_signature', { length: 88 })
  },
  (table) => [
    // Common query indexes
    index('idx_player_states_wallet').on(table.wallet),
    index('idx_player_states_game').on(table.game),
    index('idx_player_states_position').on(table.position),
    index('idx_player_states_in_jail').on(table.inJail),
    index('idx_player_states_is_bankrupt').on(table.isBankrupt),
    index('idx_player_states_cash_balance').on(table.cashBalance),
    index('idx_player_states_updated_at').on(table.accountUpdatedAt),
    index('idx_player_states_composite_game_wallet').on(table.game, table.wallet)
  ]
)

/**
 * Auction states table - mirrors AuctionState struct
 */
export const auctionStates = pgTable(
  'auction_states',
  {
    // Primary key - blockchain account pubkey
    pubkey: varchar('pubkey', { length: 44 }).primaryKey(),

    // Core auction fields
    game: varchar('game', { length: 44 }).notNull(),
    propertyPosition: smallint('property_position').notNull(),
    currentBid: bigint('current_bid', { mode: 'number' }).notNull(),
    highestBidder: varchar('highest_bidder', { length: 44 }), // Optional<Pubkey>

    // Timing and status
    startedAt: bigint('started_at', { mode: 'number' }).notNull(),
    endsAt: bigint('ends_at', { mode: 'number' }).notNull(),
    isActive: boolean('is_active').notNull(),
    bump: smallint('bump').notNull(),

    // Blockchain metadata
    accountCreatedAt: timestamp('account_created_at', { withTimezone: true }).notNull(),
    accountUpdatedAt: timestamp('account_updated_at', { withTimezone: true }).notNull(),
    createdSlot: bigint('created_slot', { mode: 'number' }).notNull(),
    updatedSlot: bigint('updated_slot', { mode: 'number' }).notNull(),
    lastSignature: varchar('last_signature', { length: 88 })
  },
  (table) => [
    index('idx_auction_states_game').on(table.game),
    index('idx_auction_states_property_position').on(table.propertyPosition),
    index('idx_auction_states_highest_bidder').on(table.highestBidder),
    index('idx_auction_states_is_active').on(table.isActive),
    index('idx_auction_states_ends_at').on(table.endsAt),
    index('idx_auction_states_updated_at').on(table.accountUpdatedAt)
  ]
)

/**
 * Processing queue for account updates and events
 */

/**
 * Sync status tracking
 */
export const syncComponentEnum = pgEnum('sync_component', [
  'historical_sync',
  'account_listener',
  'queue_processor',
  'live_sync',
  'gap_recovery'
] as const)

export const syncStatusTypeEnum = pgEnum('sync_status_type', ['running', 'stopped', 'completed', 'failed'] as const)

export const syncStatus = pgTable(
  'sync_status',
  {
    id: serial('id').primaryKey(),
    component: syncComponentEnum('component').notNull().unique(),
    lastProcessedSlot: bigint('last_processed_slot', { mode: 'number' }),
    lastProcessedSignature: varchar('last_processed_signature', { length: 88 }),
    lastProcessedTimestamp: bigint('last_processed_timestamp', { mode: 'number' }),
    accountsProcessed: integer('accounts_processed').default(0),
    status: syncStatusTypeEnum('status').notNull(),
    errorMessage: text('error_message'),

    // Timing
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
  },
  (table) => [
    index('idx_sync_status_component').on(table.component),
    index('idx_sync_status_status').on(table.status),
    index('idx_sync_status_updated_at').on(table.updatedAt)
  ]
)

/**
 * Game logs for event tracking
 */
export const gameLogs = pgTable(
  'game_logs',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gameId: varchar('game_id', { length: 44 }).notNull(),
    playerId: varchar('player_id', { length: 44 }).notNull(),
    playerName: varchar('player_name', { length: 100 }),
    type: gameLogTypeEnum('type').notNull(),
    message: text('message').notNull(),

    // Event-specific optional fields
    propertyName: varchar('property_name', { length: 100 }),
    position: smallint('position'),
    price: bigint('price', { mode: 'number' }),
    owner: varchar('owner', { length: 44 }),

    cardType: varchar('card_type', { length: 20 }), // 'chance' | 'community-chest'
    cardTitle: varchar('card_title', { length: 200 }),
    cardDescription: text('card_description'),
    cardIndex: smallint('card_index'),
    effectType: smallint('effect_type'),
    amount: bigint('amount', { mode: 'number' }),

    tradeId: varchar('trade_id', { length: 44 }),
    action: varchar('action', { length: 50 }),
    targetPlayer: varchar('target_player', { length: 44 }),
    targetPlayerName: varchar('target_player_name', { length: 100 }),
    offeredProperties: json('offered_properties').$type<number[]>(),
    requestedProperties: json('requested_properties').$type<number[]>(),
    offeredMoney: bigint('offered_money', { mode: 'number' }),
    requestedMoney: bigint('requested_money', { mode: 'number' }),

    fromPosition: smallint('from_position'),
    toPosition: smallint('to_position'),
    diceRoll: json('dice_roll').$type<[number, number]>(),
    doublesCount: smallint('doubles_count'),
    passedGo: boolean('passed_go'),

    jailReason: varchar('jail_reason', { length: 20 }), // 'doubles' | 'go_to_jail' | 'card'
    fineAmount: bigint('fine_amount', { mode: 'number' }),

    buildingType: varchar('building_type', { length: 10 }), // 'house' | 'hotel'

    taxType: varchar('tax_type', { length: 50 }),

    // Source and metadata
    signature: varchar('signature', { length: 88 }),
    error: text('error'),
    slot: bigint('slot', { mode: 'number' }),

    // Timestamps
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    accountCreatedAt: timestamp('account_created_at', { withTimezone: true }).defaultNow(),
    accountUpdatedAt: timestamp('account_updated_at', { withTimezone: true }).defaultNow()
  },
  (table) => [
    index('idx_game_logs_game_id').on(table.gameId),
    index('idx_game_logs_player_id').on(table.playerId),
    index('idx_game_logs_type').on(table.type),
    index('idx_game_logs_timestamp').on(table.timestamp),
    index('idx_game_logs_position').on(table.position),
    index('idx_game_logs_created_at').on(table.createdAt)
  ]
)

// ==================== TYPES ====================

export interface TradeInfo {
  id: number // u8 in Rust
  proposer: string // Pubkey as base58 string
  receiver: string // Pubkey as base58 string
  tradeType: InferEnum<typeof tradeTypeEnum> // TradeType enum
  proposerMoney: number // u64
  receiverMoney: number // u64
  proposerProperty: number | null // Option<u8>
  receiverProperty: number | null // Option<u8>
  status: InferEnum<typeof tradeStatusEnum> // TradeStatus enum
  createdAt: number // i64 timestamp
  expiresAt: number // i64 timestamp
}

export interface EmbeddedPropertyState {
  pubkey: string
  game?: string
  position: number
  owner: string | null
  price: number
  colorGroup: InferEnum<typeof colorGroupEnum>
  propertyType: InferEnum<typeof propertyTypeEnum>
  houses: number
  hasHotel: boolean
  isMortgaged: boolean
  rentBase: number
  rentWithColorGroup: number
  rentWithHouses: [number, number, number, number]
  rentWithHotel: number
  houseCost: number
  mortgageValue: number
  lastRentPaid: number
  init: boolean
  // Blockchain metadata
  accountCreatedAt?: string | Date
  accountUpdatedAt?: string | Date
  createdSlot?: number
  updatedSlot?: number
  lastSignature?: string
}

export interface EmbeddedTradeState {
  pubkey: string
  game?: string
  proposer: string
  receiver: string
  tradeType: InferEnum<typeof tradeTypeEnum>
  proposerMoney: number
  receiverMoney: number
  proposerProperty: number | null
  receiverProperty: number | null
  status: InferEnum<typeof tradeStatusEnum>
  createdAt: number
  expiresAt: number
  bump: number
  // Blockchain metadata
  accountCreatedAt?: string | Date
  accountUpdatedAt?: string | Date
  createdSlot?: number
  updatedSlot?: number
  lastSignature?: string
}

export type GameStatus = InferEnum<typeof gameStatusEnum>
export type TradeStatus = InferEnum<typeof tradeStatusEnum>
export type ColorGroup = InferEnum<typeof colorGroupEnum>
export type PropertyType = InferEnum<typeof propertyTypeEnum>
export type BuildingType = InferEnum<typeof buildingTypeEnum>
export type TradeType = InferEnum<typeof tradeTypeEnum>
export type GameLogType = InferEnum<typeof gameLogTypeEnum>

// Drizzle inferred types
export type SyncComponent = InferEnum<typeof syncComponentEnum>
export type SyncStatusType = InferEnum<typeof syncStatusTypeEnum>

export type PlatformConfig = typeof platformConfigs.$inferSelect
export type NewPlatformConfig = typeof platformConfigs.$inferInsert

export type GameState = typeof gameStates.$inferSelect
export type NewGameState = typeof gameStates.$inferInsert

export type PlayerState = typeof playerStates.$inferSelect
export type NewPlayerState = typeof playerStates.$inferInsert

export type PropertyState = EmbeddedPropertyState
export type NewPropertyState = EmbeddedPropertyState

export type TradeState = EmbeddedTradeState
export type NewTradeState = EmbeddedTradeState

export type EmbeddedProperty = EmbeddedPropertyState
export type EmbeddedTrade = EmbeddedTradeState

export type AuctionState = typeof auctionStates.$inferSelect
export type NewAuctionState = typeof auctionStates.$inferInsert

export type SyncStatusRecord = typeof syncStatus.$inferSelect
export type NewSyncStatusRecord = typeof syncStatus.$inferInsert

export type GameLog = typeof gameLogs.$inferSelect
export type NewGameLog = typeof gameLogs.$inferInsert

export interface GameLogEntry {
  id: string
  timestamp: number
  type: GameLogType
  playerId: string
  playerName?: string
  message: string
  details?: {
    // Property-related
    propertyName?: string
    position?: number
    price?: number
    owner?: string

    // Card-related
    cardType?: 'chance' | 'community-chest'
    cardTitle?: string
    cardDescription?: string
    cardIndex?: number
    effectType?: number
    amount?: number

    // Trade-related
    tradeId?: string
    action?: string
    targetPlayer?: string
    targetPlayerName?: string
    offeredProperties?: number[]
    requestedProperties?: number[]
    offeredMoney?: number
    requestedMoney?: number

    // Movement-related
    fromPosition?: number
    toPosition?: number
    diceRoll?: [number, number]
    doublesCount?: number
    passedGo?: boolean

    // Jail-related
    jailReason?: 'doubles' | 'go_to_jail' | 'card'
    fineAmount?: number

    // Building-related
    buildingType?: 'house' | 'hotel'

    // Tax-related
    taxType?: string

    // Source and error
    signature?: string
    error?: string
  }
}
