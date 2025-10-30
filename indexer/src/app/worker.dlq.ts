import { env } from '#config'
import { metrics } from '#infra/metrics/metrics'
import { Worker, writerQueue, workerBaseOpts } from '#infra/queue/bull'
import { logger } from '#utils/logger'

const MAX_REPLAYS = Number(env.dlq.maxReplays ?? 3)
const REPLAY_DELAY_MS = Number(env.dlq.replayDelayMs ?? 30000)

function isPermanentError(msg: string) {
  return /duplicate key value|unique constraint|foreign key constraint|invalid input|syntax error/i.test(msg || '')
}

export function startDlqReplayer() {
  const worker = new Worker(
    'writer-dlq',
    async (job) => {
      const data: Record<string, any> = job.data || {}
      const reason = String(data.__dlq_reason || '')
      const replayed = Number(data.__dlq_replayed ?? 0)

      if (isPermanentError(reason)) {
        logger.warn({ jobId: job.id, reason }, 'DLQ skip (permanent error)')
        metrics.incr('dlq:skipped')
        return
      }
      if (replayed >= MAX_REPLAYS) {
        logger.warn({ jobId: job.id, replayed }, 'DLQ skip (max replays reached)')
        metrics.incr('dlq:skipped')
        return
      }

      const replayData = { ...data, __dlq_replayed: replayed + 1 }
      const record = data.record as { data?: { pubkey?: string } } | undefined
      await writerQueue.add('write', replayData, {
        delay: REPLAY_DELAY_MS,
        priority: 10, // Low priority for DLQ replays
        jobId: record?.data?.pubkey ?? undefined // idempotent nếu có pubkey
      })
      metrics.incr('dlq:requeued')
    },
    workerBaseOpts
  )

  logger.info('DLQ replayer started')
  return worker
}
