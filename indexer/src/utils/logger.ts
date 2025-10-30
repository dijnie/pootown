import env from '#config/env'
import pino from 'pino'
import { hostname } from 'os'

const createLogger = () => {
  const logLevel = env.log?.level || (env.isDevelopment ? 'info' : 'warn')

  return pino({
    level: logLevel,
    transport: env.isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      : undefined,
    base: {
      pid: process.pid,
      hostname: hostname()
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err
    }
  })
}

export const logger = createLogger()

export const createChildLogger = (bindings: Record<string, unknown>) => {
  return logger.child(bindings)
}
