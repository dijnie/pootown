import { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { DatabasePort } from '#infra/db/db.port'
import { GameService } from '#server/services/game.service'

import { getRequestId } from '../plugins/request-context'
import {
  GameStateSchema,
  GameStateFiltersSchema,
  PaginatedResponseSchema,
  ItemResponseSchema,
  ErrorResponseSchema,
  PaginationRequestSchema
} from '#shared/api/response-types'

export default async function gameStatesRoutes(fastify: FastifyInstance) {
  const db: DatabasePort = fastify.db
  const gameService = new GameService(db)

  // ==================== LIST GAME STATES ====================

  fastify.get('/game-states', {
    schema: {
      tags: ['Game States'],
      summary: 'List all game states with filtering and pagination',
      querystring: GameStateFiltersSchema,
      response: {
        200: PaginatedResponseSchema(GameStateSchema),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()

      try {
        const filters = request.query as any
        const pagination = {
          page: filters.page,
          limit: filters.limit,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder
        }

        const result = await gameService.getAll(filters, pagination)

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
        fastify.log.error({ error, requestId }, 'Failed to fetch game states')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_GAME_STATES_FAILED',
            message: 'Failed to fetch game states',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET SINGLE GAME STATE ====================

  fastify.get('/game-states/:pubkey', {
    schema: {
      tags: ['Game States'],
      summary: 'Get a specific game state by pubkey',
      params: Type.Object({
        pubkey: Type.String({ minLength: 32, maxLength: 44 })
      }),
      response: {
        200: ItemResponseSchema(GameStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { pubkey } = request.params as { pubkey: string }

      try {
        const gameState = await gameService.getByPubkey(pubkey)

        if (!gameState) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'GAME_STATE_NOT_FOUND',
              message: `Game state with pubkey ${pubkey} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        reply.code(200).send({
          success: true,
          data: gameState,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, pubkey }, 'Failed to fetch game state')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_GAME_STATE_FAILED',
            message: 'Failed to fetch game state',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET GAME STATE BY GAME ID ====================

  fastify.get('/game-states/by-game-id/:gameId', {
    schema: {
      tags: ['Game States'],
      summary: 'Get game state by numeric game ID',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      response: {
        200: ItemResponseSchema(GameStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId } = request.params as { gameId: number }

      try {
        const gameState = await gameService.getByGameId(gameId)

        if (!gameState) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'GAME_STATE_NOT_FOUND',
              message: `Game state with game ID ${gameId} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        reply.code(200).send({
          success: true,
          data: gameState,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch game state by game ID')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_GAME_STATE_FAILED',
            message: 'Failed to fetch game state',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET ACTIVE GAMES ====================

  fastify.get('/game-states/active', {
    schema: {
      tags: ['Game States'],
      summary: 'List all active (in-progress) game states',
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(GameStateSchema),
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()

      try {
        const pagination = request.query as any
        const result = await gameService.getActiveGames(pagination)

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
        fastify.log.error({ error, requestId }, 'Failed to fetch active game states')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_ACTIVE_GAMES_FAILED',
            message: 'Failed to fetch active game states'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET GAMES BY AUTHORITY ====================

  fastify.get('/game-states/by-authority/:authority', {
    schema: {
      tags: ['Game States'],
      summary: 'List game states created by specific authority',
      params: Type.Object({
        authority: Type.String({ minLength: 32, maxLength: 44 })
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(GameStateSchema),
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { authority } = request.params as { authority: string }

      try {
        const pagination = request.query as any
        const result = await gameService.getGamesByAuthority(authority, pagination)

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
        fastify.log.error({ error, requestId, authority }, 'Failed to fetch games by authority')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_GAMES_BY_AUTHORITY_FAILED',
            message: 'Failed to fetch game states by authority'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET GAME STATISTICS ====================

  fastify.get('/game-states/stats', {
    schema: {
      tags: ['Game States'],
      summary: 'Get aggregated game statistics',
      response: {
        200: ItemResponseSchema(
          Type.Object({
            totalGames: Type.Number(),
            activeGames: Type.Number(),
            completedGames: Type.Number(),
            waitingForPlayersGames: Type.Number(),
            averagePlayersPerGame: Type.Number(),
            mostPopularGameMode: Type.String()
          })
        ),
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()

      try {
        const stats = await gameService.getGameStats()

        reply.code(200).send({
          success: true,
          data: stats,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId }, 'Failed to fetch game statistics')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_GAME_STATS_FAILED',
            message: 'Failed to fetch game statistics'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })
}
