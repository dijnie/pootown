/**
 * Response Formatter Utility
 *
 * Provides consistent response structure across all API endpoints.
 * Ensures uniform error and success handling following Google API standards.
 *
 * Features:
 * - Standardized success/error response format
 * - Automatic request ID tracking
 * - HTTP status code mapping
 * - Pagination support
 * - TypeScript type safety
 *
 * @author Senior Engineer - Following Google Code Standards
 */

import { FastifyReply } from 'fastify'

// ==================== RESPONSE INTERFACES ====================

export interface BaseResponse {
  success: boolean
  requestId: string
  timestamp: string
}

export interface SuccessResponse<T = any> extends BaseResponse {
  success: true
  data: T
}

export interface ErrorResponse extends BaseResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface PaginatedData<T> {
  items: T[]
  pagination: PaginationMeta
}

// ==================== ERROR CODES ====================

export const ERROR_CODES = {
  // Client Errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  GAME_ID_REQUIRED: 'GAME_ID_REQUIRED',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  PROPERTY_NOT_FOUND: 'PROPERTY_NOT_FOUND',
  TRADE_NOT_FOUND: 'TRADE_NOT_FOUND',
  INVALID_GAME_STATE: 'INVALID_GAME_STATE',
  INVALID_PARAMETERS: 'INVALID_PARAMETERS',

  // Server Errors (5xx)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED'
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// ==================== HTTP STATUS MAPPING ====================

const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  // 400 Bad Request
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.GAME_ID_REQUIRED]: 400,
  [ERROR_CODES.INVALID_PARAMETERS]: 400,
  [ERROR_CODES.INVALID_GAME_STATE]: 400,

  // 401 Unauthorized
  [ERROR_CODES.UNAUTHORIZED]: 401,

  // 403 Forbidden
  [ERROR_CODES.FORBIDDEN]: 403,

  // 404 Not Found
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.ROUTE_NOT_FOUND]: 404,
  [ERROR_CODES.GAME_NOT_FOUND]: 404,
  [ERROR_CODES.PLAYER_NOT_FOUND]: 404,
  [ERROR_CODES.PROPERTY_NOT_FOUND]: 404,
  [ERROR_CODES.TRADE_NOT_FOUND]: 404,

  // 405 Method Not Allowed
  [ERROR_CODES.METHOD_NOT_ALLOWED]: 405,

  // 409 Conflict
  [ERROR_CODES.CONFLICT]: 409,

  // 500 Internal Server Error
  [ERROR_CODES.INTERNAL_SERVER_ERROR]: 500,
  [ERROR_CODES.DATABASE_ERROR]: 500,
  [ERROR_CODES.TIMEOUT]: 500,

  // 501 Not Implemented
  [ERROR_CODES.NOT_IMPLEMENTED]: 501,

  // 503 Service Unavailable
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 503
}

// ==================== RESPONSE FORMATTER CLASS ====================

export class ResponseFormatter {
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private static generateTimestamp(): string {
    return new Date().toISOString()
  }

  /**
   * Format successful response
   */
  static success<T>(
    data: T,
    requestId?: string,
    statusCode: number = 200
  ): { response: SuccessResponse<T>; statusCode: number } {
    return {
      response: {
        success: true,
        data,
        requestId: requestId || this.generateRequestId(),
        timestamp: this.generateTimestamp()
      },
      statusCode
    }
  }

  /**
   * Format paginated response
   */
  static paginated<T>(
    items: T[],
    pagination: PaginationMeta,
    requestId?: string
  ): { response: SuccessResponse<PaginatedData<T>>; statusCode: number } {
    return this.success(
      {
        items,
        pagination
      },
      requestId
    )
  }

  /**
   * Format error response
   */
  static error(
    errorCode: ErrorCode,
    message: string,
    details?: unknown,
    requestId?: string
  ): { response: ErrorResponse; statusCode: number } {
    const statusCode = ERROR_STATUS_MAP[errorCode] || 500

    return {
      response: {
        success: false,
        error: {
          code: errorCode,
          message,
          details: details || undefined
        },
        requestId: requestId || this.generateRequestId(),
        timestamp: this.generateTimestamp()
      },
      statusCode
    }
  }

  /**
   * Send success response via Fastify reply
   */
  static sendSuccess<T>(__reply: FastifyReply, data: T, requestId?: string, statusCode: number = 200): void {
    const { response, statusCode: code } = this.success(data, requestId, statusCode)
    __reply.code(code).send(response)
  }

  /**
   * Send paginated response via Fastify reply
   */
  static sendPaginated<T>(__reply: FastifyReply, items: T[], pagination: PaginationMeta, requestId?: string): void {
    const { response, statusCode } = this.paginated(items, pagination, requestId)
    __reply.code(statusCode).send(response)
  }

  /**
   * Send error response via Fastify reply
   */
  static sendError(
    __reply: FastifyReply,
    errorCode: ErrorCode,
    message: string,
    details?: unknown,
    requestId?: string
  ): void {
    const { response, statusCode } = this.error(errorCode, message, details, requestId)
    __reply.code(statusCode).send(response)
  }

  /**
   * Create pagination metadata helper
   */
  static createPagination(page: number, limit: number, total: number): PaginationMeta {
    const totalPages = Math.ceil(total / limit)

    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  }

  // ==================== COMMON ERROR RESPONSES ====================

  /**
   * Standard 404 Not Found for routes
   */
  static routeNotFound(path: string, method: string, requestId?: string) {
    return this.error(ERROR_CODES.ROUTE_NOT_FOUND, `Route ${method} ${path} not found`, { path, method }, requestId)
  }

  /**
   * Standard 400 Validation Error
   */
  static validationError(message: string, details?: unknown, requestId?: string) {
    return this.error(ERROR_CODES.VALIDATION_ERROR, message, details, requestId)
  }

  /**
   * Standard 500 Internal Server Error
   */
  static internalError(message: string = 'Internal server error', requestId?: string) {
    return this.error(ERROR_CODES.INTERNAL_SERVER_ERROR, message, undefined, requestId)
  }

  /**
   * Standard Database Error
   */
  static databaseError(operation: string, details?: unknown, requestId?: string) {
    return this.error(ERROR_CODES.DATABASE_ERROR, `Database operation failed: ${operation}`, details, requestId)
  }

  /**
   * Standard Game Not Found Error
   */
  static gameNotFound(gameId: string | number, requestId?: string) {
    return this.error(ERROR_CODES.GAME_NOT_FOUND, `Game with ID ${gameId} not found`, { gameId }, requestId)
  }

  /**
   * Standard Game ID Required Error
   */
  static gameIdRequired(entity: string, requestId?: string) {
    return this.error(
      ERROR_CODES.GAME_ID_REQUIRED,
      `gameId is required for ${entity} operations`,
      { entity },
      requestId
    )
  }
}
