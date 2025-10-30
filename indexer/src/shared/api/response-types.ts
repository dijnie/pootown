/**
 * Shared API Response Types
 *
 * Provides consistent response structure across all API endpoints.
 * All routes should use these standardized types for uniformity.
 *
 * Follows Google API Design Guide principles:
 * - Consistent pagination structure
 * - Standard error format
 * - Predictable response wrapper
 *
 * @author Senior Engineer - Following Google Code Standards
 */

import { Type, Static } from '@sinclair/typebox'

// ==================== PAGINATION TYPES ====================

/**
 * Standard pagination request parameters
 * Used across all list endpoints for consistent querying
 */
export const PaginationRequestSchema = Type.Object(
  {
    page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
    sortBy: Type.Optional(Type.String()),
    sortOrder: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')], { default: 'desc' }))
  },
  { additionalProperties: false }
)

/**
 * Standard pagination response metadata
 * Provides consistent pagination information across all endpoints
 */
export const PaginationResponseSchema = Type.Object({
  page: Type.Number({ minimum: 1 }),
  limit: Type.Number({ minimum: 1, maximum: 100 }),
  total: Type.Number({ minimum: 0 }),
  totalPages: Type.Number({ minimum: 0 }),
  hasNext: Type.Boolean(),
  hasPrev: Type.Boolean()
})

export type PaginationRequest = Static<typeof PaginationRequestSchema>
export type PaginationResponse = Static<typeof PaginationResponseSchema>

// ==================== GAME-SCOPED FILTERING ====================

/**
 * Game-scoped query filters
 * All game-related entities (players, properties, trades) must include gameId
 */
export const GameScopedFiltersSchema = Type.Object(
  {
    gameId: Type.String({ minLength: 32, maxLength: 44, description: 'Game state pubkey' }),
    ...PaginationRequestSchema.properties
  },
  { additionalProperties: true }
)

export type GameScopedFilters = Static<typeof GameScopedFiltersSchema>

// ==================== RESPONSE WRAPPERS ====================

/**
 * Success response wrapper
 * Wraps all successful API responses with consistent metadata
 */
export const SuccessResponseSchema = (dataSchema: any) =>
  Type.Object({
    success: Type.Literal(true),
    data: dataSchema,
    requestId: Type.String(),
    timestamp: Type.String({ format: 'date-time' })
  })

/**
 * Paginated list response wrapper
 * Standard format for all list endpoints with pagination
 */
export const PaginatedResponseSchema = (itemSchema: any) =>
  SuccessResponseSchema(
    Type.Object({
      items: Type.Array(itemSchema),
      pagination: PaginationResponseSchema
    })
  )

/**
 * Single item response wrapper
 * Standard format for single item endpoints
 */
export const ItemResponseSchema = (itemSchema: any) => SuccessResponseSchema(itemSchema)

/**
 * Error response wrapper
 * Standard format for all error responses
 */
export const ErrorResponseSchema = Type.Object({
  success: Type.Literal(false),
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    details: Type.Optional(Type.Unknown())
  }),
  requestId: Type.String(),
  timestamp: Type.String({ format: 'date-time' })
})

export type ErrorResponse = Static<typeof ErrorResponseSchema>

// ==================== ENTITY SCHEMAS ====================

/**
 * Game State entity schema for API responses
 */
export const GameStateSchema = Type.Object({
  pubkey: Type.String(),
  gameId: Type.Number(),
  authority: Type.String(),
  gameStatus: Type.Union([Type.Literal('WaitingForPlayers'), Type.Literal('InProgress'), Type.Literal('Finished')]),
  currentPlayers: Type.Number(),
  maxPlayers: Type.Number(),
  currentTurn: Type.Number(),
  players: Type.Array(Type.String()),
  bankBalance: Type.Number(),
  createdAt: Type.Number(),
  winner: Type.Optional(Type.String()),
  accountUpdatedAt: Type.String({ format: 'date-time' })
})

/**
 * Player State entity schema for API responses
 */
export const PlayerStateSchema = Type.Object({
  pubkey: Type.String(),
  wallet: Type.String(),
  game: Type.String({ description: 'Game state pubkey this player belongs to' }),
  cashBalance: Type.Number(),
  netWorth: Type.Number(),
  position: Type.Number(),
  inJail: Type.Boolean(),
  isBankrupt: Type.Boolean(),
  propertiesOwned: Type.Array(Type.Number()),
  getOutOfJailCards: Type.Number(),
  hasRolledDice: Type.Boolean(),
  lastDiceRoll: Type.Array(Type.Number(), { minItems: 2, maxItems: 2 }),
  accountUpdatedAt: Type.String({ format: 'date-time' })
})

/**
 * Property State entity schema for API responses
 */
