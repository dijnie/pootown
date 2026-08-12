import { resolve } from "node:path";

import { runMigrations } from "./migration-runner";

async function main(): Promise<void> {
  const databaseUrl = process.argv[2]
    ?? "postgresql://postgres:pootown-local@127.0.0.1:5433/pootown";

  await runMigrations(databaseUrl, {
    migrationsDirectory: resolve(__dirname, "migrations"),
    rolesFile: resolve(__dirname, "roles/provision.sql"),
  });
}

void main().catch((error: unknown) => {
  process.stderr.write(`Database migration failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
