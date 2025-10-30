import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client'
import type { Queue } from 'bullmq'

export const register = new Registry()
collectDefaultMetrics({ register })

const counters = {
  writerProcessed: new Counter({
    name: 'writer_processed_total',
    help: 'Writer processed jobs',
    registers: [register]
  }),
  writerFailed: new Counter({ name: 'writer_failed_total', help: 'Writer failed jobs', registers: [register] }),
  writerCompletedEvent: new Counter({
    name: 'writer_completed_event_total',
    help: 'Writer completed events',
    registers: [register]
  }),
  writerFailedEvent: new Counter({
    name: 'writer_failed_event_total',
    help: 'Writer failed events',
    registers: [register]
  }),
  dlqRequeued: new Counter({ name: 'writer_dlq_requeued_total', help: 'DLQ requeued jobs', registers: [register] }),
  dlqSkipped: new Counter({ name: 'writer_dlq_skipped_total', help: 'DLQ skipped jobs', registers: [register] })
}

const histograms = {
  writerDuration: new Histogram({
    name: 'writer_duration_seconds',
    help: 'Duration of writer job processing in seconds',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [register]
  })
}

const gauges = {
  queueJobs: new Gauge({
    name: 'queue_jobs',
    help: 'Current jobs by state',
    labelNames: ['queue', 'state'],
    registers: [register]
  })
}

export const metrics = {
  incr(name: string) {
    switch (name) {
      case 'writer:processed':
        counters.writerProcessed.inc()
        break
      case 'writer:failed':
        counters.writerFailed.inc()
        break
      case 'writer:completed':
        counters.writerCompletedEvent.inc()
        break
      case 'writer:failed:event':
        counters.writerFailedEvent.inc()
        break
      case 'dlq:requeued':
        counters.dlqRequeued.inc()
        break
      case 'dlq:skipped':
        counters.dlqSkipped.inc()
        break
      default:
        console.warn(`Unknown metric name: ${name}`)
        break
    }
  },
  // dùng trong writer worker để đo thời gian xử lý 1 job
  startTimer(which: 'writer:duration') {
    switch (which) {
      case 'writer:duration':
        return histograms.writerDuration.startTimer()
      default:
        return () => {}
    }
  },
  setQueueGauge(queue: string, state: string, value: number) {
    gauges.queueJobs.set({ queue, state }, value)
  },

  async exposeProm() {
    return { contentType: register.contentType, body: await register.metrics() }
  }
}

// Poll định kỳ để set Gauge size của các queue
export function startQueueMetricsPoller(queues: Record<string, Queue>, intervalMs = 5000) {
  let stopped = false
  const poll = async () => {
    for (const [name, queue] of Object.entries(queues)) {
      try {
        const [waiting, active, delayed, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getDelayedCount(),
          queue.getCompletedCount(),
          queue.getFailedCount()
        ])
        metrics.setQueueGauge(name, 'waiting', waiting)
        metrics.setQueueGauge(name, 'active', active)
        metrics.setQueueGauge(name, 'delayed', delayed)
        metrics.setQueueGauge(name, 'completed', completed)
        metrics.setQueueGauge(name, 'failed', failed)
      } catch {
        // ignore polling errors
      }
    }
  }
  const handle = setInterval(() => {
    if (!stopped) poll()
  }, intervalMs)
  poll() // run once immediately
  return () => {
    stopped = true
    clearInterval(handle)
  }
}
