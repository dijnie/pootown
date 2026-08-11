import { createServer, type Server as HttpServer } from "node:http";
import { pathToFileURL } from "node:url";
import { Server as ColyseusServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { Pool } from "pg";
import pino from "pino";

import { InternalApiClient } from "./api/internal-api-client.js";
import { parseGameServerEnvironment, type GameServerConfig } from "./app-config.js";
import { Es256ServiceCredentialProvider } from "./auth/service-credential.js";
import { registerHealthRoutes, RuntimeReadiness } from "./health.js";
import { CheckpointRepository } from "./persistence/checkpoint-repository.js";
import { CommandRepository } from "./persistence/command-repository.js";
import { PresenceRepository } from "./persistence/presence-repository.js";
import { RoomLeaseRepository } from "./persistence/room-lease.js";
import { createGameRoomClass } from "./rooms/game-room.js";

interface GameServerRuntime {
  readonly gameServer: ColyseusServer;
  readonly httpServer: HttpServer;
  readonly internalApiClient: InternalApiClient;
  listen(): Promise<void>;
  shutdown(): Promise<void>;
}

interface ShutdownGameServer {
  gracefullyShutdown(exit?: boolean): Promise<unknown>;
}

interface ShutdownPool {
  end(): Promise<unknown>;
}

export async function shutdownRuntime(gameServer: ShutdownGameServer, pool: ShutdownPool): Promise<void> {
  let shutdownError: unknown;
  try {
    await gameServer.gracefullyShutdown(false);
  } catch (error) {
    shutdownError = error;
  }
  try {
    await pool.end();
  } catch (error) {
    if (shutdownError === undefined) shutdownError = error;
  }
  if (shutdownError !== undefined) throw shutdownError;
}

export async function createGameServerRuntime(config: GameServerConfig): Promise<GameServerRuntime> {
  const logger = pino({
    name: "pootown-game-server",
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "ticket", "*.ticket", "*.ticketHash"],
      censor: "[REDACTED]",
    },
  });
  const app = express();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const credentialProvider = await Es256ServiceCredentialProvider.create({
    audience: config.internalServiceAudience,
    issuer: config.internalServiceIssuer,
    privateKeyPem: config.internalServicePrivateKey,
    serviceId: config.internalServiceId,
  });
  const internalApiClient = new InternalApiClient({
    baseUrl: config.apiBaseUrl,
    credentialProvider,
  });
  const leases = new RoomLeaseRepository(pool, config.instanceId, config.leaseDurationMs);
  const checkpoints = new CheckpointRepository(pool, leases);
  const commands = new CommandRepository(pool, leases);
  const presence = new PresenceRepository(pool, leases);
  const readiness = new RuntimeReadiness();
  let shutdownPromise: Promise<void> | undefined;
  registerHealthRoutes(app, pool, readiness);
  const httpServer = createServer(app);
  const allowedOrigins = new Set(config.origins);
  const transport = new WebSocketTransport({
    server: httpServer,
    verifyClient: (information, next) => {
      const allowed = information.origin !== undefined && allowedOrigins.has(information.origin);
      next(allowed, allowed ? undefined : 403, allowed ? undefined : "Origin is not allowed");
    },
  });
  const gameServer = new ColyseusServer({ transport });
  gameServer.define("game", createGameRoomClass({
    api: internalApiClient,
    checkpoints,
    commands,
    leaseRenewMs: config.leaseRenewMs,
    leases,
    onLeaseLost: (error) => {
      readiness.markLeaseLost();
      logger.error({ errorType: error instanceof Error ? error.name : "unknown" }, "room lease ownership lost");
    },
    presence,
  })).filterBy(["gameId"]);

  return {
    gameServer,
    httpServer,
    internalApiClient,
    async listen() {
      await gameServer.listen(config.port);
      readiness.markListening();
      logger.info({ port: config.port, instanceId: config.instanceId }, "game server listening");
    },
    shutdown() {
      if (shutdownPromise !== undefined) return shutdownPromise;
      readiness.markStopping();
      shutdownPromise = (async () => {
        await shutdownRuntime(gameServer, pool);
        logger.info({ instanceId: config.instanceId }, "game server stopped");
      })();
      return shutdownPromise;
    },
  };
}

async function main(): Promise<void> {
  const config = parseGameServerEnvironment(process.env);
  const runtime = await createGameServerRuntime(config);
  const shutdown = () => {
    void runtime.shutdown().catch((error: unknown) => {
      process.stderr.write(`game server shutdown failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await runtime.listen();
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`game server startup failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
