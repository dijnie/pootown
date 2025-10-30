import { FastifyInstance } from 'fastify'
import healthRoutes from './health'
import gameStatesRoutes from './game-states'
import playerStatesRoutes from './player-states'
import propertyStatesRoutes from './property-states'
import tradeStatesRoutes from './trade-states'
import gameLogsRoutes from './game-logs'
import leaderboardRoutes from './leaderboard'
import rpcStatusRoutes from './rpc-status'
import metricsRoutes from './metrics'

export default async function routes(fastify: FastifyInstance) {
  // Root API endpoint
  fastify.get('/', async () => ({
    ok: true,
    message: 'Panda Monopoly Indexer API',
    version: '1.0.0',
    endpoints: {
      'game-states': '/api/game-states',
      'player-states': '/api/player-states',
      'property-states': '/api/property-states',
      'trade-states': '/api/trade-states',
      'game-logs': '/api/game-logs',
      leaderboard: '/api/leaderboard',
      health: '/api/health',
      metrics: '/api/metrics',
      'rpc-status': '/api/rpc-status',
      docs: '/api-docs'
    }
  }))

  await fastify.register(healthRoutes)
  // await fastify.register(gameStatesRoutes)
  // await fastify.register(playerStatesRoutes)
  // await fastify.register(propertyStatesRoutes)
  // await fastify.register(tradeStatesRoutes)
  // await fastify.register(gameLogsRoutes)
  await fastify.register(leaderboardRoutes)
  await fastify.register(rpcStatusRoutes)
  await fastify.register(metricsRoutes)
}
