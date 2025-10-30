import { realtimeQueue, writerDlq, writerQueue, connection } from '#infra/queue/bull'
import { startRealtimeListener } from '#app/listener.realtime'
import { DrizzleAdapter } from '#infra/db/drizzle.adapter'
// import { startParserWorkers } from '#app/worker.parser'
import { startWriterWorker } from '#app/worker.writer'
import { startDlqReplayer } from '#app/worker.dlq'
import { startEnrichmentWorker } from '#app/worker.enrichment'
import { rpcPool } from '#infra/rpc/rpc-pool'
import { logger } from '#utils/logger'
import createServer from '#server'
import env from '#config/env'
import { startQueueMetricsPoller } from '#infra/metrics/metrics'
import { startRedisHousekeeping } from '#app/maintenance.cleanup'
import { BlockchainSyncService } from '#scripts/blockchain-sync/blockchain-sync.service'

async function main() {
  // Reset all RPC circuit breakers on startup to ensure clean state
  logger.info('Resetting RPC circuit breakers on startup...')
  rpcPool.resetAllCircuitBreakers()

  const db = new DrizzleAdapter()

  await db.init()
  if (db.isConnected) {
    console.log('✅ Database connected successfully')
  } else {
    console.warn('⚠️ Database not connected; running in degraded mode')
  }

  const { fastify, graceful } = await createServer(db)

  const writerWorker = startWriterWorker(db)
  // const { realtimeWorker } = startParserWorkers() // Only start realtime worker
  const dlqWorker = startDlqReplayer()
  const enrichmentWorker = startEnrichmentWorker(db)
  const syncService = new BlockchainSyncService(db)
  let syncInProgress = false

  const runBlockchainSync = async () => {
    if (syncInProgress) {
      logger.warn('Blockchain sync already running, skipping scheduled run')
      return
    }
    syncInProgress = true
    const start = Date.now()
    try {
      logger.info('Scheduled blockchain sync started')
      await syncService.syncAllAccounts()
      logger.info({ durationMs: Date.now() - start }, 'Scheduled blockchain sync finished')
    } catch (error) {
      logger.error({ error }, 'Scheduled blockchain sync failed')
    } finally {
      syncInProgress = false
    }
  }

  const syncIntervalMinutes = Math.max(1, Number(env.indexer.syncIntervalMinutes ?? 3))
  let blockchainSyncTimer: NodeJS.Timeout | null = setInterval(runBlockchainSync, syncIntervalMinutes * 60 * 1000)

  const stopQueuePoller = startQueueMetricsPoller({
    realtime: realtimeQueue,
    writer: writerQueue,
    writerDlq: writerDlq
  })

  const stopCleanup = startRedisHousekeeping([realtimeQueue, writerQueue, writerDlq])

  // Only enable realtime indexing using Ephemeral Rollup
  const unsubscribe = await startRealtimeListener()

  await fastify.listen({ port: env.server.port, host: env.server.host })
  graceful.setReady()

  logger.info('Realtime Indexer + API up (Drizzle + Monopoly with Ephemeral Rollup)')

  let isShuttingDown = false

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress, ignoring duplicate signal')
      return
    }
    isShuttingDown = true
    try {
      logger.info({ signal }, 'Shutting down indexer...')

      // 1. Stop incoming data flow from realtime listener
      if (unsubscribe) await unsubscribe()

      // 2. Stop cleanup processes and queue polling
      try {
        stopCleanup?.()
        stopQueuePoller?.()
        if (blockchainSyncTimer) {
          clearInterval(blockchainSyncTimer)
          blockchainSyncTimer = null
        }
        while (syncInProgress) {
          logger.debug('Waiting for scheduled blockchain sync to finish...')
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      } catch (err) {
        logger.warn(err, 'Error stopping cleanup processes')
      }

      // 3. Close workers
      await Promise.allSettled([writerWorker.close(), /* realtimeWorker.close(), */ dlqWorker.close()])

      // 4. Stop enrichment worker separately
      try {
        enrichmentWorker.stop()
      } catch (err) {
        logger.warn(err, 'Error stopping enrichment worker')
      }

      // 5. Close queues and connections
      await Promise.allSettled([writerQueue.close(), writerDlq.close() /* , realtimeQueue.close() */])

      // 6. Cleanup RPC pool
      rpcPool.destroy()

      try {
        await connection.quit()
      } catch (err) {
        logger.warn(err, 'Error closing Redis connection')
      }

      try {
        await fastify.close()
      } catch (err) {
        logger.warn(err, 'Error closing API server')
      }

      logger.info('Indexer shutdown complete')
      process.exit(0)
    } catch (error) {
      logger.error({ error }, 'Indexer shutdown failed')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error in indexer main')
  process.exit(1)
})
