import { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { DatabasePort } from '#infra/db/db.port'
import { TradeService } from '#server/services/trade.service'
import { GameService } from '#server/services/game.service'
import { getRequestId } from '../plugins/request-context'
import {
  TradeStateSchema,
  TradeStateFiltersSchema,
  GameScopedFiltersSchema,
  PaginatedResponseSchema,
  ItemResponseSchema,
  ErrorResponseSchema,
  PaginationRequestSchema
} from '#shared/api/response-types'

export default async function tradeStatesRoutes(fastify: FastifyInstance) {
  const db: DatabasePort = fastify.db
  const tradeService = new TradeService(db)
  const gameService = new GameService(db)

  // Helper function to get game pubkey from gameId
  async function getGamePubkey(gameId: number): Promise<string | null> {
    const gameState = await gameService.getByGameId(gameId)
    return gameState?.pubkey ?? null
  }

  // ==================== LIST TRADES IN GAME ====================

  fastify.get('/trade-states', {
    schema: {
      tags: ['Trade States'],
      summary: 'List all trade states with game-scoped filtering',
      querystring: Type.Intersect([TradeStateFiltersSchema, GameScopedFiltersSchema, PaginationRequestSchema]),
      response: {
        200: PaginatedResponseSchema(TradeStateSchema),
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()

      try {
        const filters = request.query as any

        // Validate that gameId is provided
        if (!filters.gameId) {
          reply.code(400).send({
            success: false,
            error: {
              code: 'GAME_ID_REQUIRED',
              message: 'gameId is required for trade operations'
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        // Get game pubkey from gameId
        const gamePubkey = await getGamePubkey(filters.gameId)
        if (!gamePubkey) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'GAME_NOT_FOUND',
              message: `Game with ID ${filters.gameId} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        const pagination = {
          page: filters.page,
          limit: filters.limit,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder
        }

        // Convert gameId to game pubkey in filters
        const tradeFilters = { ...filters, game: gamePubkey }
        delete tradeFilters.gameId

        const result = await tradeService.getAll(tradeFilters, pagination)

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
        fastify.log.error({ error, requestId }, 'Failed to fetch trade states')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_TRADE_STATES_FAILED',
            message: 'Failed to fetch trade states',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET SINGLE TRADE STATE ====================

  fastify.get('/trade-states/:pubkey', {
    schema: {
      tags: ['Trade States'],
      summary: 'Get a specific trade state by pubkey',
      params: Type.Object({
        pubkey: Type.String({ minLength: 32, maxLength: 44 })
      }),
      querystring: Type.Object({
        gameId: Type.Optional(Type.Number({ minimum: 0 }))
      }),
      response: {
        200: ItemResponseSchema(TradeStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { pubkey } = request.params as { pubkey: string }
      const { gameId } = request.query as { gameId?: number }

      try {
        const tradeState = await tradeService.getByPubkey(pubkey)

        if (!tradeState) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'TRADE_STATE_NOT_FOUND',
              message: `Trade state with pubkey ${pubkey} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        // Verify game scope if gameId provided
        if (gameId) {
          const gamePubkey = await getGamePubkey(gameId)
          if (!gamePubkey || tradeState.game !== gamePubkey) {
            reply.code(404).send({
              success: false,
              error: {
                code: 'TRADE_NOT_IN_GAME',
                message: `Trade ${pubkey} is not in game ${gameId}`
              },
              requestId,
              timestamp: new Date().toISOString()
            })
            return
          }
        }

        reply.code(200).send({
          success: true,
          data: tradeState,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, pubkey }, 'Failed to fetch trade state')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_TRADE_STATE_FAILED',
            message: 'Failed to fetch trade state',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET TRADES BY GAME ID ====================

  fastify.get('/trade-states/by-game/:gameId', {
    schema: {
      tags: ['Trade States'],
      summary: 'Get all trades in a specific game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(TradeStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId } = request.params as { gameId: number }

      try {
        // Get game pubkey from gameId
        const gamePubkey = await getGamePubkey(gameId)
        if (!gamePubkey) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'GAME_NOT_FOUND',
              message: `Game with ID ${gameId} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        const pagination = request.query as any
        const result = await tradeService.getTradesByGame(gamePubkey, pagination)

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
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch trades by game')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_TRADES_BY_GAME_FAILED',
            message: 'Failed to fetch trades by game'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET TRADES BY PLAYER IN GAME ====================

  fastify.get('/trade-states/by-game/:gameId/player/:player', {
    schema: {
      tags: ['Trade States'],
      summary: 'Get trades involving specific player in a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 }),
        player: Type.String({ minLength: 32, maxLength: 44 })
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(TradeStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId, player } = request.params as { gameId: number; player: string }

      try {
        // Get game pubkey from gameId
        const gamePubkey = await getGamePubkey(gameId)
        if (!gamePubkey) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'GAME_NOT_FOUND',
              message: `Game with ID ${gameId} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        const pagination = request.query as any
        const result = await tradeService.getTradesForPlayer(gamePubkey, player, pagination)

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
        fastify.log.error({ error, requestId, gameId, player }, 'Failed to fetch trades for player')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_TRADES_FOR_PLAYER_FAILED',
            message: 'Failed to fetch trades for player'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET TRADES BY STATUS IN GAME ====================

  fastify.get('/trade-states/by-game/:gameId/status/:status', {
    schema: {
      tags: ['Trade States'],
      summary: 'Get trades by status in a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 }),
        status: Type.String()
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(TradeStateSchema),
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId, status } = request.params as { gameId: number; status: string }

      try {
        // Validate status enum value
        const validStatuses = ['Pending', 'Accepted', 'Rejected', 'Cancelled', 'Expired']
        if (!validStatuses.includes(status)) {
          reply.code(400).send({
            success: false,
            error: {
              code: 'INVALID_TRADE_STATUS',
              message: `Invalid trade status: ${status}. Must be one of: ${validStatuses.join(', ')}`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        // Get game pubkey from gameId
        const gamePubkey = await getGamePubkey(gameId)
        if (!gamePubkey) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'GAME_NOT_FOUND',
              message: `Game with ID ${gameId} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        const pagination = request.query as any
        const result = await tradeService.getTradesByStatus(gamePubkey, status as any, pagination)

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
        fastify.log.error({ error, requestId, gameId, status }, 'Failed to fetch trades by status')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_TRADES_BY_STATUS_FAILED',
            message: 'Failed to fetch trades by status'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET ACTIVE TRADES IN GAME ====================

  fastify.get('/trade-states/by-game/:gameId/active', {
    schema: {
      tags: ['Trade States'],
      summary: 'Get all active (pending) trades in a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(TradeStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId } = request.params as { gameId: number }

      try {
        // Get game pubkey from gameId
        const gamePubkey = await getGamePubkey(gameId)
        if (!gamePubkey) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'GAME_NOT_FOUND',
              message: `Game with ID ${gameId} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        const pagination = request.query as any
        const result = await tradeService.getActiveTrades(gamePubkey, pagination)

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
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch active trades')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_ACTIVE_TRADES_FAILED',
            message: 'Failed to fetch active trades'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET TRADE STATISTICS IN GAME ====================

  fastify.get('/trade-states/by-game/:gameId/stats', {
    schema: {
      tags: ['Trade States'],
      summary: 'Get aggregated trade statistics for a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      response: {
        200: ItemResponseSchema(
          Type.Object({
            totalTrades: Type.Number(),
            activeTrades: Type.Number(),
            completedTrades: Type.Number(),
            rejectedTrades: Type.Number(),
            cancelledTrades: Type.Number(),
            averageTradeValue: Type.Number(),
            mostActiveTradingPlayer: Type.Optional(Type.String()),
            averageTradeCompletionTime: Type.Number()
          })
        ),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId } = request.params as { gameId: number }

      try {
        // Get game pubkey from gameId
        const gamePubkey = await getGamePubkey(gameId)
        if (!gamePubkey) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'GAME_NOT_FOUND',
              message: `Game with ID ${gameId} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        const stats = await tradeService.getTradeStats()

        reply.code(200).send({
          success: true,
          data: stats,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch trade statistics')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_TRADE_STATS_FAILED',
            message: 'Failed to fetch trade statistics'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })
}
