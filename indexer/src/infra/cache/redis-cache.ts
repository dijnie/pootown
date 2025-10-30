import { connection } from '#infra/queue/bull'
import { logger } from '#utils/logger'

// Gracefully handle noisy connection errors
connection.on('error', (err) => {
  logger.warn({ err }, '⚠️ Redis connection error')
})

function isRedisReady(): boolean {
  return (connection as any)?.status === 'ready'
}

/**
 * Lightweight JSON cache over shared Redis connection
 */
export async function getJsonCache<T>(key: string): Promise<T | null> {
  try {
    if (!isRedisReady()) return null
    const raw = await connection.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch (error) {
    logger.warn({ key, error }, '⚠️ Failed to read from Redis cache')
    return null
  }
}

export async function setJsonCache(key: string, value: unknown, ttlSeconds = 30): Promise<void> {
  try {
    if (!isRedisReady()) return
    const payload = JSON.stringify(value)
    await connection.set(key, payload, 'EX', ttlSeconds)
  } catch (error) {
    logger.warn({ key, error }, '⚠️ Failed to write to Redis cache')
  }
}

/**
 * Build a stable namespaced cache key from an object of parts
 */
export function buildCacheKey(namespace: string, parts: Record<string, unknown>): string {
  const stable = stableStringify(parts)
  return `cache:${namespace}:${stable}`
}

function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort()
  const entries = keys.map((k) => `${k}=${serialize(obj[k])}`)
  return entries.join('|')
}

function serialize(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`
  if (typeof value === 'object') return `{${stableStringify(value as Record<string, unknown>)}}`
  return String(value)
}
