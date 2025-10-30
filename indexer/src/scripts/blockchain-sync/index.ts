import { env } from '#config'
import { logger } from '#utils/logger'
import { DrizzleAdapter } from '#infra/db/drizzle.adapter'
import { BlockchainSyncService } from './blockchain-sync.service'

async function main() {
  try {
    logger.info('🚀 Starting blockchain sync script...')

    // Initialize database connection
    const db = new DrizzleAdapter()
    await db.init()

    if (!db.isConnected) {
      logger.warn('⚠️ Database not connected; skipping blockchain sync')
      return
    }

    // Initialize service
    const blockchainSync = new BlockchainSyncService(db)

    // Execute sync
    await blockchainSync.syncAllAccounts()

    logger.info('✅ Blockchain sync completed successfully!')
  } catch (error) {
    logger.error(error, '❌ Blockchain sync script failed')
    process.exit(1)
  }
}

// Run the script
main()
