import { z } from "zod";

import { normalizeApiOrigin } from "@/services/api-origin";
import { normalizeGameServerEndpoint } from "@/services/game-server-origin";

const configSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().transform(normalizeApiOrigin),
  NEXT_PUBLIC_GAME_SERVER_URL: z.string().transform(normalizeGameServerEndpoint),
  NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS: z
    .preprocess((value) => (value === undefined ? undefined : Number(value)), z.number().optional()),
  NEXT_PUBLIC_LEADERBOARD_POLL_OFFSET_MS: z
    .preprocess((value) => (value === undefined ? undefined : Number(value)), z.number().optional()),
  IS_DEVELOPMENT: z.boolean(),
}).superRefine((configuration, context) => {
  if (!configuration.IS_DEVELOPMENT && !configuration.NEXT_PUBLIC_GAME_SERVER_URL.startsWith("wss://")) {
    context.addIssue({
      code: "custom",
      message: "Production game server endpoint must use WSS",
      path: ["NEXT_PUBLIC_GAME_SERVER_URL"],
    });
  }
});

const runtimeEnvironment = process["env"];
const configProject = configSchema.safeParse({
  NEXT_PUBLIC_API_URL: runtimeEnvironment["NEXT_PUBLIC_API_URL"],
  NEXT_PUBLIC_GAME_SERVER_URL: runtimeEnvironment["NEXT_PUBLIC_GAME_SERVER_URL"],
  NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS: runtimeEnvironment["NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS"],
  NEXT_PUBLIC_LEADERBOARD_POLL_OFFSET_MS: runtimeEnvironment["NEXT_PUBLIC_LEADERBOARD_POLL_OFFSET_MS"],
  IS_DEVELOPMENT: runtimeEnvironment["NODE_ENV"] === "development",
});

if (!configProject.success) {
  console.error(configProject.error.issues);
  throw new Error("Invalid environment variables");
}

const envConfig = configProject.data;

export default envConfig;
