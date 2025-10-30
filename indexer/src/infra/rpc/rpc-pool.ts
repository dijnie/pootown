import { env } from '#config'
import { Connection } from '@solana/web3.js'
import { CircuitBreaker } from '#utils/circuit-breaker'
import { logger } from '#utils/logger'

interface RpcEndpoint {
  url: string
  connection: Connection
  circuitBreaker: CircuitBreaker
  priority: number
  lastUsed: number
  totalRequests: number
  totalErrors: number
}

export class RpcPool {
  private endpoints: RpcEndpoint[] = []
  private healthCheckInterval?: NodeJS.Timeout

  constructor() {
    this.initializeEndpoints()
    this.startHealthCheckTimer()
  }

  private initializeEndpoints() {
    this.addEndpoint(env.rpc.er.http, 1)

    logger.info(`RPC Pool initialized with ${this.endpoints.length} endpoints`)
  }

  private addEndpoint(url: string, priority: number) {
    const connection = new Connection(url, {
      commitment: env.solana.commitment as any,
      confirmTransactionInitialTimeout: 30000, // 30s timeout
      httpHeaders: {
        'User-Agent': 'monopoly-indexer/1.0'
      }
    })

    const circuitBreaker = new CircuitBreaker({
      name: `rpc-${this.endpoints.length}`,
      failureThreshold: 3, // Open after 3 failures (more aggressive)
      resetTimeout: 15000, // Try again after 15 seconds (faster recovery)
      successThreshold: 1 // Need only 1 success to close (faster recovery)
    })

    this.endpoints.push({
      url,
      connection,
      circuitBreaker,
      priority,
      lastUsed: 0,
      totalRequests: 0,
      totalErrors: 0
    })
  }

  /**
   * Get the best available RPC endpoint
   */
  getHealthyEndpoint(): { connection: Connection; endpoint: RpcEndpoint } | null {
    // Sort by priority and health
    let availableEndpoints = this.endpoints
      .filter((endpoint) => endpoint.circuitBreaker.getState() !== 'OPEN')
      .sort((a, b) => {
        // First by priority (lower number = higher priority)
        if (a.priority !== b.priority) {
          return a.priority - b.priority
        }
        // Then by least recently used
        return a.lastUsed - b.lastUsed
      })

    // If no healthy endpoints, try to reset circuit breakers that have been OPEN for too long
    if (availableEndpoints.length === 0) {
      const now = Date.now()
      this.endpoints.forEach((endpoint) => {
        if (endpoint.circuitBreaker.getState() === 'OPEN') {
          // Force reset circuit breakers that have been open for more than 5 minutes
          const timeSinceLastFailure = now - endpoint.lastUsed
          if (timeSinceLastFailure > 300000) {
            // 5 minutes
            logger.info(
              `Force resetting circuit breaker for ${endpoint.url} (been open for ${Math.floor(timeSinceLastFailure / 60000)}m)`
            )
            endpoint.circuitBreaker.reset()
          }
        }
      })

      // Retry after reset
      availableEndpoints = this.endpoints
        .filter((endpoint) => endpoint.circuitBreaker.getState() !== 'OPEN')
        .sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority
          }
          return a.lastUsed - b.lastUsed
        })

      if (availableEndpoints.length === 0) {
        logger.error('No healthy RPC endpoints available!')
        logger.error('RPC Pool Stats:' + JSON.stringify(this.getStats(), null, 2))
        return null
      }
    }

    const endpoint = availableEndpoints[0]
    endpoint.lastUsed = Date.now()
    endpoint.totalRequests++

    return { connection: endpoint.connection, endpoint }
  }

  /**
   * Execute a function with automatic RPC failover
   */
  async executeWithFailover<T>(
    fn: (connection: Connection) => Promise<T>,
    operation: string,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const rpcData = this.getHealthyEndpoint()
      if (!rpcData) throw new Error('No healthy RPC endpoints available')

      const { connection, endpoint } = rpcData
      try {
        const result = await endpoint.circuitBreaker.execute(() => fn(connection))
        logger.debug(`RPC ${operation} success via ${endpoint.url} (attempt ${attempt + 1})`)
        return result
      } catch (error: any) {
        lastError = error
        endpoint.totalErrors++

        const msg = String(error?.message ?? '')
        const isRateLimit = error?.code === 429 || msg.includes('429') || msg.includes('Too Many Requests')
        const isRetryable =
          isRateLimit ||
          msg.includes('Failed to query long-term storage') || // -32019
          msg.includes('ETIMEDOUT') ||
          msg.includes('ECONNRESET')

        if (isRateLimit) {
          logger.warn(`RPC ${operation} rate limited on ${endpoint.url} (attempt ${attempt + 1}/${maxRetries})`)
          await this.sleep(Math.min(1000 * Math.pow(2, attempt), 5000))
        } else if (isRetryable) {
          logger.warn(
            `RPC ${operation} transient error on ${endpoint.url}: ${msg} (attempt ${attempt + 1}/${maxRetries})`
          )
          await this.sleep(Math.min(500 * Math.pow(2, attempt), 3000))
        } else {
          logger.warn(`RPC ${operation} failed on ${endpoint.url}: ${msg} (attempt ${attempt + 1}/${maxRetries})`)
        }
      }
    }

    logger.error(`RPC ${operation} failed on all endpoints after ${maxRetries} attempts`)
    throw lastError || new Error(`RPC ${operation} failed on all endpoints`)
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return this.endpoints.map((endpoint) => ({
      url: endpoint.url,
      priority: endpoint.priority,
      state: endpoint.circuitBreaker.getState(),
      totalRequests: endpoint.totalRequests,
      totalErrors: endpoint.totalErrors,
      errorRate:
        endpoint.totalRequests > 0 ? ((endpoint.totalErrors / endpoint.totalRequests) * 100).toFixed(2) + '%' : '0%',
      lastUsed: endpoint.lastUsed ? new Date(endpoint.lastUsed).toISOString() : 'never'
    }))
  }

  /**
   * Reset all circuit breakers (useful for manual recovery)
   */
  resetAllCircuitBreakers() {
    this.endpoints.forEach((endpoint) => {
      endpoint.circuitBreaker.reset()
    })
    logger.info('All RPC circuit breakers reset')
  }

  private startHealthCheckTimer() {
    // Check health every 2 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, 120000)
  }

  private async performHealthCheck() {
    logger.debug('Performing RPC health check...')

    for (const endpoint of this.endpoints) {
      if (endpoint.circuitBreaker.getState() === 'OPEN') {
        try {
          // Try a simple getSlot call to test endpoint health
          await endpoint.connection.getSlot()
          logger.info(`RPC endpoint ${endpoint.url} is healthy again, resetting circuit breaker`)
          endpoint.circuitBreaker.reset()
        } catch (error) {
          logger.debug(`RPC endpoint ${endpoint.url} still unhealthy: ${(error as Error).message}`)
        }
      }
    }
  }

  destroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Export singleton instance
export const rpcPool = new RpcPool()
