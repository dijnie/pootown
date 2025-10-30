import rateLimit from '@fastify/rate-limit'
import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

async function rateLimitPlugin(fastify: FastifyInstance) {
  // General rate limiting for all endpoints
  await fastify.register(rateLimit, {
    max: 200, // Base limit: 200 requests per minute
    timeWindow: '1 minute',

    // Customize error response
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${context.after}ms`,
      retryAfter: context.after
    }),

    // Smart rate limiting based on endpoint patterns
    keyGenerator: (request) => {
      const ip = request.ip
      const apiKey = request.headers['x-api-key'] as string

      // Higher limits for API key users
      if (apiKey) {
        return `api-${apiKey}`
      }

      // Different limits for different operation types
      const url = request.url

      // Write operations (trades, purchases) - more restrictive
      if (url.includes('/trades') && ['POST', 'PUT', 'DELETE'].includes(request.method)) {
        return `${ip}-write-ops`
      }

      // Game actions (dice roll, property purchase) - moderate restrictions
      if (url.includes('/games') && ['POST', 'PUT'].includes(request.method)) {
        return `${ip}-game-actions`
      }

      // Health endpoints get generous limits
      if (request.url === '/health' || request.url === '/metrics') {
        return `${ip}-health`
      }

      // Read-only queries - less restrictive
      return `${ip}-read`
    }
  })

  fastify.log.info('Multi-tier rate limiting enabled for monopoly operations')
}

export default fp(rateLimitPlugin, {
  name: 'rateLimit',
  fastify: '5.x'
  // dependencies: ['helmet'],
})
