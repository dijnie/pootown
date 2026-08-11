import { z } from "zod";

const EnvironmentSchema = z.object({
  API_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  GAME_SERVER_INSTANCE_ID: z.string().trim().min(1).max(80),
  GAME_SERVER_ORIGINS: z.string().trim().min(1),
  GAME_SERVER_PORT: z.coerce.number().int().min(1).max(65_535).default(2567),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).max(256),
  INTERNAL_SERVICE_ID: z.string().trim().min(1).max(128).default("game-server"),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).max(256),
  INTERNAL_SERVICE_PRIVATE_KEY: z.string().min(1),
  GAME_SERVER_DISTRIBUTED_PRESENCE: z.literal("false").optional(),
  REDIS_URL: z.string().optional(),
  ROOM_LEASE_DURATION_MS: z.coerce.number().int().min(10_000).max(120_000).default(30_000),
  ROOM_LEASE_RENEW_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
}).passthrough().superRefine((environment, context) => {
  for (const [key, value] of Object.entries(environment)) {
    if (key.startsWith("REDIS_") && typeof value === "string" && value.trim() !== "") {
      context.addIssue({ code: "custom", path: [key], message: "Redis presence is not supported" });
    }
  }
});

const HttpOriginSchema = z.string().url().superRefine((value, context) => {
  const parsed = new URL(value);
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" ||
      parsed.search !== "" || parsed.hash !== "") {
    context.addIssue({ code: "custom", message: "origin must be an HTTP origin without credentials or path" });
  }
}).transform((value) => new URL(value).origin);

export interface GameServerConfig {
  readonly apiBaseUrl: string;
  readonly databaseUrl: string;
  readonly instanceId: string;
  readonly internalServiceAudience: string;
  readonly internalServiceId: string;
  readonly internalServiceIssuer: string;
  readonly internalServicePrivateKey: string;
  readonly leaseDurationMs: number;
  readonly leaseRenewMs: number;
  readonly origins: readonly string[];
  readonly port: number;
}

export function parseGameServerEnvironment(input: NodeJS.ProcessEnv): GameServerConfig {
  const environment = EnvironmentSchema.parse(input);
  const databaseUrl = new URL(environment.DATABASE_URL);
  if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }
  const apiBaseUrl = new URL(environment.API_BASE_URL);
  if ((apiBaseUrl.protocol !== "http:" && apiBaseUrl.protocol !== "https:") ||
      apiBaseUrl.username !== "" || apiBaseUrl.password !== "" || apiBaseUrl.pathname !== "/" ||
      apiBaseUrl.search !== "" || apiBaseUrl.hash !== "") {
    throw new Error("API_BASE_URL must be an HTTP origin without credentials or path");
  }
  if (environment.ROOM_LEASE_RENEW_MS * 2 >= environment.ROOM_LEASE_DURATION_MS) {
    throw new Error("ROOM_LEASE_RENEW_MS must be less than half the lease duration");
  }
  const origins = environment.GAME_SERVER_ORIGINS.split(",").map((origin) => origin.trim());
  const parsedOrigins = z.array(HttpOriginSchema).min(1).max(16).parse(origins);
  if (new Set(parsedOrigins).size !== parsedOrigins.length) throw new Error("GAME_SERVER_ORIGINS must be unique");
  return {
    apiBaseUrl: apiBaseUrl.origin,
    databaseUrl: environment.DATABASE_URL,
    instanceId: environment.GAME_SERVER_INSTANCE_ID,
    internalServiceAudience: environment.INTERNAL_SERVICE_AUDIENCE,
    internalServiceId: environment.INTERNAL_SERVICE_ID,
    internalServiceIssuer: environment.INTERNAL_SERVICE_ISSUER,
    internalServicePrivateKey: environment.INTERNAL_SERVICE_PRIVATE_KEY,
    leaseDurationMs: environment.ROOM_LEASE_DURATION_MS,
    leaseRenewMs: environment.ROOM_LEASE_RENEW_MS,
    origins: parsedOrigins,
    port: environment.GAME_SERVER_PORT,
  };
}
