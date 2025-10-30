#!/usr/bin/env node

/**
 * Script to cleanup old "bull" prefixed queues from Redis
 * Run with: node scripts/cleanup-old-queues.js
 */

import IORedis from 'ioredis'

const redis = new IORedis(process.env.REDIS_URL)

async function cleanupOldQueues() {
  try {
    console.log('🔍 Scanning for old "bull:*" keys...')

    const keys = await redis.keys('bull:*')

    if (keys.length === 0) {
      console.log('✅ No old "bull:*" keys found')
      return
    }

    console.log(`🗑️  Found ${keys.length} old keys to delete:`)
    keys.forEach((key) => console.log(`   - ${key}`))

    console.log('🧹 Deleting old keys...')
    await redis.del(...keys)

    console.log('✅ Cleanup completed!')
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
  } finally {
    redis.disconnect()
  }
}

cleanupOldQueues()
