import { FastifyError, FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { ResponseFormatter, ERROR_CODES } from '#shared/utils/response-formatter'
import { getRequestId } from './request-context'

// Base exception class
export class ExceptionBase extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
  }
}

// Monopoly-specific error types
export class GameNotFoundError extends ExceptionBase {
  constructor(gameId?: string | number) {
    super(404, `Game ${gameId ? `with ID ${gameId} ` : ''}not found`)
  }
}

export class PlayerNotFoundError extends ExceptionBase {
  constructor(playerId?: string) {
    super(404, `Player ${playerId ? `${playerId} ` : ''}not found`)
  }
}

export class PropertyNotFoundError extends ExceptionBase {
  constructor(propertyId?: string) {
    super(404, `Property ${propertyId ? `${propertyId} ` : ''}not found`)
  }
}

export class InvalidGameStateError extends ExceptionBase {
  constructor(message: string) {
    super(400, message)
  }
}

export class InsufficientFundsError extends ExceptionBase {
  constructor(required: number, available: number) {
    super(400, `Insufficient funds: required ${required}, available ${available}`)
  }
}

export class DatabaseError extends ExceptionBase {
  constructor(message: string) {
    super(500, `Database error: ${message}`)
  }
}

// Error handler plugin
async function errorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const requestId = getRequestId()

    // Handle validation errors
    if ((error as FastifyError).validation) {
      fastify.log.warn(error, 'Validation error')
      return reply.status(400).send({
        statusCode: 400,
        message: 'Validation Failed',
        error: 'Bad Request',
        details: (error as FastifyError).validation,
        correlationId: requestId
      })
    }

    // Handle monopoly-specific errors
    if (error instanceof ExceptionBase) {
      fastify.log.warn(error, 'Monopoly business logic error')
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        message: error.message,
        error: error.constructor.name,
        correlationId: requestId
      })
    }

    // Handle database errors
    if (error.message?.includes('database') || error.message?.includes('ECONNREFUSED')) {
      fastify.log.error(error, 'Database connection error')
      return reply.status(503).send({
        success: false,
        statusCode: 503,
        message: 'Service Temporarily Unavailable',
        error: 'Database Connection Error',
        requestId
      })
    }

    // Handle rate limit errors
    if ((error as FastifyError).statusCode === 429) {
      return reply.status(429).send({
        success: false,
        statusCode: 429,
        message: 'Too Many Requests',
        error: 'Rate Limit Exceeded',
        requestId
      })
    }

    // Generic server errors
    const statusCode = (error as FastifyError).statusCode || 500

    fastify.log.error(error, 'Unhandled error')
    return reply.status(statusCode).send({
      success: false,
      error: {
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
        statusCode
      },
      requestId
    })
  })

  // Handle 404 routes
  fastify.setNotFoundHandler((request, reply) => {
    return reply.status(404).send(
      ResponseFormatter.error(ERROR_CODES.NOT_FOUND, 'Route not found', {
        path: request.url,
        method: request.method
      })
    )
  })
}

export default fp(errorHandler, {
  fastify: '5.x',
  name: 'error-handler'
})
