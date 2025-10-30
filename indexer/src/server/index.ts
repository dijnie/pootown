import Fastify from 'fastify'
import Helmet from '@fastify/helmet'
import Cors from '@fastify/cors'
import UnderPressure from '@fastify/under-pressure'
import AutoLoad from '@fastify/autoload'
import GracefulServer from '@gquittet/graceful-server'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import path from 'node:path'
import env from '#config/env'
import { DatabasePort } from '#infra/db/db.port'
import { randomUUID } from 'node:crypto'

async function createServer(db: DatabasePort) {
  const fastify = Fastify({
    logger: {
      level: env.log.level || (env.isDevelopment ? 'warn' : 'debug'),
      transport: env.isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname'
            }
          }
        : undefined,
      redact: ['headers.authorization']
    },
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
    routerOptions: {
      ignoreDuplicateSlashes: true
    }
  })

  const server = fastify.withTypeProvider<TypeBoxTypeProvider>()

  // Inject database instance into server context for use in routes
  server.decorate('db', db)

  // Register security plugins first
  await server.register(Helmet, {
    global: true,
    contentSecurityPolicy: !env.isDevelopment,
    crossOriginEmbedderPolicy: !env.isDevelopment
  })

  // Enable CORS for cross-origin requests
  await server.register(Cors, {
    origin: env.isDevelopment ? true : ['https://www.pandatown.fun', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true
  })

  // Add overload protection and health monitoring
  await server.register(UnderPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 1000000000, // 1GB
    maxRssBytes: 1000000000, // 1GB
    message: 'Server under pressure!',
    retryAfter: 50
  })

  // Auto-load all plugins from plugins directory (with performance optimizations)
  await server.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    dirNameRoutePrefix: false,
    ignoreFilter: /\.test\.|spec\.|__/, // Skip test files
    matchFilter: /\.(ts|js)$/, // Only load TS/JS files
    maxDepth: 1, // Don't recurse deeply
    forceESM: false // Use CommonJS for better perf
  })

  // Auto-load all routes from routes directory with /api prefix (optimized)
  await server.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    dirNameRoutePrefix: false,
    ignoreFilter: /\.test\.|spec\.|__/, // Skip test files
    matchFilter: /\.(ts|js)$/, // Only load TS/JS files
    maxDepth: 1, // Don't recurse deeply
    forceESM: false, // Use CommonJS for better perf
    options: {
      prefix: '/api'
    }
  })

  // Setup graceful server shutdown handling
  const graceful = GracefulServer(server.server, {
    closePromises: [async () => server.close()]
  })

  // Setup graceful server event handlers
  graceful.on(GracefulServer.READY, () => server.log.info('API server ready'))
  graceful.on(GracefulServer.SHUTTING_DOWN, () => server.log.info('API shutting down'))
  graceful.on(GracefulServer.SHUTDOWN, (err?: Error) => {
    if (err && err.message !== 'SIGINT' && err.message !== 'SIGTERM') {
      server.log.error(err, 'API stopped with error')
    } else {
      server.log.info('API stopped gracefully')
    }
  })

  return { fastify: server, graceful }
}

export default createServer
