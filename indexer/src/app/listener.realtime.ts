// WebSocket logsSubscribe -> enqueue realtime
import { makeConnection, programId } from '#infra/rpc/solana'
import { realtimeQueue } from '#infra/queue/bull'
import { logger } from '#utils/logger'

export async function startRealtimeListener() {
  const conn = makeConnection('ws')
  const subId = await conn.onLogs(
    programId,
    async (logs) => {
      const sig = logs.signature
      await realtimeQueue.add('rt', { signature: sig }, { jobId: sig }) // idempotent
    },
    'confirmed'
  )

  logger.info({ subId }, 'Realtime listener subscribed')

  return async () => {
    try {
      await conn.removeOnLogsListener(subId)
    } catch (error) {
      logger.warn({ error }, 'Failed to remove logs listener')
    }
  }
}
