import { z } from "zod";

const canonicalCoin = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
const positiveCanonicalCoin = canonicalCoin.refine((value) => BigInt(value) > 0n, "must be positive");
const privateKey = z.string().min(32).transform((value) => value.replaceAll("\\n", "\n"));

const ApiEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  }, "must use postgres or postgresql protocol"),
  CORS_ORIGINS: z.string().min(1),
  PRIVY_APP_ID: z.string().min(1).max(128),
  PRIVY_VERIFICATION_KEY: privateKey,
  INTERNAL_JWT_ISSUER: z.string().min(1).max(256),
  INTERNAL_JWT_AUDIENCE: z.string().min(1).max(256),
  INTERNAL_JWT_PUBLIC_KEY: privateKey,
  INITIAL_GRANT_COIN: positiveCanonicalCoin.default("1000"),
  RESCUE_BALANCE_COIN: positiveCanonicalCoin.default("100"),
  RESCUE_WINDOW_MS: z.coerce.number().int().positive().default(86_400_000),
  REALTIME_TICKET_TTL_MS: z.coerce.number().int().min(10_000).max(300_000).default(60_000),
}).superRefine((environment, context) => {
  if (BigInt(environment.INITIAL_GRANT_COIN) < BigInt(environment.RESCUE_BALANCE_COIN)) {
    context.addIssue({
      code: "custom",
      path: ["INITIAL_GRANT_COIN"],
      message: "must be at least the rescue balance",
    });
  }
});

export type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;

export function parseApiEnvironment(environment: Record<string, unknown>): ApiEnvironment {
  if (environment.NEXT_PUBLIC_AUTH_PRIVATE_KEY_PRIVY !== undefined) {
    throw new Error("Invalid API environment: public private-key configuration is forbidden");
  }
  const result = ApiEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid API environment: ${z.prettifyError(result.error)}`);
  }
  const origins = result.data.CORS_ORIGINS.split(",").map((origin) => origin.trim());
  if (origins.some((origin) => !validCorsOrigin(origin))) {
    throw new Error("Invalid API environment: CORS_ORIGINS must be an explicit URL allowlist");
  }
  return result.data;
}

function validCorsOrigin(value: string): boolean {
  if (value === "*" || !URL.canParse(value)) return false;
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  return (
    (url.protocol === "https:" || localHttp) &&
    url.username === "" &&
    url.password === "" &&
    (url.pathname === "" || url.pathname === "/") &&
    url.search === "" &&
    url.hash === ""
  );
}

export function corsOrigins(config: ApiEnvironment): ReadonlySet<string> {
  return new Set(config.CORS_ORIGINS.split(",").map((origin) => new URL(origin.trim()).origin));
}