export const PropertyStateSchema = Type.Object({
  pubkey: Type.String(),
  game: Type.String({ description: 'Game state pubkey this property belongs to' }),
  position: Type.Number(),
  owner: Type.Optional(Type.String()),
  price: Type.Number(),
  colorGroup: Type.String(),
  propertyType: Type.String(),
  houses: Type.Number(),
  hasHotel: Type.Boolean(),
  isMortgaged: Type.Boolean(),
  rentBase: Type.Number(),
  rentWithColorGroup: Type.Number(),
  rentWithHouses: Type.Array(Type.Number()),
  houseCost: Type.Number(),
  accountUpdatedAt: Type.String({ format: 'date-time' })
})

/**
 * Trade State entity schema for API responses
 */
export const TradeStateSchema = Type.Object({
  pubkey: Type.String(),
  game: Type.String({ description: 'Game state pubkey this trade belongs to' }),
  proposer: Type.String(),
  receiver: Type.String(),
  tradeType: Type.String(),
  proposerMoney: Type.Number(),
  receiverMoney: Type.Number(),
  proposerProperty: Type.Optional(Type.Number()),
  receiverProperty: Type.Optional(Type.Number()),
  status: Type.Union([
    Type.Literal('Pending'),
    Type.Literal('Accepted'),
    Type.Literal('Rejected'),
    Type.Literal('Cancelled'),
    Type.Literal('Expired')
  ]),
  createdAt: Type.Number(),
  expiresAt: Type.Number(),
  accountUpdatedAt: Type.String({ format: 'date-time' })
})

/**
 * Game Log entity schema for API responses
 */
export const GameLogSchema = Type.Object({
  id: Type.String(),
  gameId: Type.String({ description: 'Game state pubkey' }),
  timestamp: Type.Number(),
  type: Type.String(),
  playerId: Type.Optional(Type.String()),
  playerName: Type.Optional(Type.String()),
  message: Type.String(),
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  createdAt: Type.String({ format: 'date-time' })
})

// ==================== ROUTE-SPECIFIC FILTERS ====================

/**
 * Game state query filters
 */
export const GameStateFiltersSchema = Type.Object(
  {
    authority: Type.Optional(Type.String()),
    gameStatus: Type.Optional(Type.String()),
    maxPlayers: Type.Optional(Type.Number()),
    ...PaginationRequestSchema.properties
  },
  { additionalProperties: false }
)

/**
 * Player state query filters (game-scoped)
 */
export const PlayerStateFiltersSchema = Type.Object(
  {
    gameId: Type.String({ description: 'Required: Game state pubkey' }),
    wallet: Type.Optional(Type.String()),
    inJail: Type.Optional(Type.Boolean()),
    isBankrupt: Type.Optional(Type.Boolean()),
    position: Type.Optional(Type.Number()),
    ...PaginationRequestSchema.properties
  },
  { additionalProperties: false }
)

/**
 * Property state query filters (game-scoped)
 */
export const PropertyStateFiltersSchema = Type.Object(
  {
    gameId: Type.String({ description: 'Required: Game state pubkey' }),
    owner: Type.Optional(Type.String()),
    colorGroup: Type.Optional(Type.String()),
    propertyType: Type.Optional(Type.String()),
    isMortgaged: Type.Optional(Type.Boolean()),
    position: Type.Optional(Type.Number()),
    ...PaginationRequestSchema.properties
  },
  { additionalProperties: false }
)

/**
 * Trade state query filters (game-scoped)
 */
export const TradeStateFiltersSchema = Type.Object(
  {
    gameId: Type.String({ description: 'Required: Game state pubkey' }),
    proposer: Type.Optional(Type.String()),
    receiver: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
    tradeType: Type.Optional(Type.String()),
    ...PaginationRequestSchema.properties
  },
  { additionalProperties: false }
)

/**
 * Game log query filters (game-scoped)
 */
export const GameLogFiltersSchema = Type.Object(
  {
    gameId: Type.String({ description: 'Required: Game state pubkey' }),
    playerId: Type.Optional(Type.String()),
    type: Type.Optional(Type.String()),
    startTime: Type.Optional(Type.Number()),
    endTime: Type.Optional(Type.Number()),
    ...PaginationRequestSchema.properties
  },
  { additionalProperties: false }
)

// Export all filter types
export type GameStateFilters = Static<typeof GameStateFiltersSchema>
export type PlayerStateFilters = Static<typeof PlayerStateFiltersSchema>
export type PropertyStateFilters = Static<typeof PropertyStateFiltersSchema>
export type TradeStateFilters = Static<typeof TradeStateFiltersSchema>
export type GameLogFilters = Static<typeof GameLogFiltersSchema>

// Export all entity types
export type GameStateResponse = Static<typeof GameStateSchema>
export type PlayerStateResponse = Static<typeof PlayerStateSchema>
export type PropertyStateResponse = Static<typeof PropertyStateSchema>
export type TradeStateResponse = Static<typeof TradeStateSchema>
export type GameLogResponse = Static<typeof GameLogSchema>
