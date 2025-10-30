import { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import { register } from '#infra/metrics/metrics'

export default async function metricsRoutes(fastify: FastifyInstance) {
  // Prometheus metrics endpoint (for Grafana, AlertManager, etc.)
  fastify.get(
    '/metrics',
    {
      schema: {
        tags: ['Monitoring'],
        summary: 'Prometheus metrics',
        description: 'Expose Prometheus format metrics for infrastructure monitoring',
        response: {
          200: {
            type: 'string',
            description: 'Prometheus metrics in text format'
          },
          500: Type.Object({
            error: Type.String()
          })
        }
      }
    },
    async (_request, reply) => {
      try {
        // Get Prometheus formatted metrics
        const metricsString = await register.metrics()
        reply.type('text/plain; version=0.0.4; charset=utf-8')
        return metricsString
      } catch (error) {
        fastify.log.error(error, 'Failed to generate Prometheus metrics')
        return reply.code(500).send({
          error: 'Failed to generate metrics'
        })
      }
    }
  )
}
