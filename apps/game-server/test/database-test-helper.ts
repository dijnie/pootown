import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import {
  gameId,
  playerId,
  serializeSnapshot,
  transition,
  type GameState,
  type RandomCheckpoint,
  type RandomSource,
} from "@pootown/game-core";
import { Pool } from "pg";

export interface TestDatabase {
  readonly container: StartedPostgreSqlContainer;
  readonly pool: Pool;
}

class DatabaseTestRandomSource implements RandomSource {
  public nextBytes(length: number): Uint8Array {
    return new Uint8Array(length);
  }

  public checkpoint(): RandomCheckpoint {
    return { algorithm: "database-test-v1", state: "initial", draws: 0, bytesConsumed: 0 };
  }

  public canResume(checkpoint: RandomCheckpoint): boolean {
    return checkpoint.algorithm === "database-test-v1";
  }
}

export function lifecycleSnapshot(gameIdValue: string, stateVersion: number): string {
  const result = transition(null, {
    type: "createGame",
    expectedStateVersion: 0,
    payload: { gameId: gameId(gameIdValue), maximumPlayers: 4, timeLimitMs: 3_600_000 },
  }, {
    actorId: playerId("player_checkpoint"),
    nowMs: Date.parse("2026-08-11T17:00:00.000Z"),
    randomSource: new DatabaseTestRandomSource(),
  });
  if (!result.ok) throw new Error(result.error.message);
  return serializeSnapshot({ ...(result.state as GameState), stateVersion });
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer("postgres:17.6-alpine").start();
  const pool = new Pool({ connectionString: container.getConnectionUri(), max: 12 });
  const client = await pool.connect();
  try {
    const apiDatabase = resolve(process.cwd(), "../api/src/database");
    await client.query(await readFile(resolve(apiDatabase, "roles/provision.sql"), "utf8"));
    await client.query("SET ROLE migration_owner");
    const migrationsDirectory = resolve(apiDatabase, "migrations");
    const migrations = (await readdir(migrationsDirectory))
      .filter((name) => /^[0-9]{4}-[a-z0-9-]+\.sql$/.test(name))
      .sort();
    for (const migration of migrations) {
      await client.query("BEGIN");
      try {
        await client.query(await readFile(resolve(migrationsDirectory, migration), "utf8"));
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    await client.query("RESET ROLE");
  } finally {
    client.release();
  }
  return { container, pool };
}

export async function stopTestDatabase(database: TestDatabase): Promise<void> {
  await database.pool.end();
  await database.container.stop();
}

export async function seedGameSession(pool: Pool, gameId: string, roomId: string): Promise<void> {
  await pool.query(
    "INSERT INTO identity.users (id, privy_did) VALUES ($1, $2)",
    [`user_${gameId}`, `did:privy:${gameId}`],
  );
  await pool.query(
    `
      INSERT INTO game.game_definitions
        (id, policy_version, display_name, maximum_players, entry_coin, policy_snapshot, policy_hash)
      VALUES ('classic_100', 1, 'Classic', 4, 100, '{"rules":"classic"}', decode(repeat('99', 32), 'hex'))
      ON CONFLICT DO NOTHING
    `,
  );
  await pool.query(
    `
      INSERT INTO game.game_sessions
        (id, room_id, game_definition_id, game_definition_version, creator_user_id, lifecycle,
         maximum_players, entry_coin, policy_snapshot, policy_hash)
      VALUES ($1, $2, 'classic_100', 1, $3, 'open', 4, 100, '{"rules":"classic"}', decode(repeat('99', 32), 'hex'))
    `,
    [gameId, roomId, `user_${gameId}`],
  );
}
