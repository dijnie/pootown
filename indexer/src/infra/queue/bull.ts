import { env } from '#config'

import { Queue, Worker, QueueEvents, QueueOptions, WorkerOptions } from 'bullmq'
import IORedis from 'ioredis'

export const connection = new IORedis(env.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
  connectTimeout: 30000,
  commandTimeout: 30000,
  enableOfflineQueue: true
})

const baseQueueOpts: Omit<QueueOptions, 'connection'> = {
  prefix: env.queue.prefix
}

const queueOpts = {
  connection,
  prefix: env.queue.prefix,
  defaultJobOptions: env.queue.jobDefaults,
  ...(env.queue.limiter ? { limiter: env.queue.limiter } : {})
}

export function createQueue(name: string) {
  return new Queue(name, { connection, ...baseQueueOpts })
}
export function createQueueEvents(name: string) {
  return new QueueEvents(name, { connection, ...baseQueueOpts })
}
const baseWorkerOpts = {
  connection,
  prefix: env.queue.prefix
}

export function createWorker<Name extends string, Data = any>(
  name: Name,
  processor: (job: any) => Promise<any> | any,
  opts: Partial<WorkerOptions> = {}
) {
  return new Worker<Data>(name, processor, { ...baseWorkerOpts, ...opts })
}

export const realtimeQueue = new Queue('realtime', queueOpts)

export const writerQueue = new Queue('writer', queueOpts)
export const writerDlq = new Queue('writer-dlq', queueOpts)

export const writerEvents = new QueueEvents('writer', { connection, prefix: env.queue.prefix })
export const writerDlqEvents = new QueueEvents('writer-dlq', { connection, prefix: env.queue.prefix })

export const workerBaseOpts = baseWorkerOpts

export { Worker }
