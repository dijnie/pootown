import {
  LeaderboardResponseSchema,
  type LeaderboardResponse,
} from "@pootown/game-contracts";

import { createApiClient, type ApiClient } from "./api-client";

export type TopPlayerItem = LeaderboardResponse["data"]["data"][number];
export type LeaderboardPagination = LeaderboardResponse["data"]["pagination"];

export function createLeaderboardApi(client: ApiClient) {
  return {
    topPlayers(options: { page?: number; limit?: number } = {}): Promise<LeaderboardResponse> {
      return client.get("/v1/leaderboard/top-players", options, LeaderboardResponseSchema);
    },
  };
}

const leaderboardApi = createLeaderboardApi(createApiClient({ baseUrl: "/api" }));

export function fetchTopPlayers(options: {
  page?: number;
  limit?: number;
} = {}): Promise<LeaderboardResponse> {
  return leaderboardApi.topPlayers(options);
}
