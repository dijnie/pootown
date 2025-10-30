import { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { DatabasePort } from '#infra/db/db.port'
import { PropertyService } from '#server/services/property.service'
import { GameService } from '#server/services/game.service'
import { getRequestId } from '../plugins/request-context'
import {
  PropertyStateSchema,
  PropertyStateFiltersSchema,
  GameScopedFiltersSchema,
  PaginatedResponseSchema,
  ItemResponseSchema,
  ErrorResponseSchema,
  PaginationRequestSchema
} from '#shared/api/response-types'

export default async function propertyStatesRoutes(fastify: FastifyInstance) {
  const db: DatabasePort = fastify.db
  const propertyService = new PropertyService(db)
  const gameService = new GameService(db)

  // Helper function to get game pubkey from gameId
  async function getGamePubkey(gameId: number): Promise<string | null> {
    const gameState = await gameService.getByGameId(gameId)
    return gameState?.pubkey ?? null
  }

  // ==================== LIST PROPERTIES IN GAME ====================

  fastify.get('/property-states', {
    schema: {
      tags: ['Property States'],
      summary: 'List all property states with game-scoped filtering',
      querystring: Type.Intersect([PropertyStateFiltersSchema, GameScopedFiltersSchema, PaginationRequestSchema]),
      response: {
        200: PaginatedResponseSchema(PropertyStateSchema),
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
              message: 'gameId is required for property operations'
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
        const propertyFilters = { ...filters, game: gamePubkey }
        delete propertyFilters.gameId

        const result = await propertyService.getAll(propertyFilters, pagination)

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
        fastify.log.error({ error, requestId }, 'Failed to fetch property states')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PROPERTY_STATES_FAILED',
            message: 'Failed to fetch property states',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET SINGLE PROPERTY STATE ====================

  fastify.get('/property-states/:pubkey', {
    schema: {
      tags: ['Property States'],
      summary: 'Get a specific property state by pubkey',
      params: Type.Object({
        pubkey: Type.String({ minLength: 32, maxLength: 44 })
      }),
      querystring: Type.Object({
        gameId: Type.Optional(Type.Number({ minimum: 0 }))
      }),
      response: {
        200: ItemResponseSchema(PropertyStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { pubkey } = request.params as { pubkey: string }
      const { gameId } = request.query as { gameId?: number }

      try {
        const propertyState = await propertyService.getByPubkey(pubkey)

        if (!propertyState) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'PROPERTY_STATE_NOT_FOUND',
              message: `Property state with pubkey ${pubkey} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        // Verify game scope if gameId provided
        if (gameId) {
          const gamePubkey = await getGamePubkey(gameId)
          if (!gamePubkey || propertyState.game !== gamePubkey) {
            reply.code(404).send({
              success: false,
              error: {
                code: 'PROPERTY_NOT_IN_GAME',
                message: `Property ${pubkey} is not in game ${gameId}`
              },
              requestId,
              timestamp: new Date().toISOString()
            })
            return
          }
        }

        reply.code(200).send({
          success: true,
          data: propertyState,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, pubkey }, 'Failed to fetch property state')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PROPERTY_STATE_FAILED',
            message: 'Failed to fetch property state',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET PROPERTIES BY GAME ID ====================

  fastify.get('/property-states/by-game/:gameId', {
    schema: {
      tags: ['Property States'],
      summary: 'Get all properties in a specific game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(PropertyStateSchema),
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
        const result = await propertyService.getPropertiesByGame(gamePubkey, pagination)

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
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch properties by game')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PROPERTIES_BY_GAME_FAILED',
            message: 'Failed to fetch properties by game'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET PROPERTY BY POSITION IN GAME ====================

  fastify.get('/property-states/by-game/:gameId/position/:position', {
    schema: {
      tags: ['Property States'],
      summary: 'Get property at specific board position in a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 }),
        position: Type.Number({ minimum: 0, maximum: 39 })
      }),
      response: {
        200: ItemResponseSchema(PropertyStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId, position } = request.params as { gameId: number; position: number }

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

        const propertyState = await propertyService.getPropertyAtPosition(gamePubkey, position)

        if (!propertyState) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'PROPERTY_NOT_FOUND_AT_POSITION',
              message: `No property found at position ${position} in game ${gameId}`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        reply.code(200).send({
          success: true,
          data: propertyState,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId, position }, 'Failed to fetch property at position')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PROPERTY_AT_POSITION_FAILED',
            message: 'Failed to fetch property at position'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET PROPERTIES BY OWNER IN GAME ====================

  fastify.get('/property-states/by-game/:gameId/owner/:owner', {
    schema: {
      tags: ['Property States'],
      summary: 'Get all properties owned by specific player in a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 }),
        owner: Type.String({ minLength: 32, maxLength: 44 })
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(PropertyStateSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId, owner } = request.params as { gameId: number; owner: string }

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
        const result = await propertyService.getPropertiesByOwner(gamePubkey, owner, pagination)

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
        fastify.log.error({ error, requestId, gameId, owner }, 'Failed to fetch properties by owner')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PROPERTIES_BY_OWNER_FAILED',
            message: 'Failed to fetch properties by owner'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET PROPERTIES BY COLOR GROUP IN GAME ====================

  fastify.get('/property-states/by-game/:gameId/color/:colorGroup', {
    schema: {
      tags: ['Property States'],
      summary: 'Get all properties in a color group within a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 }),
        colorGroup: Type.String()
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(PropertyStateSchema),
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { gameId, colorGroup } = request.params as { gameId: number; colorGroup: string }

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
        // Validate colorGroup enum value
        const validColorGroups = [
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
        ]
        if (!validColorGroups.includes(colorGroup)) {
          reply.code(400).send({
            success: false,
            error: {
              code: 'INVALID_COLOR_GROUP',
              message: `Invalid color group: ${colorGroup}. Must be one of: ${validColorGroups.join(', ')}`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        const result = await propertyService.getPropertiesByColorGroup(gamePubkey, colorGroup as any, pagination)

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
        fastify.log.error({ error, requestId, gameId, colorGroup }, 'Failed to fetch properties by color group')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PROPERTIES_BY_COLOR_FAILED',
            message: 'Failed to fetch properties by color group'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET AVAILABLE PROPERTIES IN GAME ====================

  fastify.get('/property-states/by-game/:gameId/available', {
    schema: {
      tags: ['Property States'],
      summary: 'Get all unowned properties in a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      querystring: PaginationRequestSchema,
      response: {
        200: PaginatedResponseSchema(PropertyStateSchema),
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
        const result = await propertyService.getAvailableProperties(gamePubkey, pagination)

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
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch available properties')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_AVAILABLE_PROPERTIES_FAILED',
            message: 'Failed to fetch available properties'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== GET PROPERTY STATISTICS IN GAME ====================

  fastify.get('/property-states/by-game/:gameId/stats', {
    schema: {
      tags: ['Property States'],
      summary: 'Get aggregated property statistics for a game',
      params: Type.Object({
        gameId: Type.Number({ minimum: 0 })
      }),
      response: {
        200: ItemResponseSchema(
          Type.Object({
            totalProperties: Type.Number(),
            ownedProperties: Type.Number(),
            availableProperties: Type.Number(),
            monopolizedColorGroups: Type.Number(),
            averageRent: Type.Number(),
            totalPropertyValue: Type.Number(),
            mostExpensiveProperty: Type.Optional(Type.String()),
            mostActiveColorGroup: Type.Optional(Type.String())
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

        const stats = await propertyService.getPropertyStats(gamePubkey)

        reply.code(200).send({
          success: true,
          data: stats,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, gameId }, 'Failed to fetch property statistics')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PROPERTY_STATS_FAILED',
            message: 'Failed to fetch property statistics'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })
}
