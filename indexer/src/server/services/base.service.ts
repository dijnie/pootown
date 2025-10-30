/**
 * Common filter interface for database queries
 * Provides type-safe property filtering across all services
 */
export interface QueryFilters {
  readonly [key: string]: unknown
}

/**
 * Pagination configuration for large dataset queries
 * Enforces reasonable limits to prevent performance issues
 */
export interface PaginationOptions {
  readonly page?: number
  readonly limit?: number
  readonly sortBy?: string
  readonly sortOrder?: 'asc' | 'desc'
}

/**
 * Paginated query result container
 * Provides consistent structure for paginated responses
 */
export interface PaginatedResult<T> {
  readonly data: T[]
  readonly total: number
  readonly page?: number
  readonly limit?: number
}

/**
 * Base database service interface
 * Defines common operations that all entity services must implement
 */
export interface BaseService<TEntity, TNewEntity> {
  /**
   * Create or update an entity (upsert operation)
   * @param entity - Entity data to persist
   */
  upsert(entity: TNewEntity): Promise<void>

  /**
   * Retrieve a single entity by its blockchain pubkey
   * @param pubkey - Blockchain account public key
   */
  getByPubkey(pubkey: string): Promise<TEntity | null>

  /**
   * Query entities with filtering and pagination
   * @param filters - Query filters
   * @param pagination - Pagination options
   */
  query(filters?: QueryFilters, pagination?: PaginationOptions): Promise<PaginatedResult<TEntity>>
}

/**
 * Service error types for structured error handling
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

export class EntityNotFoundError extends ServiceError {
  constructor(entityType: string, identifier: string) {
    super(`${entityType} not found: ${identifier}`, 'ENTITY_NOT_FOUND')
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', cause)
  }
}

export class DatabaseError extends ServiceError {
  constructor(message: string, cause?: Error) {
    super(message, 'DATABASE_ERROR', cause)
  }
}
