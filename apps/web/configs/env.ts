import { z } from "zod";

import { normalizeApiOrigin } from "@/services/api-origin";
import { normalizeGameServerEndpoint } from "@/services/game-server-origin";

const configSchema = z
  .object({
    NEXT_PUBLIC_API_URL: z.string().transform(normalizeApiOrigin),
    NEXT_PUBLIC_GAME_SERVER_URL: z
      .string()
      .transform(normalizeGameServerEndpoint),
    NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS: z.preprocess(
      (value) => (value === undefined ? undefined : Number(value)),
      z.number().optional()
    ),
    NEXT_PUBLIC_LEADERBOARD_POLL_OFFSET_MS: z.preprocess(
      (value) => (value === undefined ? undefined : Number(value)),
      z.number().optional()
    ),
    IS_DEVELOPMENT: z.boolean(),
  })
  .superRefine((configuration, context) => {
    const gameServerUrl = new URL(configuration.NEXT_PUBLIC_GAME_SERVER_URL);
    const localWebSocket =
      gameServerUrl.protocol === "ws:" &&
      (gameServerUrl.hostname === "127.0.0.1" ||
        gameServerUrl.hostname === "localhost");
    if (
      !configuration.IS_DEVELOPMENT &&
      !configuration.NEXT_PUBLIC_GAME_SERVER_URL.startsWith("wss://") &&
      !localWebSocket
    ) {
      context.addIssue({
        code: "custom",
        message: "Production game server endpoint must use WSS",
        path: ["NEXT_PUBLIC_GAME_SERVER_URL"],
      });
    }
  });

const configProject = configSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_GAME_SERVER_URL: process.env.NEXT_PUBLIC_GAME_SERVER_URL,
  NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS:
    process.env.NEXT_PUBLIC_LEADERBOARD_POLL_INTERVAL_MS,
  NEXT_PUBLIC_LEADERBOARD_POLL_OFFSET_MS:
    process.env.NEXT_PUBLIC_LEADERBOARD_POLL_OFFSET_MS,
  IS_DEVELOPMENT: process.env.NODE_ENV === "development",
});

if (!configProject.success) {
  console.error(configProject.error.issues);
  throw new Error("Invalid environment variables");
}

const envConfig = configProject.data;

export default envConfig;
