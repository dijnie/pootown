import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";

const MIGRATION_LOCK_ID = 7_315_492_041;

export interface MigrationRunnerOptions {
  readonly migrationsDirectory?: string;
  readonly rolesFile?: string;
}

async function ensureHistory(client: PoolClient): Promise<void> {
  await client.query("SET ROLE migration_owner");
  await client.query("CREATE SCHEMA IF NOT EXISTS infra AUTHORIZATION migration_owner");
  await client.query(`
    CREATE TABLE IF NOT EXISTS infra.schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL CHECK (length(checksum) = 64),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
  await client.query("REVOKE ALL ON SCHEMA infra FROM PUBLIC");
  await client.query("REVOKE ALL ON infra.schema_migrations FROM PUBLIC");
}

async function applyMigration(client: PoolClient, name: string, sql: string): Promise<void> {
  const checksum = createHash("sha256").update(sql).digest("hex");
  const existing = await client.query<{ checksum: string }>(
    "SELECT checksum FROM infra.schema_migrations WHERE name = $1",
    [name],
  );
  if (existing.rowCount === 1) {
    if (existing.rows[0]?.checksum !== checksum) throw new Error(`Migration drift detected: ${name}`);
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO infra.schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function validateMigrationSet(client: PoolClient, names: readonly string[]): Promise<void> {
  const applied = await client.query<{ name: string }>(
    "SELECT name FROM infra.schema_migrations ORDER BY name",
  );
  const appliedNames = applied.rows.map((row) => row.name);
  const missing = appliedNames.filter((name) => !names.includes(name));
  if (missing.length > 0) throw new Error(`Applied migration files are missing: ${missing.join(", ")}`);

  const latestApplied = appliedNames.at(-1);
  const retroactive = latestApplied === undefined
    ? []
    : names.filter((name) => !appliedNames.includes(name) && name < latestApplied);
  if (retroactive.length > 0) {
    throw new Error(`Retroactive migrations are not allowed: ${retroactive.join(", ")}`);
  }
}

export async function runMigrations(databaseUrl: string, options: MigrationRunnerOptions = {}): Promise<void> {
  const migrationsDirectory = options.migrationsDirectory ?? resolve(__dirname, "migrations");
  const rolesFile = options.rolesFile ?? resolve(__dirname, "roles/provision.sql");
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: "pootown-migrator" });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(await readFile(rolesFile, "utf8"));
    await ensureHistory(client);
    const names = (await readdir(migrationsDirectory))
      .filter((name) => /^[0-9]{4}-[a-z0-9-]+\.sql$/.test(name))
      .sort();
    if (names.length === 0) throw new Error("No database migrations found");
    await validateMigrationSet(client, names);
    for (const name of names) {
      await applyMigration(client, name, await readFile(resolve(migrationsDirectory, name), "utf8"));
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}
