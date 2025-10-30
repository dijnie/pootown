import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
import dotenv from 'dotenv'

dotenv.config()

export default defineConfig({
  out: './src/infra/db/migrations',
  schema: './src/infra/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
})
