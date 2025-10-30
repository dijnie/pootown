import { db } from '#infra/db/client'
import { logger } from './logger'

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface ComponentMetrics {
  lastProcessedSlot?: number
  lastProcessedTimestamp?: number
  status?: string
  updatedAt?: Date | null
  [key: string]: unknown
}

export interface HealthReport {
  status: HealthStatus
  components: Record<string, ComponentMetrics>
  lastCheck: number
  uptime: number
}

export class HealthCheck {
  private static instance: HealthCheck
  private readonly metrics = new Map<string, ComponentMetrics>()
  private status: HealthStatus = 'healthy'
  private lastCheck = 0
  private readonly startTime = Date.now()

  private constructor() {}

  public static getInstance(): HealthCheck {
    if (!HealthCheck.instance) {
      HealthCheck.instance = new HealthCheck()
    }
    return HealthCheck.instance
  }

  /**
   * Register metrics for a component
   */
  public registerMetrics(component: string, metrics: ComponentMetrics): void {
    this.metrics.set(component, { ...metrics, updatedAt: new Date() })
  }

  /**
   * Update the status of the system
   */
  public updateStatus(status: HealthStatus): void {
    if (this.status !== status) {
      logger.info(`Health status changed from ${this.status} to ${status}`)
      this.status = status
    }
    this.lastCheck = Date.now()
  }

  /**
   * Check the health of the system
   */
  public async checkHealth(): Promise<HealthReport> {
    const now = Date.now()
    this.lastCheck = now

    try {
      const components = await this.collectComponentMetrics()
      const systemStatus = this.determineSystemHealth(components)

      if (this.status !== systemStatus) {
        this.updateStatus(systemStatus)
      }

      return {
        status: this.status,
        components,
        lastCheck: this.lastCheck,
        uptime: now - this.startTime
      }
    } catch {
      logger.error('Error checking health')
      this.status = 'unhealthy'

      return {
        status: this.status,
        components: Object.fromEntries(this.metrics),
        lastCheck: this.lastCheck,
        uptime: now - this.startTime
      }
    }
  }

  /**
   * Collect metrics from all registered components and database
   */
  private async collectComponentMetrics(): Promise<Record<string, ComponentMetrics>> {
    const components: Record<string, ComponentMetrics> = {}

    // Add registered component metrics
    for (const [component, metrics] of this.metrics.entries()) {
      components[component] = { ...metrics }
    }

    // Add database connectivity check
    try {
      await db.execute('SELECT 1 as ping')
      components.database = {
        status: 'healthy',
        ping: true,
        updatedAt: new Date()
      }
    } catch {
      logger.warn('Database health check failed')
      components.database = {
        status: 'unhealthy',
        ping: false,
        updatedAt: new Date()
      }
    }

    return components
  }

  /**
   * Determine overall system health based on component metrics
   */
  private determineSystemHealth(components: Record<string, ComponentMetrics>): HealthStatus {
    const componentStatuses = Object.values(components)
      .map((c) => c.status)
      .filter(Boolean)

    if (componentStatuses.some((status) => status === 'failed' || status === 'unhealthy')) {
      return 'unhealthy'
    }

    if (componentStatuses.some((status) => status === 'stopped' || status === 'degraded')) {
      return 'degraded'
    }

    return 'healthy'
  }

  /**
   * Get current health status without performing checks
   */
  public getStatus(): HealthStatus {
    return this.status
  }

  /**
   * Get system uptime in milliseconds
   */
  public getUptime(): number {
    return Date.now() - this.startTime
  }
}
