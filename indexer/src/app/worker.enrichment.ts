import { writerQueue } from '#infra/queue/bull'
import { BlockchainAccountFetcher } from '#infra/rpc/account-fetcher'
import { logger } from '#utils/logger'
import type { DatabasePort } from '#infra/db/db.port'

export class EnrichmentWorker {
  private fetcher: BlockchainAccountFetcher
  private isRunning = false
  private intervalMs: number

  constructor(
    private db: DatabasePort,
    intervalMs = 5 * 60 * 1000
  ) {
    // 5 minutes default
    this.fetcher = new BlockchainAccountFetcher()
    this.intervalMs = intervalMs
  }

  start() {
    if (this.isRunning) {
      logger.warn('Enrichment worker is already running')
      return
    }

    this.isRunning = true
    logger.debug('🔄 Starting background enrichment worker')

    // Run immediately and then on interval
    this.runEnrichmentCycle()

    setInterval(() => {
      if (this.isRunning) {
        this.runEnrichmentCycle()
      }
    }, this.intervalMs)
  }

  stop() {
    this.isRunning = false
    logger.debug('⏹️ Stopping background enrichment worker')
  }

  private async runEnrichmentCycle() {
    try {
      logger.debug('🔄 Starting enrichment cycle for incomplete game records')

      // Find games with placeholder values (indicating incomplete enrichment)
      const incompleteGames = await this.db.getGameStates(
        {
          // Look for games that likely need enrichment
          // These will have fallback configId (equals pubkey) or default gameId patterns
        },
        { limit: 50 }
      ) // Process in batches

      if (incompleteGames.data.length === 0) {
        logger.debug('✅ No games need enrichment')
        return
      }

      logger.debug(`🔄 Found ${incompleteGames.data.length} games that may need enrichment`)

      for (const game of incompleteGames.data) {
        // Check if this game needs enrichment
        const needsEnrichment =
          game.configId === game.pubkey || // fallback configId
          game.authority === game.pubkey || // fallback authority
          game.gameId > 1000000 // temporary gameId based on timestamp/slot

        if (needsEnrichment) {
          logger.debug(`🔄 Attempting to re-enrich game ${game.pubkey}`)

          // Try to fetch enhanced data
          const enhancedData = await this.fetcher.fetchEnhancedGameData(game.pubkey)

          if (enhancedData) {
            // Create updated record for reprocessing
            const updatedRecord = {
              ...game,
              gameId: enhancedData.gameId,
              configId: enhancedData.configId,
              authority: enhancedData.authority,
              bump: enhancedData.bump,
              maxPlayers: enhancedData.maxPlayers,
              currentPlayers: enhancedData.currentPlayers,
              currentTurn: enhancedData.currentTurn,
              bankBalance: enhancedData.bankBalance,
              freeParkingPool: enhancedData.freeParkingPool,
              housesRemaining: enhancedData.housesRemaining,
              hotelsRemaining: enhancedData.hotelsRemaining,
              nextTradeId: enhancedData.nextTradeId,
              activeTrades: enhancedData.activeTrades,
              players: enhancedData.players || game.players,
              gameStatus: enhancedData.gameStatus || game.gameStatus,
              winner: enhancedData.winner || game.winner,
              accountUpdatedAt: new Date() // Mark as updated
            }

            // Add to writer queue for re-processing
            await writerQueue.add(
              'write',
              {
                record: {
                  kind: 'gameState',
                  data: updatedRecord
                }
              },
              {
                jobId: `enrichment-${game.pubkey}`,
                priority: 50, // Lower priority than new records
                attempts: 3
              }
            )

            logger.debug(`✅ Re-enriched and queued game ${game.pubkey}`)
          } else {
            logger.debug(`⏳ Game ${game.pubkey} account still not ready for enrichment`)
          }
        }

        // Small delay between requests to avoid overwhelming RPC
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      logger.debug(`✅ Completed enrichment cycle, processed ${incompleteGames.data.length} games`)
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, '❌ Error in enrichment cycle')
    }
  }
}

let enrichmentWorker: EnrichmentWorker | null = null

export function startEnrichmentWorker(db: DatabasePort) {
  if (enrichmentWorker) {
    logger.warn('Enrichment worker already exists')
    return enrichmentWorker
  }

  enrichmentWorker = new EnrichmentWorker(db)
  enrichmentWorker.start()

  logger.debug('🔄 Background enrichment worker started')
  return enrichmentWorker
}

export function stopEnrichmentWorker() {
  if (enrichmentWorker) {
    enrichmentWorker.stop()
    enrichmentWorker = null
  }
}
