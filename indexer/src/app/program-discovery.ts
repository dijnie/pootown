import { PublicKey } from '@solana/web3.js'
import { realtimeQueue } from '#infra/queue/bull'
import { rpcPool } from '#infra/rpc/rpc-pool'
import { logger } from '#utils/logger'
import { env } from '#config'

const GAME_STATE_DISCRIMINATOR = '905ed0acf8638678'
const PLATFORM_CONFIG_DISCRIMINATOR = '38033c56ae10f4c3'
const PLAYER_STATE_DISCRIMINATOR = 'a04e8000f853e6a0'
const PROPERTY_STATE_DISCRIMINATOR = '7c48c08b40c59e54'

export async function scanProgramAccounts(programId: string): Promise<number> {
  logger.info('🚀 Starting program account discovery scan...')

  const programKey = new PublicKey(programId)

  let totalAccountsFound = 0
  let gameStatesFound = 0
  let platformConfigsFound = 0
  let playerStatesFound = 0
  let propertyStatesFound = 0

  try {
    // Use RPC pool for connection management
    const programAccounts = await rpcPool.executeWithFailover(
      (connection) =>
        connection.getProgramAccounts(programKey, {
          commitment: 'confirmed',
          encoding: 'base64'
        }),
      'getProgramAccounts'
    )

    logger.info(`📊 Found ${programAccounts.length} total accounts owned by program`)

    // Process in batches to avoid overwhelming RPC endpoints
    const BATCH_SIZE = 3 // Process only 3 accounts at a time (more conservative)
    const BATCH_DELAY = 2000 // 2 second delay between batches (longer delay)

    for (let i = 0; i < programAccounts.length; i += BATCH_SIZE) {
      const batch = programAccounts.slice(i, i + BATCH_SIZE)
      logger.info(
        `📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(programAccounts.length / BATCH_SIZE)} (${batch.length} accounts)`
      )

      for (const account of batch) {
        const accountData = account.account.data

        if (accountData.length < 8) {
          continue // Skip accounts without discriminator
        }

        // Read discriminator (first 8 bytes)
        const discriminator = Buffer.from(accountData.slice(0, 8)).toString('hex')
        const pubkey = account.pubkey.toBase58()

        // Classify account type by discriminator
        try {
          switch (discriminator) {
            case GAME_STATE_DISCRIMINATOR:
              logger.info(`🎮 Found GameState account: ${pubkey}`)
              gameStatesFound++
              // Queue for processing like a regular transaction
              await realtimeQueue.add(
                'discovery',
                {
                  signature: `discovery_game_${pubkey}`,
                  accountAddress: pubkey,
                  accountType: 'gameState'
                },
                {
                  jobId: `discovery_game_${pubkey}`,
                  delay: Math.random() * 1000 // Random delay 0-1s to spread load
                }
              )
              break

            case PLATFORM_CONFIG_DISCRIMINATOR:
              logger.info(`⚙️ Found PlatformConfig account: ${pubkey}`)
              platformConfigsFound++
              await realtimeQueue.add(
                'discovery',
                {
                  signature: `discovery_platform_${pubkey}`,
                  accountAddress: pubkey,
                  accountType: 'platformConfig'
                },
                {
                  jobId: `discovery_platform_${pubkey}`,
                  delay: Math.random() * 1000
                }
              )
              break

            case PLAYER_STATE_DISCRIMINATOR:
              logger.info(`👤 Found PlayerState account: ${pubkey}`)
              playerStatesFound++
              await realtimeQueue.add(
                'discovery',
                {
                  signature: `discovery_player_${pubkey}`,
                  accountAddress: pubkey,
                  accountType: 'playerState'
                },
                {
                  jobId: `discovery_player_${pubkey}`,
                  delay: Math.random() * 1000
                }
              )
              break

            case PROPERTY_STATE_DISCRIMINATOR:
              logger.info(`🏠 Found PropertyState account: ${pubkey}`)
              propertyStatesFound++
              await realtimeQueue.add(
                'discovery',
                {
                  signature: `discovery_property_${pubkey}`,
                  accountAddress: pubkey,
                  accountType: 'propertyState'
                },
                {
                  jobId: `discovery_property_${pubkey}`,
                  delay: Math.random() * 1000
                }
              )
              break

            default:
              logger.debug(`❓ Unknown account type with discriminator ${discriminator}: ${pubkey}`)
          }
        } catch (queueError) {
          logger.warn({ error: queueError, pubkey }, 'Failed to queue account for discovery, skipping...')
        }

        totalAccountsFound++
      }

      // Delay between batches to avoid overwhelming RPC endpoints
      if (i + BATCH_SIZE < programAccounts.length) {
        logger.debug(`⏳ Waiting ${BATCH_DELAY}ms before next batch...`)
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
      }
    }

    logger.debug('📋 Program Account Scan Summary:')
    logger.debug(`   🎮 GameState accounts: ${gameStatesFound}`)
    logger.debug(`   ⚙️ PlatformConfig accounts: ${platformConfigsFound}`)
    logger.debug(`   👤 PlayerState accounts: ${playerStatesFound}`)
    logger.debug(`   🏠 PropertyState accounts: ${propertyStatesFound}`)
    logger.debug(`   📊 Total accounts processed: ${totalAccountsFound}`)

    return totalAccountsFound
  } catch (error) {
    logger.error({ error }, '❌ Error during program account scan')
    throw error
  }
}

/**
 * Run program account discovery if enabled in config
 */
export async function runProgramDiscovery(programId: string): Promise<void> {
  // Always enabled when using ER
  if (!env.indexer.realtimeEnabled) {
    logger.debug('Realtime indexing is disabled in config')
    return
  }

  try {
    const accountsFound = await scanProgramAccounts(programId)
    logger.debug(`✅ Program discovery completed: ${accountsFound} accounts queued for processing`)
  } catch (error) {
    logger.error({ error }, '❌ Program discovery failed')
  }
}
