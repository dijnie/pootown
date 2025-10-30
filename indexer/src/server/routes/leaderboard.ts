import { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { DatabasePort } from '#infra/db/db.port'
import { LeaderboardService } from '#server/services/leaderboard.service'
import { getRequestId } from '../plugins/request-context'

// ==================== VALIDATION SCHEMAS ====================

const LeaderboardFiltersSchema = Type.Object({
  timeRange: Type.Optional(Type.String({ enum: ['day', 'week', 'month', 'all'] })),
  minGames: Type.Optional(Type.Number({ minimum: 0 })),
  page: Type.Optional(Type.Number({ minimum: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  rankingBy: Type.Optional(Type.String({ enum: ['mostWins', 'highestEarnings', 'mostActive', 'combined'] }))
})

const PlayerStatsSchema = Type.Object({
  playerId: Type.String(),
  walletAddress: Type.String(),
  playerName: Type.Optional(Type.String()),
  totalGamesPlayed: Type.Number(),
  totalGamesWon: Type.Number(),
  totalGamesLost: Type.Number(),
  winRate: Type.Number(),
  averageCashBalance: Type.Number(),
  highestCashBalance: Type.Number(),
  totalPropertiesOwned: Type.Number(),
  lastActiveDate: Type.String(),
  rank: Type.Optional(Type.Number())
})

const GameAnalyticsSchema = Type.Object({
  totalGames: Type.Number(),
  activeGames: Type.Number(),
  completedGames: Type.Number(),
  totalPlayers: Type.Number(),
  activePlayers: Type.Number(),
  averagePlayersPerGame: Type.Number(),
  averageGameDuration: Type.Optional(Type.Number()),
  mostPopularTimeSlot: Type.Optional(Type.String()),
  topProperties: Type.Array(
    Type.Object({
      position: Type.Number(),
      propertyName: Type.Optional(Type.String()),
      timesPurchased: Type.Number(),
      averagePrice: Type.Number(),
      totalRevenue: Type.Number()
    })
  ),
  // New analytics fields
  totalPrizePool: Type.Number(),
  totalEarnings: Type.Number(),
  combinedPlayerEarnings: Type.Number(),
  unclaimedPlayerEarnings: Type.Number()
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

export default async function leaderboardRoutes(fastify: FastifyInstance) {
  const db: DatabasePort = fastify.db
  const leaderboardService = new LeaderboardService(db)

  // Removed redundant /leaderboard/winrate and /leaderboard/games-played endpoints
  // These functionalities are now covered by the comprehensive /leaderboard/top-players endpoint

  // ==================== COMPREHENSIVE TOP PLAYERS LEADERBOARD ====================

  fastify.get('/leaderboard/top-players', {
    schema: {
      tags: ['Leaderboard'],
      summary: 'Get comprehensive top players leaderboard',
      description:
        'Get players ranked by combined activity (games played) and success (games won) - perfect for main leaderboard display',
      querystring: LeaderboardFiltersSchema,
      response: {
        200: PaginationResponseSchema(
          Type.Object({
            playerId: Type.String(),
            walletAddress: Type.String(),
            playerName: Type.Optional(Type.String()),
            totalGamesPlayed: Type.Number(),
            totalGamesWon: Type.Number(),
            totalGamesLost: Type.Number(),
            winRate: Type.Number(),
            averageCashBalance: Type.Number(),
            highestCashBalance: Type.Number(),
            totalPropertiesOwned: Type.Number(),
            averageGameDuration: Type.Optional(Type.Number()),
            lastActiveDate: Type.String(),
            leaderboardScore: Type.Number(),
            totalEarnings: Type.Number(),
            unclaimedEarnings: Type.Number(),
            rank: Type.Optional(Type.Number())
          })
        ),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const filters = request.query as any

      try {
        // Validate filters
        const validationErrors = leaderboardService.validateFilters(filters)
        if (validationErrors.length > 0) {
          reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid leaderboard filters',
              details: validationErrors.join(', ')
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        const pagination = {
          page: filters.page || 1,
          limit: filters.limit || 10
        }

        const result = await leaderboardService.getTopPlayersLeaderboard(filters, pagination)

        const paginationMeta = {
          page: pagination.page,
          limit: pagination.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / pagination.limit),
          hasNext: pagination.page * pagination.limit < result.total,
          hasPrev: pagination.page > 1
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
        fastify.log.error({ error, requestId }, 'Failed to get top players leaderboard')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_TOP_PLAYERS_LEADERBOARD_FAILED',
            message: 'Failed to fetch top players leaderboard'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // Removed redundant /leaderboard/cash endpoint
  // Cash balance information is included in the comprehensive /leaderboard/top-players endpoint

  // ==================== GAME ANALYTICS ====================

  fastify.get('/leaderboard/analytics', {
    schema: {
      tags: ['Leaderboard'],
      summary: 'Get comprehensive game analytics',
      description: 'Get overall game statistics and analytics for business intelligence',
      querystring: Type.Object({
        timeRange: Type.Optional(Type.String({ enum: ['day', 'week', 'month', 'all'] }))
      }),
      response: {
        200: ItemResponseSchema(GameAnalyticsSchema),
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { timeRange = 'all' } = request.query as any

      try {
        const analytics = await leaderboardService.getGameAnalytics(timeRange)

        reply.code(200).send({
          success: true,
          data: analytics,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId }, 'Failed to get game analytics')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_GAME_ANALYTICS_FAILED',
            message: 'Failed to fetch game analytics'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== PLAYER STATS ====================

  fastify.get('/leaderboard/player/:playerId', {
    schema: {
      tags: ['Leaderboard'],
      summary: 'Get individual player statistics',
      description: 'Get comprehensive statistics for a specific player',
      params: Type.Object({
        playerId: Type.String({ minLength: 32, maxLength: 44 })
      }),
      response: {
        200: ItemResponseSchema(PlayerStatsSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { playerId } = request.params as { playerId: string }

      try {
        const playerStats = await leaderboardService.getPlayerStats(playerId)

        if (!playerStats) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'PLAYER_NOT_FOUND',
              message: `Player with ID ${playerId} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        reply.code(200).send({
          success: true,
          data: playerStats,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, playerId }, 'Failed to get player stats')
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

  // ==================== PLAYER STATS BY WALLET ADDRESS ====================

  fastify.get('/leaderboard/wallet/:walletAddress', {
    schema: {
      tags: ['Leaderboard'],
      summary: 'Get player statistics by wallet address',
      description: 'Get comprehensive statistics for a player using their wallet address',
      params: Type.Object({
        walletAddress: Type.String({ minLength: 32, maxLength: 44 })
      }),
      response: {
        200: ItemResponseSchema(PlayerStatsSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { walletAddress } = request.params as { walletAddress: string }

      try {
        const playerStats = await leaderboardService.getPlayerStatsByWallet(walletAddress)

        if (!playerStats) {
          reply.code(404).send({
            success: false,
            error: {
              code: 'PLAYER_NOT_FOUND',
              message: `Player with wallet address ${walletAddress} not found`
            },
            requestId,
            timestamp: new Date().toISOString()
          })
          return
        }

        reply.code(200).send({
          success: true,
          data: playerStats,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId, walletAddress }, 'Failed to get player stats by wallet')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_PLAYER_STATS_BY_WALLET_FAILED',
            message: 'Failed to fetch player statistics by wallet address'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== RECENT ACTIVITY ====================

  fastify.get('/leaderboard/recent-activity', {
    schema: {
      tags: ['Leaderboard'],
      summary: 'Get recent game activity',
      description: 'Get recent games and activity summary',
      querystring: Type.Object({
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 }))
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          data: Type.Object({
            data: Type.Array(
              Type.Object({
                pubkey: Type.String(),
                gameId: Type.Number(),
                currentPlayers: Type.Number(),
                gameStatus: Type.String(),
                createdAt: Type.Number()
              })
            ),
            newPlayers: Type.Number(),
            activePlayersToday: Type.Number()
          }),
          requestId: Type.String(),
          timestamp: Type.String()
        }),
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { limit = 10 } = request.query as any

      try {
        const activity = await leaderboardService.getRecentActivity(limit)

        reply.code(200).send({
          success: true,
          data: {
            data: activity.recentGames,
            newPlayers: activity.newPlayers,
            activePlayersToday: activity.activePlayersToday
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId }, 'Failed to get recent activity')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_RECENT_ACTIVITY_FAILED',
            message: 'Failed to fetch recent activity'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== TOP GAMES ====================

  fastify.get('/leaderboard/top-games', {
    schema: {
      tags: ['Leaderboard'],
      summary: 'Get top performing games',
      description: 'Get games with highest player engagement',
      querystring: Type.Object({
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 }))
      }),
      response: {
        200: ItemResponseSchema(
          Type.Object({
            data: Type.Array(
              Type.Object({
                gameId: Type.String(),
                playerCount: Type.Number(),
                duration: Type.Optional(Type.Number()),
                status: Type.String(),
                createdAt: Type.String(),
                isPopular: Type.Boolean()
              })
            )
          })
        ),
        500: ErrorResponseSchema
      }
    },
    handler: async (request, reply) => {
      const requestId = getRequestId()
      const { limit = 10 } = request.query as any

      try {
        const topGames = await leaderboardService.getTopGames(limit)

        reply.code(200).send({
          success: true,
          data: {
            data: topGames
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId }, 'Failed to get top games')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_TOP_GAMES_FAILED',
            message: 'Failed to fetch top games'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // ==================== DYNAMIC CONFIGURATION DEBUG ENDPOINT ====================

  fastify.get('/leaderboard/config', {
    schema: {
      tags: ['Leaderboard'],
      summary: 'Get dynamic configuration values',
      description: 'Debug endpoint to inspect dynamic thresholds and database stats used in calculations',
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          data: Type.Object({
            winThreshold: Type.Number(),
            thresholdSource: Type.String(),
            thresholdCalculatedAt: Type.String(),
            gameDefaults: Type.Object({
              minGames: Type.Number(),
              defaultLimit: Type.Number(),
              maxLimit: Type.Number()
            }),
            databaseStats: Type.Object({
              recentGamesCount: Type.Number(),
              cashPercentiles: Type.Object({
                p25: Type.Number(),
                p50: Type.Number(),
                p75: Type.Number(),
                p90: Type.Number()
              })
            })
          }),
          requestId: Type.String(),
          timestamp: Type.String()
        }),
        500: ErrorResponseSchema
      }
    },
    handler: async (_request, reply) => {
      const requestId = getRequestId()

      try {
        const config = await leaderboardService.getDynamicConfiguration()

        reply.code(200).send({
          success: true,
          data: config,
          requestId,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        fastify.log.error({ error, requestId }, 'Failed to get dynamic configuration')
        reply.code(500).send({
          success: false,
          error: {
            code: 'FETCH_DYNAMIC_CONFIG_FAILED',
            message: 'Failed to fetch dynamic configuration'
          },
          requestId,
          timestamp: new Date().toISOString()
        })
      }
    }
  })
}
