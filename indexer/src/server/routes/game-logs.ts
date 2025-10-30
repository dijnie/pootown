import { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { DatabasePort } from '#infra/db/db.port'
import { GameLogService, CreateGameLogRequest } from '#server/services/game-log.service'
import { getRequestId } from '../plugins/request-context'

// ==================== VALIDATION SCHEMAS ====================

const GameLogTypeSchema = Type.String({
  enum: [
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
  ]
})

const GameLogDetailsSchema = Type.Optional(
  Type.Object({
    // Property-related
    propertyName: Type.Optional(Type.String()),
    position: Type.Optional(Type.Number()),
    price: Type.Optional(Type.Number()),
    owner: Type.Optional(Type.String()),

    // Card-related
    cardType: Type.Optional(Type.String({ enum: ['chance', 'community-chest'] })),
    cardTitle: Type.Optional(Type.String()),
    cardDescription: Type.Optional(Type.String()),
    cardIndex: Type.Optional(Type.Number()),
    effectType: Type.Optional(Type.Number()),
    amount: Type.Optional(Type.Number()),

    // Trade-related
    tradeId: Type.Optional(Type.String()),
    action: Type.Optional(Type.String()),
    targetPlayer: Type.Optional(Type.String()),
    targetPlayerName: Type.Optional(Type.String()),
    offeredProperties: Type.Optional(Type.Array(Type.Number())),
    requestedProperties: Type.Optional(Type.Array(Type.Number())),
    offeredMoney: Type.Optional(Type.Number()),
    requestedMoney: Type.Optional(Type.Number()),

    // Movement-related
    fromPosition: Type.Optional(Type.Number()),
    toPosition: Type.Optional(Type.Number()),
    diceRoll: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
    doublesCount: Type.Optional(Type.Number()),
    passedGo: Type.Optional(Type.Boolean()),

    // Jail-related
    jailReason: Type.Optional(Type.String({ enum: ['doubles', 'go_to_jail', 'card'] })),
    fineAmount: Type.Optional(Type.Number()),

    // Building-related
    buildingType: Type.Optional(Type.String({ enum: ['house', 'hotel'] })),

    // Tax-related
    taxType: Type.Optional(Type.String()),

    // Other
    signature: Type.Optional(Type.String()),
    error: Type.Optional(Type.String())
  })
)

const CreateGameLogSchema = Type.Object({
  gameId: Type.String({ minLength: 32, maxLength: 44 }),
  playerId: Type.String({ minLength: 32, maxLength: 44 }),
  playerName: Type.Optional(Type.String({ maxLength: 100 })),
  type: GameLogTypeSchema,
  message: Type.String({ minLength: 1, maxLength: 1000 }),
  details: GameLogDetailsSchema,
  signature: Type.Optional(Type.String({ maxLength: 88 })),
  slot: Type.Optional(Type.Number({ minimum: 0 })),
  timestamp: Type.Optional(Type.Number({ minimum: 0 }))
})

const GameLogFiltersSchema = Type.Object({
  type: Type.Optional(GameLogTypeSchema),
  playerId: Type.Optional(Type.String()),
  playerName: Type.Optional(Type.String()),
  position: Type.Optional(Type.Number()),
  propertyName: Type.Optional(Type.String()),
  cardType: Type.Optional(Type.String({ enum: ['chance', 'community-chest'] })),
  tradeId: Type.Optional(Type.String()),
  targetPlayer: Type.Optional(Type.String()),
  action: Type.Optional(Type.String()),
  jailReason: Type.Optional(Type.String({ enum: ['doubles', 'go_to_jail', 'card'] })),
  buildingType: Type.Optional(Type.String({ enum: ['house', 'hotel'] })),
  taxType: Type.Optional(Type.String()),
  signature: Type.Optional(Type.String()),
  timestampFrom: Type.Optional(Type.Number()),
  timestampTo: Type.Optional(Type.Number()),
  hasError: Type.Optional(Type.Boolean()),
  // Pagination
  page: Type.Optional(Type.Number({ minimum: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  sortBy: Type.Optional(Type.String()),
  sortOrder: Type.Optional(Type.String({ enum: ['asc', 'desc'] }))
})

const GameLogEntrySchema = Type.Object({
  id: Type.String(),
  timestamp: Type.Number(),
  type: GameLogTypeSchema,
  playerId: Type.String(),
  playerName: Type.Optional(Type.String()),
  message: Type.String(),
  details: Type.Optional(
    Type.Object({
      // Property-related
      propertyName: Type.Optional(Type.String()),
      position: Type.Optional(Type.Number()),
      price: Type.Optional(Type.Number()),
      owner: Type.Optional(Type.String()),

      // Card-related
      cardType: Type.Optional(Type.String()),
      cardTitle: Type.Optional(Type.String()),
      cardDescription: Type.Optional(Type.String()),
      cardIndex: Type.Optional(Type.Number()),
      effectType: Type.Optional(Type.Number()),
      amount: Type.Optional(Type.Number()),

      // Trade-related
      tradeId: Type.Optional(Type.String()),
      action: Type.Optional(Type.String()),
      targetPlayer: Type.Optional(Type.String()),
      targetPlayerName: Type.Optional(Type.String()),
      offeredProperties: Type.Optional(Type.Array(Type.Number())),
      requestedProperties: Type.Optional(Type.Array(Type.Number())),
      offeredMoney: Type.Optional(Type.Number()),
      requestedMoney: Type.Optional(Type.Number()),

      // Movement-related
      fromPosition: Type.Optional(Type.Number()),
      toPosition: Type.Optional(Type.Number()),
      diceRoll: Type.Optional(Type.Array(Type.Number())),
      doublesCount: Type.Optional(Type.Number()),
      passedGo: Type.Optional(Type.Boolean()),

      // Jail-related
      jailReason: Type.Optional(Type.String()),
      fineAmount: Type.Optional(Type.Number()),

      // Building-related
      buildingType: Type.Optional(Type.String()),

      // Tax-related
      taxType: Type.Optional(Type.String()),

      // Other
      signature: Type.Optional(Type.String()),
      error: Type.Optional(Type.String())
    })
  )
})

const PaginationResponseSchema = (itemSchema: any) =>
  Type.Object({
    success: Type.Boolean(),
    data: Type.Object({
      data: Type.Array(itemSchema),
      pagination: Type.Object({
        page: Type.Number(),
        limit: Type.Number(),
        total: Type.Number(),
        totalPages: Type.Number(),
        hasNext: Type.Boolean(),
        hasPrev: Type.Boolean()
      })
    }),
    requestId: Type.String(),
    timestamp: Type.String()
  })

const ItemResponseSchema = (itemSchema: any) =>
  Type.Object({
    success: Type.Boolean(),
    data: itemSchema,
    requestId: Type.String(),
    timestamp: Type.String()
  })

const ErrorResponseSchema = Type.Object({
  success: Type.Boolean(),
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    details: Type.Optional(Type.String())
  }),
  requestId: Type.String(),
  timestamp: Type.String()
})

// ==================== ROUTES IMPLEMENTATION ====================

export default async function gameLogsRoutes(fastify: FastifyInstance) {
  const db: DatabasePort = fastify.db
  const gameLogService = new GameLogService(db)

  // ==================== CREATE GAME LOG ====================

  fastify.post('/game-logs', {
    schema: {
      tags: ['Game Logs'],
      summary: 'Create a new game log entry',
      body: CreateGameLogSchema,
      response: {
        201: ItemResponseSchema(GameLogEntrySchema),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const logRequest = request.body as CreateGameLogRequest

      try {
        // Validate the request data
        const validationErrors = gameLogService.validateGameLogData(logRequest)
        if (validationErrors.length > 0) {
          reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid game log data',
              details: validationErrors.join(', ')
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        // Create the game log
        const gameLog = await gameLogService.create(logRequest)

        // Convert to GameLogEntry format for response
        const gameLogEntry = {
          id: gameLog.id,
          timestamp: Number(gameLog.timestamp),
          type: gameLog.type,
          playerId: gameLog.playerId,
          playerName: gameLog.playerName || undefined,
          message: gameLog.message,
          details: logRequest.details
        }

        reply.code(201).send({
          success: true,
          data: gameLogEntry,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId }, 'Failed to create game log')
        reply.code(500).send({
          success: false,
          error: {
            code: 'CREATE_GAME_LOG_FAILED',
            message: 'Failed to create game log',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET GAME LOGS ====================

  fastify.get('/games/:gameId/logs', {
    schema: {
      tags: ['Game Logs'],
      summary: 'Get game logs for a specific game',
      params: Type.Object({
        gameId: Type.String({ minLength: 32, maxLength: 44 })
      }),
      querystring: GameLogFiltersSchema,
      response: {
        200: PaginationResponseSchema(GameLogEntrySchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId } = request.params as { gameId: string }
      const filters = request.query as any

      try {
        const pagination = {
          page: filters.page,
          limit: filters.limit,
          sortBy: filters.sortBy || 'timestamp',
          sortOrder: filters.sortOrder || 'desc'
        }

        // Remove pagination fields from filters
        const { page: _page, limit: _limit, sortBy: _sortBy, sortOrder: _sortOrder, ...logFilters } = filters

        const result = await gameLogService.getGameLogEntries(gameId, logFilters, pagination)

        const paginationMeta = {
          page: pagination.page || 1,
          limit: pagination.limit || 20,
          total: result.total,
          totalPages: Math.ceil(result.total / (pagination.limit || 20)),
          hasNext: (pagination.page || 1) * (pagination.limit || 20) < result.total,
          hasPrev: (pagination.page || 1) > 1
        }

        reply.code(200).send({
          success: true,
          data: {
            data: result.data,
            pagination: paginationMeta
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch game logs')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_GAME_LOGS_FAILED',
            message: 'Failed to fetch game logs',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET GAME LOGS BY TYPE ====================

  fastify.get('/games/:gameId/logs/type/:type', {
    schema: {
      tags: ['Game Logs'],
      summary: 'Get game logs of a specific type for a game',
      params: Type.Object({
        gameId: Type.String({ minLength: 32, maxLength: 44 }),
        type: GameLogTypeSchema
      }),
      querystring: Type.Object({
        page: Type.Optional(Type.Number({ minimum: 1 })),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        sortBy: Type.Optional(Type.String()),
        sortOrder: Type.Optional(Type.String({ enum: ['asc', 'desc'] }))
      }),
      response: {
        200: PaginationResponseSchema(GameLogEntrySchema),
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId, type } = request.params as { gameId: string; type: string }
      const pagination = request.query as any

      try {
        const result = await gameLogService.getLogsByType(
          gameId,
          type as any,
          {},
          {
            page: pagination.page,
            limit: pagination.limit,
            sortBy: pagination.sortBy || 'timestamp',
            sortOrder: pagination.sortOrder || 'desc'
          }
        )

        // Convert to GameLogEntry format
        const entries = result.data.map((log) => ({
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
            owner: log.owner || undefined
            // Add other detail fields as needed
          }
        }))

        const paginationMeta = {
          page: pagination.page || 1,
          limit: pagination.limit || 20,
          total: result.total,
          totalPages: Math.ceil(result.total / (pagination.limit || 20)),
          hasNext: (pagination.page || 1) * (pagination.limit || 20) < result.total,
          hasPrev: (pagination.page || 1) > 1
        }

        reply.code(200).send({
          success: true,
          data: {
            items: entries,
            pagination: paginationMeta
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId, type }, 'Failed to fetch game logs by type')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_GAME_LOGS_BY_TYPE_FAILED',
            message: 'Failed to fetch game logs by type'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET PLAYER LOGS IN GAME ====================

  fastify.get('/games/:gameId/players/:playerId/logs', {
    schema: {
      tags: ['Game Logs'],
      summary: 'Get logs for a specific player in a specific game',
      params: Type.Object({
        gameId: Type.String({ minLength: 32, maxLength: 44 }),
        playerId: Type.String({ minLength: 32, maxLength: 44 })
      }),
      querystring: Type.Object({
        type: Type.Optional(GameLogTypeSchema),
        page: Type.Optional(Type.Number({ minimum: 1 })),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        sortBy: Type.Optional(Type.String()),
        sortOrder: Type.Optional(Type.String({ enum: ['asc', 'desc'] }))
      }),
      response: {
        200: PaginationResponseSchema(GameLogEntrySchema),
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId, playerId } = request.params as { gameId: string; playerId: string }
      const query = request.query as any

      try {
        const filters = {
          playerId,
          ...(query.type && { type: query.type })
        }

        const pagination = {
          page: query.page,
          limit: query.limit,
          sortBy: query.sortBy || 'timestamp',
          sortOrder: query.sortOrder || 'desc'
        }

        const result = await gameLogService.getGameLogEntries(gameId, filters, pagination)

        const paginationMeta = {
          page: pagination.page || 1,
          limit: pagination.limit || 20,
          total: result.total,
          totalPages: Math.ceil(result.total / (pagination.limit || 20)),
          hasNext: (pagination.page || 1) * (pagination.limit || 20) < result.total,
          hasPrev: (pagination.page || 1) > 1
        }

        reply.code(200).send({
          success: true,
          data: {
            items: result.data,
            pagination: paginationMeta
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId, playerId }, 'Failed to fetch player logs')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PLAYER_LOGS_FAILED',
            message: 'Failed to fetch player logs'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== DELETE GAME LOGS ====================

  fastify.delete('/games/:gameId/logs', {
    schema: {
      tags: ['Game Logs'],
      summary: 'Delete all logs for a specific game (admin operation)',
      params: Type.Object({
        gameId: Type.String({ minLength: 32, maxLength: 44 })
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String(),
          requestId: Type.String(),
          timestamp: Type.String()
        }),
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId } = request.params as { gameId: string }

      try {
        await gameLogService.deleteGameLogs(gameId)

        reply.code(200).send({
          success: true,
          message: `All logs for game ${gameId} have been deleted`,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId }, 'Failed to delete game logs')
        reply.code(500).send({
          success: false,
          error: {
            code: 'DELETE_GAME_LOGS_FAILED',
            message: 'Failed to delete game logs'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })
}
