import { randomUUID } from 'node:crypto'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'

// Request context for tracking requests
let requestId: string = ''

export function setRequestId(id?: string): void {
  requestId = id || randomUUID()
}

export function getRequestId(): string {
  return requestId || randomUUID()
}

export function clearRequestId(): void {
  requestId = ''
}

// Fastify plugin to set request ID on each request
async function requestContextPlugin(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const reqId = (request.headers['x-request-id'] as string) || randomUUID()
    setRequestId(reqId)
    reply.header('x-request-id', reqId)
  })

  fastify.addHook('onResponse', async () => {
    clearRequestId()
  })
}

export default fp(requestContextPlugin, {
  fastify: '5.x',
  name: 'app-request-context'
})
