import { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { DatabasePort } from '#infra/db/db.port'

// Health check schemas
const healthCheckResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('healthy'), Type.Literal('degraded'), Type.Literal('unhealthy')]),
  timestamp: Type.String({ format: 'date-time' }),
  uptime: Type.Number(),
  version: Type.String(),
  components: Type.Object({
    database: Type.Object({
      status: Type.String(),
      responseTime: Type.Optional(Type.Number()),
      details: Type.Optional(Type.String())
    }),
    indexer: Type.Object({
      status: Type.String(),
      lastProcessedSlot: Type.Optional(Type.Number()),
      details: Type.Optional(Type.String())
    })
  })
})

const metricsResponseSchema = Type.Object({
  games: Type.Object({
    total: Type.Number(),
    active: Type.Number(),
    finished: Type.Number()
  }),
  players: Type.Object({
    total: Type.Number(),
    online: Type.Number()
  }),
  properties: Type.Object({
    owned: Type.Number(),
    mortgaged: Type.Number()
  }),
  trades: Type.Object({
    pending: Type.Number(),
    completed: Type.Number()
  }),
  performance: Type.Object({
    avgResponseTime: Type.Number(),
    requestsPerMinute: Type.Number()
  })
})

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabasePort
  }
}

export default async function (fastify: FastifyInstance) {
  // Health check endpoint
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'System health check',
        description: 'Check the health status of the Monopoly indexer and its dependencies',
        response: {
          200: healthCheckResponseSchema,
          503: healthCheckResponseSchema
        }
      }
    },
    async (_request, reply) => {
      // Check database connectivity
      let dbStatus = 'healthy'
      let dbResponseTime: number | undefined
      let dbDetails: string | undefined

      try {
        const dbStart = Date.now()
        // Simple query to test DB connection
        await fastify.db.query('SELECT 1')
        dbResponseTime = Date.now() - dbStart

        if (dbResponseTime > 1000) {
          dbStatus = 'degraded'
          dbDetails = 'Slow response time'
        }
      } catch (err) {
        dbStatus = 'unhealthy'
        dbDetails = err instanceof Error ? err.message : 'Unknown error'
      }

      // Check indexer status (simplified)
      let indexerStatus = 'healthy'
      let lastProcessedSlot: number | undefined
      let indexerDetails: string | undefined

      try {
        // Query sync status to check if indexer is running
        const syncStatus = await fastify.db.query(`
        SELECT last_processed_slot, status, updated_at 
        FROM sync_status 
        WHERE component = 'live_sync' 
        ORDER BY updated_at DESC 
        LIMIT 1
      `)

        if (syncStatus.length > 0) {
          lastProcessedSlot = (syncStatus[0] as any).last_processed_slot
          const lastUpdate = new Date((syncStatus[0] as any).updated_at)
          const timeSinceUpdate = Date.now() - lastUpdate.getTime()

          if (timeSinceUpdate > 300000) {
            // 5 minutes
            indexerStatus = 'degraded'
            indexerDetails = 'No recent updates'
          }
        } else {
          indexerStatus = 'unhealthy'
          indexerDetails = 'No sync status found'
        }
      } catch {
        indexerStatus = 'unhealthy'
        indexerDetails = 'Failed to check sync status'
      }

      // Determine overall status
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
      if (dbStatus === 'unhealthy' || indexerStatus === 'unhealthy') {
        overallStatus = 'unhealthy'
        reply.code(503)
      } else if (dbStatus === 'degraded' || indexerStatus === 'degraded') {
        overallStatus = 'degraded'
        reply.code(200)
      } else {
        reply.code(200)
      }

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        components: {
          database: {
            status: dbStatus,
            responseTime: dbResponseTime,
            details: dbDetails
          },
          indexer: {
            status: indexerStatus,
            lastProcessedSlot,
            details: indexerDetails
          }
        }
      }
    }
  )

  // Business statistics endpoint
  fastify.get(
    '/stats',
    {
      schema: {
        tags: ['Health'],
        summary: 'Business statistics',
        description: 'Get current business metrics and statistics for games, players, etc.',
        response: {
          200: metricsResponseSchema,
          500: Type.Object({
            error: Type.String(),
            games: Type.Object({ total: Type.Number(), active: Type.Number(), finished: Type.Number() }),
            players: Type.Object({ total: Type.Number(), online: Type.Number() }),
            properties: Type.Object({ owned: Type.Number(), mortgaged: Type.Number() }),
            trades: Type.Object({ pending: Type.Number(), completed: Type.Number() }),
            performance: Type.Object({ avgResponseTime: Type.Number(), requestsPerMinute: Type.Number() })
          })
        }
      }
    },
    async (_request, reply) => {
      try {
        // Gather business statistics from database
        const [gameStats, playerStats, propertyStats, tradeStats] = await Promise.all([
          // Game statistics
          fastify.db.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN game_status = 'InProgress' THEN 1 END) as active,
            COUNT(CASE WHEN game_status = 'Finished' THEN 1 END) as finished
          FROM games
        `),

          // Player statistics
          fastify.db.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN account_updated_at > NOW() - INTERVAL '1 hour' THEN 1 END) as online
          FROM players
        `),

          // Property statistics
          fastify.db.query(`
          SELECT 
            COUNT(CASE WHEN owner IS NOT NULL THEN 1 END) as owned,
            COUNT(CASE WHEN is_mortgaged = true THEN 1 END) as mortgaged
          FROM properties
        `),

          // Trade statistics
          fastify.db.query(`
          SELECT 
            COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending,
            COUNT(CASE WHEN status = 'Accepted' THEN 1 END) as completed
          FROM trades
        `)
        ])

        return {
          games: {
            total: parseInt((gameStats[0] as any)?.total || '0'),
            active: parseInt((gameStats[0] as any)?.active || '0'),
            finished: parseInt((gameStats[0] as any)?.finished || '0')
          },
          players: {
            total: parseInt((playerStats[0] as any)?.total || '0'),
            online: parseInt((playerStats[0] as any)?.online || '0')
          },
          properties: {
            owned: parseInt((propertyStats[0] as any)?.owned || '0'),
            mortgaged: parseInt((propertyStats[0] as any)?.mortgaged || '0')
          },
          trades: {
            pending: parseInt((tradeStats[0] as any)?.pending || '0'),
            completed: parseInt((tradeStats[0] as any)?.completed || '0')
          },
          performance: {
            avgResponseTime: 0, // Would need to implement response time tracking
            requestsPerMinute: 0 // Would need to implement request counting
          }
        }
      } catch (err) {
        fastify.log.error(err, 'Failed to gather business statistics')
        return reply.code(500).send({
          error: 'Failed to gather business statistics',
          games: { total: 0, active: 0, finished: 0 },
          players: { total: 0, online: 0 },
          properties: { owned: 0, mortgaged: 0 },
          trades: { pending: 0, completed: 0 },
          performance: { avgResponseTime: 0, requestsPerMinute: 0 }
        })
      }
    }
  )
}
