import { db, client } from './client'
import dotenv from 'dotenv'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import path from 'path'

dotenv.config()

async function runMigrations() {
  console.log('Running migrations...')

  try {
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), './src/infra/db/migrations')
    })
    console.log('Migrations completed successfully')
  } catch (error) {
    console.error('Error during migration:', error)
    process.exit(1)
  } finally {
    await client.end()
    process.exit(0)
  }
}

runMigrations()
