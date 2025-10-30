import { Static, Type } from '@sinclair/typebox'
import envSchema from 'env-schema'

enum NodeEnv {
  development = 'development',
  production = 'production'
}

export enum LogLevel {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error'
}

enum QueueProfile {
  tiny = 'tiny',
  small = 'small',
  standard = 'standard',
  large = 'large'
}

const schema = Type.Object({
  // Database
  DATABASE_URL: Type.String(),

  // Redis
  REDIS_URL: Type.String({ default: 'redis://localhost:6379' }),

  // Server
  LOG_LEVEL: Type.Enum(LogLevel),
  NODE_ENV: Type.Enum(NodeEnv),
  HOST: Type.String({ default: 'localhost' }),
  PORT: Type.Number({ default: 8080 }),

  // RPC Endpoints
  HELIUS_RPC_URL: Type.String(),
  HELIUS_RPC_WS_URL: Type.String(),

  // Ephemeral Rollup RPC Endpoints
  ER_RPC_URL: Type.String({ default: 'https://devnet.magicblock.app/' }),
  ER_RPC_WS_URL: Type.String({ default: 'wss://devnet.magicblock.app/' }),

  // Indexer
  REALTIME_ENABLED: Type.Boolean({ default: true }),
  BLOCKCHAIN_SYNC_INTERVAL_MINUTES: Type.Number({ default: 3 }),

  // DLQ replayer
  DLQ_MAX_REPLAYS: Type.Number({ default: 3 }),
  DLQ_REPLAY_DELAY_MS: Type.Number({ default: 30000 }),

  DEPENDENCY_MAX_RETRIES: Type.Number({ default: 3 }),
  DEPENDENCY_DELAY_MS: Type.Number({ default: 1000 }),

  // Solana Configuration
  SOLANA_PROGRAM_ID: Type.String(),
  SOLANA_COMMITMENT: Type.String({ default: 'confirmed' }),
  SOLANA_RATE_LIMIT: Type.Number({ default: 50 }),

  // Queue Configuration
  QUEUE_MEMORY_PROFILE: Type.Enum(QueueProfile, { default: QueueProfile.standard }),
  BULLMQ_PREFIX: Type.String({ default: 'monopoly_er' }),
  BULLMQ_LIMITER_MAX: Type.Number({ default: 60 }),
  BULLMQ_LIMITER_DURATION: Type.Number({ default: 1000 }),
  PARSER_CONCURRENCY: Type.Number({ default: 4 }),

  // Job Configuration
  BULLMQ_ATTEMPTS: Type.Number({ default: 8 }),
  BULLMQ_BACKOFF_MS: Type.Number({ default: 500 }),
  BULLMQ_REMOVE_ON_COMPLETE: Type.Number({ default: 5000 }),
  BULLMQ_REMOVE_ON_FAIL: Type.Number({ default: 500 })
})

const raw = envSchema<Static<typeof schema>>({
  dotenv: true,
  schema
})

function tuneByProfile(profile: QueueProfile) {
  switch (profile) {
    case QueueProfile.tiny:
      return {
        attempts: 8,
        backoffMs: 2000,
        removeOnComplete: 200,
        removeOnFail: 50,
        concurrency: 1,
        limiterMax: undefined,
        limiterDuration: undefined
      }
    case QueueProfile.small:
      return {
        attempts: 8,
        backoffMs: 1500,
        removeOnComplete: 1000,
        removeOnFail: 100,
        concurrency: 2,
        limiterMax: 30,
        limiterDuration: 1000
      }
    case QueueProfile.standard:
      return {
        attempts: 8,
        backoffMs: 500,
        removeOnComplete: 5000,
        removeOnFail: 500,
        concurrency: 4,
        limiterMax: 60,
        limiterDuration: 1000
      }
    case QueueProfile.large:
      return {
        attempts: 8,
        backoffMs: 400,
        removeOnComplete: 20000,
        removeOnFail: 1000,
        concurrency: 8,
        limiterMax: 120,
        limiterDuration: 1000
      }
  }
}

const preset = tuneByProfile(raw.QUEUE_MEMORY_PROFILE)

// Get queue tune values, preferring env values over preset defaults
const tune = {
  attempts: raw.BULLMQ_ATTEMPTS ?? preset.attempts,
  backoffMs: raw.BULLMQ_BACKOFF_MS ?? preset.backoffMs,
  removeOnComplete: raw.BULLMQ_REMOVE_ON_COMPLETE ?? preset.removeOnComplete,
  removeOnFail: raw.BULLMQ_REMOVE_ON_FAIL ?? preset.removeOnFail,
  concurrency: raw.PARSER_CONCURRENCY ?? preset.concurrency,
  limiterMax: raw.BULLMQ_LIMITER_MAX ?? preset.limiterMax,
  limiterDuration: raw.BULLMQ_LIMITER_DURATION ?? preset.limiterDuration
}

const bullJobDefaults = {
  attempts: tune.attempts,
  backoff: { type: 'exponential' as const, delay: tune.backoffMs },
  removeOnComplete: tune.removeOnComplete,
  removeOnFail: tune.removeOnFail
}

// Limiter for Queue (if enabled)
const bullLimiter =
  tune.limiterMax && tune.limiterDuration ? { max: tune.limiterMax, duration: tune.limiterDuration } : undefined

const env = {
  nodeEnv: raw.NODE_ENV,
  isDevelopment: raw.NODE_ENV === NodeEnv.development,

  log: {
    level: raw.LOG_LEVEL
  },

  server: {
    host: raw.HOST,
    port: raw.PORT
  },

  db: {
    url: raw.DATABASE_URL
  },

  redis: {
    url: raw.REDIS_URL
  },

  rpc: {
    // Helius RPC for historical data sync
    helius: {
      http: raw.HELIUS_RPC_URL,
      ws: raw.HELIUS_RPC_WS_URL
    },
    // Magic Block ER RPC for realtime indexing
    er: {
      http: raw.ER_RPC_URL,
      ws: raw.ER_RPC_WS_URL
    }
  },

  indexer: {
    realtimeEnabled: raw.REALTIME_ENABLED,
    syncIntervalMinutes: raw.BLOCKCHAIN_SYNC_INTERVAL_MINUTES
  },

  dlq: {
    maxReplays: raw.DLQ_MAX_REPLAYS,
    replayDelayMs: raw.DLQ_REPLAY_DELAY_MS
  },

  dependencies: {
    maxRetries: raw.DEPENDENCY_MAX_RETRIES,
    delayMs: raw.DEPENDENCY_DELAY_MS
  },

  solana: {
    programId: raw.SOLANA_PROGRAM_ID,
    commitment: raw.SOLANA_COMMITMENT,
    rateLimit: raw.SOLANA_RATE_LIMIT
  },

  queue: {
    profile: raw.QUEUE_MEMORY_PROFILE,
    prefix: raw.BULLMQ_PREFIX,
    concurrency: tune.concurrency,
    jobDefaults: bullJobDefaults,
    limiter: bullLimiter
  }
}

export type Env = typeof env
export default env
