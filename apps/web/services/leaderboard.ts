import { z } from "zod";
import { createApiClient } from "./api-client";

// Query params
export type TimeRange = "day" | "week" | "month" | "all";
export type RankingBy = "mostWins" | "highestEarnings" | "mostActive" | "combined";

// API response schemas
const PaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

const TopPlayerItemSchema = z.object({
  playerId: z.string(),
  walletAddress: z.string(),
  playerName: z.string().optional(),
  totalGamesPlayed: z.number(),
  totalGamesWon: z.number(),
  totalGamesLost: z.number(),
  winRate: z.number(),
  averageCashBalance: z.number(),
  highestCashBalance: z.number(),
  totalPropertiesOwned: z.number(),
  averageGameDuration: z.number().optional(),
  lastActiveDate: z.string(),
  leaderboardScore: z.number().optional(),
  totalEarnings: z.number(),
  unclaimedEarnings: z.number(),
  rank: z.number().optional(),
});

const TopPlayersResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    data: z.array(TopPlayerItemSchema),
    pagination: PaginationSchema,
  }),
  requestId: z.string(),
  timestamp: z.string(),
});

const GameAnalyticsSchema = z.object({
  totalGames: z.number(),
  activeGames: z.number(),
  completedGames: z.number(),
  totalPlayers: z.number(),
  activePlayers: z.number(),
  averagePlayersPerGame: z.number(),
  averageGameDuration: z.number().optional(),
  mostPopularTimeSlot: z.string().optional(),
  topProperties: z.array(
    z.object({
      position: z.number(),
      propertyName: z.string().optional(),
      timesPurchased: z.number(),
      averagePrice: z.number(),
      totalRevenue: z.number(),
    })
  ),
  totalEarnings: z.number(),
  combinedPlayerEarnings: z.number(),
  unclaimedPlayerEarnings: z.number(),
});

const AnalyticsResponseSchema = z.object({
  success: z.boolean(),
  data: GameAnalyticsSchema,
  requestId: z.string(),
  timestamp: z.string(),
});

export type TopPlayerItem = z.infer<typeof TopPlayerItemSchema>;
export type TopPlayersResponse = z.infer<typeof TopPlayersResponseSchema>;
export type GameAnalytics = z.infer<typeof GameAnalyticsSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;

// Create leaderboard API client
const origin = (process.env.NEXT_PUBLIC_INDEXER_API_URL || "").replace(/\/$/, "");
const baseUrl = origin ? `${origin}/api/leaderboard` : "/api/leaderboard";

const leaderboardApi = createApiClient({
  baseUrl,
});

// Fetch: Top Players
export async function fetchTopPlayers(options: {
  timeRange?: TimeRange;
  rankingBy?: RankingBy;
  minGames?: number;
  page?: number;
  limit?: number;
} = {}): Promise<TopPlayersResponse> {
  return leaderboardApi.get("/top-players", options, TopPlayersResponseSchema);
}

// Fetch: Analytics
export async function fetchAnalytics(options: { timeRange?: TimeRange } = {}): Promise<GameAnalytics> {
  const response = await leaderboardApi.get("/analytics", options, AnalyticsResponseSchema);
  return response.data;
}