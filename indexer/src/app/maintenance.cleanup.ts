import { Queue } from 'bullmq'

export function startRedisHousekeeping(queues: Queue[], intervalMs = 30000) {
  const run = async () => {
    for (const queue of queues) {
      // xóa job completed/failed cũ hơn 5 phút, tối đa 1000/lần
      await queue.clean(5 * 60 * 1000, 1000, 'completed').catch(() => {})
      await queue.clean(5 * 60 * 1000, 1000, 'failed').catch(() => {})
    }
  }
  const h = setInterval(run, intervalMs)
  run()
  return () => clearInterval(h)
}
