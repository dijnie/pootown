import { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { rateLimitedRPC } from '#infra/rpc/solana'

// RPC status schemas
const rpcStatusResponseSchema = Type.Object({
  rpcPool: Type.Array(
    Type.Object({
      url: Type.String(),
      priority: Type.Number(),
      state: Type.String(),
      totalRequests: Type.Number(),
      totalErrors: Type.Number(),
      errorRate: Type.String(),
      lastUsed: Type.String()
    })
  ),
  rateLimiter: Type.Object({
    queued: Type.Number(),
    running: Type.Number(),
    reservoir: Type.Optional(Type.Number())
  }),
  timestamp: Type.String({ format: 'date-time' })
})

const rpcActionResponseSchema = Type.Object({
  action: Type.String(),
  success: Type.Boolean(),
  message: Type.String(),
  timestamp: Type.String({ format: 'date-time' })
})

export default async function (fastify: FastifyInstance) {
  // RPC status endpoint
  fastify.get(
    '/rpc-status',
    {
      schema: {
        tags: ['Monitoring'],
        summary: 'RPC pool status',
        description: 'Get detailed status and performance metrics for all Solana RPC endpoints',
        response: {
          200: rpcStatusResponseSchema,
          500: Type.Object({
            error: Type.String()
          })
        }
      }
    },
    async (_request, reply) => {
      try {
        const rpcStats = rateLimitedRPC.getRpcPoolStats()
        const rateLimiterStats = await rateLimitedRPC.getRateLimiterStats()

        return {
          rpcPool: rpcStats,
          rateLimiter: rateLimiterStats,
          timestamp: new Date().toISOString()
        }
      } catch (error) {
        fastify.log.error(error, 'Failed to get RPC status')
        return reply.code(500).send({
          error: 'Failed to get RPC status'
        })
      }
    }
  )

  // RPC circuit breaker reset endpoint
  fastify.post(
    '/rpc-status/reset',
    {
      schema: {
        tags: ['Monitoring'],
        summary: 'Reset RPC circuit breakers',
        description: 'Manually reset all RPC circuit breakers to recover from failures',
        response: {
          200: rpcActionResponseSchema,
          500: Type.Object({
            error: Type.String(),
            timestamp: Type.String({ format: 'date-time' })
          })
        }
      }
    },
    async (_request, reply) => {
      try {
        rateLimitedRPC.resetAllCircuitBreakers()

        fastify.log.info('RPC circuit breakers reset via API')

        return {
          action: 'reset_circuit_breakers',
          success: true,
          message: 'All RPC circuit breakers have been reset',
          timestamp: new Date().toISOString()
        }
      } catch (error) {
        fastify.log.error(error, 'Failed to reset RPC circuit breakers')
        return reply.code(500).send({
          error: 'Failed to reset RPC circuit breakers',
          timestamp: new Date().toISOString()
        })
      }
    }
  )

  // RPC health test endpoint
  fastify.post(
    '/rpc-status/test',
    {
      schema: {
        tags: ['Monitoring'],
        summary: 'Test RPC connectivity',
        description: 'Test connectivity to all RPC endpoints by fetching latest slot',
        response: {
          200: rpcActionResponseSchema,
          500: Type.Object({
            error: Type.String(),
            details: Type.Optional(Type.String()),
            timestamp: Type.String({ format: 'date-time' })
          })
        }
      }
    },
    async (_request, reply) => {
      try {
        // Test RPC connectivity by fetching current slot
        const slot = await rateLimitedRPC.getSlot()

        fastify.log.info(`RPC connectivity test successful, current slot: ${slot}`)

        return {
          action: 'test_rpc_connectivity',
          success: true,
          message: `RPC connectivity test successful, current slot: ${slot}`,
          timestamp: new Date().toISOString()
        }
      } catch (error: any) {
        fastify.log.error(error, 'RPC connectivity test failed')
        return reply.code(500).send({
          error: 'RPC connectivity test failed',
          details: error.message,
          timestamp: new Date().toISOString()
        })
      }
    }
  )
}
