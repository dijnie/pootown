import env from './env'

export default {
  url: env.db.url,
  poolSize: 10,
  idleTimeout: 30000, // 30 seconds
  connectionTimeout: 5000, // 5 seconds
  statementTimeout: 60000, // 60 seconds
  ssl: env.isDevelopment ? false : true // use SSL in production
}
