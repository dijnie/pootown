import { logger } from './logger'

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation, requests allowed
  OPEN = 'OPEN', // Circuit is open, requests blocked
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back online
}

export interface CircuitBreakerOptions {
  name: string
  failureThreshold?: number
  resetTimeout?: number
  successThreshold?: number
}

export interface CircuitBreakerMetrics {
  state: CircuitState
  failureCount: number
  successCount: number
  lastFailureTime: number
  totalExecutions: number
  totalFailures: number
}

/**
 * Custom error for circuit breaker
 */
export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CircuitBreakerError'
  }
}

export class CircuitBreaker {
  private state = CircuitState.CLOSED
  private failureCount = 0
  private successCount = 0
  private lastFailureTime = 0
  private totalExecutions = 0
  private totalFailures = 0

  private readonly name: string
  private readonly failureThreshold: number
  private readonly resetTimeout: number
  private readonly successThreshold: number

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name
    this.failureThreshold = options.failureThreshold ?? 5
    this.resetTimeout = options.resetTimeout ?? 30_000 // 30 seconds
    this.successThreshold = options.successThreshold ?? 2
  }

  /**
   * Execute a function with circuit breaker protection
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalExecutions++

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.toHalfOpen()
      } else {
        throw new CircuitBreakerError(`Circuit breaker [${this.name}] is OPEN`)
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  /**
   * Check if circuit breaker should attempt to reset
   */
  private shouldAttemptReset(): boolean {
    const now = Date.now()
    return now - this.lastFailureTime >= this.resetTimeout
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.successThreshold) {
        this.toClose()
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0
    }
  }

  /**
   * Handle execution failure
   */
  private onFailure(): void {
    this.totalFailures++
    this.lastFailureTime = Date.now()

    switch (this.state) {
      case CircuitState.HALF_OPEN:
        this.toOpen()
        break
      case CircuitState.CLOSED:
        this.failureCount++
        if (this.failureCount >= this.failureThreshold) {
          this.toOpen()
        }
        break
      // No action needed for OPEN state
    }
  }

  /**
   * Transition to OPEN state
   */
  private toOpen(): void {
    if (this.state !== CircuitState.OPEN) {
      const previousState = this.state
      this.state = CircuitState.OPEN
      this.successCount = 0
      logger.warn(
        `Circuit breaker [${this.name}] opened (${previousState} -> OPEN) - failures: ${this.failureCount}/${this.failureThreshold}`
      )
    }
  }

  /**
   * Transition to HALF_OPEN state
   */
  private toHalfOpen(): void {
    if (this.state !== CircuitState.HALF_OPEN) {
      const previousState = this.state
      this.state = CircuitState.HALF_OPEN
      this.successCount = 0
      logger.info(
        `Circuit breaker [${this.name}] half-opened (${previousState} -> HALF_OPEN) after ${this.resetTimeout}ms timeout`
      )
    }
  }

  /**
   * Transition to CLOSED state
   */
  private toClose(): void {
    if (this.state !== CircuitState.CLOSED) {
      const previousState = this.state
      this.state = CircuitState.CLOSED
      this.failureCount = 0
      this.successCount = 0
      logger.info(
        `Circuit breaker [${this.name}] closed (${previousState} -> CLOSED) after ${this.successThreshold} successes`
      )
    }
  }

  /**
   * Reset the circuit breaker to CLOSED state
   */
  public reset(): void {
    const previousState = this.state
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = 0

    logger.info(`Circuit breaker [${this.name}] manually reset (${previousState} -> CLOSED)`)
  }

  /**
   * Get the current state of the circuit breaker
   */
  public getState(): CircuitState {
    return this.state
  }

  /**
   * Get circuit breaker name
   */
  public getName(): string {
    return this.name
  }

  /**
   * Get detailed circuit breaker metrics
   */
  public getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      totalExecutions: this.totalExecutions,
      totalFailures: this.totalFailures
    }
  }

  /**
   * Get failure rate as percentage
   */
  public getFailureRate(): number {
    if (this.totalExecutions === 0) return 0
    return (this.totalFailures / this.totalExecutions) * 100
  }
}
