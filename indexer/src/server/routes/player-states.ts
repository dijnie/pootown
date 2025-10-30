import { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { DatabasePort } from '#infra/db/db.port'
import { PlayerService } from '#server/services/player.service'
import { GameService } from '#server/services/game.service'
import { getRequestId } from '../plugins/request-context'
import {
  PlayerStateSchema,
  PlayerStateFiltersSchema,
  GameScopedFiltersSchema,
  PaginatedResponseSchema,
  ItemResponseSchema,
  ErrorResponseSchema,
  PaginationRequestSchema
} from '#shared/api/response-types'

export default async function playerStatesRoutes(fastify: FastifyInstance) {
  const db: DatabasePort = fastify.db
  const playerService = new PlayerService(db)
  const gameService = new GameService(db)

  // Helper function to get game pubkey from gameId
  async function getGamePubkey(gameId: number): Promise<string | null> {
    const gameState = await gameService.getByGameId(gameId)
    return gameState?.pubkey ?? null
  }

  // ==================== LIST PLAYERS IN GAME ====================

  fastify.get('/player-states', {
    schema: {
      tags: ['Player States'],
      summary: 'List all player states with game-scoped filtering',
      querystring: Type.Intersect([PlayerStateFiltersSchema, GameScopedFiltersSchema, PaginationRequestSchema]),
      response: {
        200: PaginatedResponseSchema(PlayerStateSchema),
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
              message: 'gameId is required for player operations'
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
        const playerFilters = { ...filters, game: gamePubkey }
        delete playerFilters.gameId

        const result = await playerService.getAll(playerFilters, pagination)

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
        fastify.log.error({ error, requestId }, 'Failed to fetch player states')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PLAYER_STATES_FAILED',
            message: 'Failed to fetch player states',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET SINGLE PLAYER STATE ====================

  fastify.get('/player-states/:pubkey', {
    schema: {
      tags: ['Player States'],
      summary: 'Get a specific player state by pubkey',
      params: Type.Object({
        pubkey: Type.String({ minLength: 32, maxLength: 44 })
      }),
      querystring: Type.Object({
        gameId: Type.Optional(Type.Number({ minimum: 0 }))
      }),
      response: {
        200: ItemResponseSchema(PlayerStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { pubkey } = request.params as { pubkey: string }
      const { gameId } = request.query as { gameId?: number }

      try {
        const playerState = await playerService.getByPubkey(pubkey)

        if (!playerState) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'PLAYER_STATE_NOT_FOUND',
              message: `Player state with pubkey ${pubkey} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        // Verify game scope if gameId provided
        if (gameId) {
          const gamePubkey = await getGamePubkey(gameId)
          if (!gamePubkey || playerState.game !== gamePubkey) {
            reply.code(404).send({
              success: false,
              error: {
                code: 'PLAYER_NOT_IN_GAME',
                message: `Player ${pubkey} is not in game ${gameId}`
              },
              requestId,
              timestamp: new Date().toISOString()
            })
            return
          }
        }

        reply.code(200).send({
          success: true,
          data: playerState,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, pubkey }, 'Failed to fetch player state')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PLAYER_STATE_FAILED',
            message: 'Failed to fetch player state',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET PLAYERS BY GAME ID ====================

  fastify.get('/player-states/by-game/:gameId', {
    schema: {
      tags: ['Player States'],
      summary: 'Get all players in a specific game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(PlayerStateSchema),
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
        const result = await playerService.getPlayersByGame(gamePubkey, pagination)

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
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch players by game')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PLAYERS_BY_GAME_FAILED',
            message: 'Failed to fetch players by game'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET PLAYER BY WALLET IN GAME ====================

  fastify.get('/player-states/by-game/:gameId/wallet/:wallet', {
    schema: {
      tags: ['Player States'],
      summary: 'Get specific player by wallet address in a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 }),
        wallet: Type.String({ minLength: 32, maxLength: 44 })
      }),
      response: {
        200: ItemResponseSchema(PlayerStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId, wallet } = request.params as { gameId: number; wallet: string }

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

        const playerState = await playerService.getPlayerByWallet(gamePubkey, wallet)

        if (!playerState) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'PLAYER_NOT_IN_GAME',
              message: `Player with wallet ${wallet} not found in game ${gameId}`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        reply.code(200).send({
          success: true,
          data: playerState,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId, wallet }, 'Failed to fetch player by wallet')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PLAYER_BY_WALLET_FAILED',
            message: 'Failed to fetch player by wallet'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET ACTIVE PLAYERS IN GAME ====================

  fastify.get('/player-states/by-game/:gameId/active', {
    schema: {
      tags: ['Player States'],
      summary: 'Get all active (not bankrupt) players in a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(PlayerStateSchema),
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
        const result = await playerService.getActivePlayers(gamePubkey, pagination)

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
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch active players')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_ACTIVE_PLAYERS_FAILED',
            message: 'Failed to fetch active players'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET PLAYER STATISTICS IN GAME ====================

  fastify.get('/player-states/by-game/:gameId/stats', {
    schema: {
      tags: ['Player States'],
      summary: 'Get aggregated player statistics for a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      response: {
        200: ItemResponseSchema(
          Type.Object({
            totalPlayers: Type.Number(),
            activePlayers: Type.Number(),
            bankruptPlayers: Type.Number(),
            averageCash: Type.Number(),
            averageNetWorth: Type.Number(),
            playerWithMostProperties: Type.Optional(Type.String()),
            richestPlayer: Type.Optional(Type.String())
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

        const stats = await playerService.getPlayerStats(gamePubkey)

        reply.code(200).send({
          success: true,
          data: stats,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch player statistics')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PLAYER_STATS_FAILED',
            message: 'Failed to fetch player statistics'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })
}
