import type { DatabasePort, QueryFilters, PaginatedResult } from '#infra/db/db.port'
import type { GameState, GameStatus } from '#infra/db/schema'
import { DatabaseError } from './base.service'

const LAMPORTS_PER_SOL = 1_000_000_000
// Round SOL to a fixed number of decimals (default 4)
const roundSol = (value: number, decimals = 4): number =>
  Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
import { buildCacheKey, getJsonCache, setJsonCache } from '#infra/cache/redis-cache'

/**
 * Optimized scoring and calculation utilities
 */
class LeaderboardUtils {
  // Scoring constants for consistent calculations
  static readonly SCORING = {
    ACTIVITY_WEIGHT: 0.6,
    SUCCESS_WEIGHT: 0.4,
    PRECISION: 100 // For rounding to 2 decimal places
  } as const

  /**
   * Calculate optimized leaderboard score
   */
  static calculateScore(gamesPlayed: number, gamesWon: number): number {
    const activityScore = gamesPlayed * this.SCORING.ACTIVITY_WEIGHT
    const successScore = gamesWon * this.SCORING.SUCCESS_WEIGHT
    return Math.round((activityScore + successScore) * this.SCORING.PRECISION) / this.SCORING.PRECISION
  }

  /**
   * Calculate win rate with precision
   */
  static calculateWinRate(gamesWon: number, totalGames: number): number {
    if (totalGames === 0) return 0
    return Math.round((gamesWon / totalGames) * 100 * this.SCORING.PRECISION) / this.SCORING.PRECISION
  }

  /**
   * Round cash values consistently
   */
  static roundCash(amount: number): number {
    return Math.round(amount * this.SCORING.PRECISION) / this.SCORING.PRECISION
  }

  /**
   * Check if player won based on dynamic cash threshold
   */
  static isWin(cashBalance: number, threshold: number): boolean {
    return cashBalance > threshold
  }
}

/**
 * Player statistics aggregation
 */
export interface PlayerStats {
  readonly playerId: string
  readonly walletAddress: string
  readonly playerName?: string
  readonly totalGamesPlayed: number
  readonly totalGamesWon: number
  readonly totalGamesLost: number
  readonly winRate: number
  readonly averageCashBalance: number
  readonly highestCashBalance: number
  readonly totalPropertiesOwned: number
  readonly averageGameDuration?: number
  readonly lastActiveDate: string
  readonly rank?: number
}

/**
 * Game statistics for analytics
 */
export interface GameAnalytics {
  readonly totalGames: number
  readonly activeGames: number
  readonly completedGames: number
  readonly totalPlayers: number
  readonly activePlayers: number
  readonly averagePlayersPerGame: number
  readonly averageGameDuration?: number
  readonly mostPopularTimeSlot?: string
  readonly topProperties: PropertyStats[]
  // Earnings analytics
  readonly totalPrizePool: number
  readonly totalEarnings: number
  readonly combinedPlayerEarnings: number
  readonly unclaimedPlayerEarnings: number
}

/**
 * Property statistics
 */
export interface PropertyStats {
  readonly position: number
  readonly propertyName?: string
  readonly timesPurchased: number
  readonly averagePrice: number
  readonly totalRevenue: number
}

/**
 * Leaderboard query filters
 */
export interface LeaderboardFilters extends QueryFilters {
  readonly timeRange?: 'day' | 'week' | 'month' | 'all'
  readonly minGames?: number
  readonly gameStatus?: GameStatus
  readonly rankingBy?: 'mostWins' | 'highestEarnings' | 'mostActive' | 'combined'
}

/**
 * Leaderboard service implementation
 * Provides comprehensive statistics and rankings
 */
export class LeaderboardService {
  constructor(private readonly db: DatabasePort) {}

  /**
   * @deprecated Use getTopPlayersLeaderboard() instead - this method is redundant
   * Get top players by win rate
   */
  async getTopPlayersByWinRate(
    filters: LeaderboardFilters = {},
    pagination = { limit: 10, page: 1 }
  ): Promise<PaginatedResult<PlayerStats>> {
    try {
      // Get dynamic query defaults from database analysis
      const queryDefaults = await this.getQueryDefaults()

      // Use dynamic limits
      const queryLimit = queryDefaults.maxQueryLimit
      const defaultMinGames = queryDefaults.minGamesThreshold

      // Get all player states for analysis
      const playerStates = await this.db.getPlayerStates({}, { limit: queryLimit })

      const playerStatsMap = new Map<
        string,
        {
          playerId: string
          playerName?: string
          gamesPlayed: Set<string>
          gamesWon: number
          totalCash: number
          maxCash: number
          properties: number
          lastActive: Date
        }
      >()

      // Aggregate player data
      for (const player of playerStates.data) {
        const existing = playerStatsMap.get(player.wallet) || {
          playerId: player.wallet,
          gamesPlayed: new Set(),
          gamesWon: 0,
          totalCash: 0,
          maxCash: 0,
          properties: 0,
          lastActive: new Date(player.accountUpdatedAt)
        }

        existing.gamesPlayed.add(player.game)
        existing.totalCash += Number(player.cashBalance)
        existing.maxCash = Math.max(existing.maxCash, Number(player.cashBalance))
        existing.properties += player.propertiesOwned.length

        if (new Date(player.accountUpdatedAt) > existing.lastActive) {
          existing.lastActive = new Date(player.accountUpdatedAt)
        }

        playerStatsMap.set(player.wallet, existing)
      }

      // Convert to PlayerStats and calculate win rates
      const playerStats: PlayerStats[] = Array.from(playerStatsMap.values()).map((data) => {
        const totalGames = data.gamesPlayed.size
        const winRate = totalGames > 0 ? (data.gamesWon / totalGames) * 100 : 0

        return {
          playerId: data.playerId,
          walletAddress: data.playerId, // In our system, playerId is the wallet address
          playerName: data.playerName,
          totalGamesPlayed: totalGames,
          totalGamesWon: data.gamesWon,
          totalGamesLost: totalGames - data.gamesWon,
          winRate,
          averageCashBalance: totalGames > 0 ? data.totalCash / totalGames : 0,
          highestCashBalance: data.maxCash,
          totalPropertiesOwned: data.properties,
          lastActiveDate: data.lastActive.toISOString()
        }
      })

      // Filter by minimum games (use provided filter or database-derived default)
      let filteredStats = playerStats
      const minGamesFilter = filters.minGames || queryDefaults.minGamesThreshold
      if (minGamesFilter > 0) {
        filteredStats = playerStats.filter((p) => p.totalGamesPlayed >= minGamesFilter)
      }

      // Sort strictly by win rate with deterministic tie-breakers
      filteredStats.sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate
        if (b.totalGamesPlayed !== a.totalGamesPlayed) return b.totalGamesPlayed - a.totalGamesPlayed
        return a.walletAddress.localeCompare(b.walletAddress)
      })

      // Add ranks
      filteredStats = filteredStats.map((player, index) => ({
        ...player,
        rank: index + 1
      }))

      // Apply pagination with dynamic defaults
      const pageSize = pagination.limit || queryDefaults.defaultPageSize
      const start = ((pagination.page || 1) - 1) * pageSize
      const end = start + pageSize
      const paginatedData = filteredStats.slice(start, end)

      return {
        data: paginatedData,
        total: filteredStats.length,
        page: pagination.page,
        limit: pagination.limit
      }
    } catch (error) {
      throw new DatabaseError('Failed to get top players by win rate', error as Error)
    }
  }

  /**
   * @deprecated Use getTopPlayersLeaderboard() instead - this method is redundant
   * Get top players by total games played
   */
  async getTopPlayersByGamesPlayed(
    filters: LeaderboardFilters = {},
    pagination = { limit: 10, page: 1 }
  ): Promise<PaginatedResult<PlayerStats>> {
    try {
      const winRateLeaderboard = await this.getTopPlayersByWinRate(filters, { limit: 1000, page: 1 })

      // Sort by games played instead
      const sorted = winRateLeaderboard.data.sort((a, b) => b.totalGamesPlayed - a.totalGamesPlayed)

      // Add new ranks
      const rankedData = sorted.map((player, index) => ({
        ...player,
        rank: index + 1
      }))

      // Apply pagination
      const start = ((pagination.page || 1) - 1) * (pagination.limit || 10)
      const end = start + (pagination.limit || 10)
      const paginatedData = rankedData.slice(start, end)

      return {
        data: paginatedData,
        total: rankedData.length,
        page: pagination.page,
        limit: pagination.limit
      }
    } catch (error) {
      throw new DatabaseError('Failed to get top players by games played', error as Error)
    }
  }

  /**
   * @deprecated Use getTopPlayersLeaderboard() instead - this method is redundant
   * Get top players by cash balance
   */
  async getTopPlayersByCash(
    filters: LeaderboardFilters = {},
    pagination = { limit: 10, page: 1 }
  ): Promise<PaginatedResult<PlayerStats>> {
    try {
      const winRateLeaderboard = await this.getTopPlayersByWinRate(filters, { limit: 1000, page: 1 })

      // Sort by highest cash balance
      const sorted = winRateLeaderboard.data.sort((a, b) => b.highestCashBalance - a.highestCashBalance)

      // Add new ranks
      const rankedData = sorted.map((player, index) => ({
        ...player,
        rank: index + 1
      }))

      // Apply pagination
      const start = ((pagination.page || 1) - 1) * (pagination.limit || 10)
      const end = start + (pagination.limit || 10)
      const paginatedData = rankedData.slice(start, end)

      return {
        data: paginatedData,
        total: rankedData.length,
        page: pagination.page,
        limit: pagination.limit
      }
    } catch (error) {
      throw new DatabaseError('Failed to get top players by cash', error as Error)
    }
  }

  /**
   * Get comprehensive game analytics
   */
  async getGameAnalytics(timeRange: 'day' | 'week' | 'month' | 'all' = 'all'): Promise<GameAnalytics> {
    try {
      let dateFilter = {}
      const now = new Date()

      switch (timeRange) {
        case 'day':
          dateFilter = { createdAfter: now.getTime() - 24 * 60 * 60 * 1000 }
          break
        case 'week':
          dateFilter = { createdAfter: now.getTime() - 7 * 24 * 60 * 60 * 1000 }
          break
        case 'month':
          dateFilter = { createdAfter: now.getTime() - 30 * 24 * 60 * 60 * 1000 }
          break
        default:
          // No filter for 'all'
          break
      }

      const [games, players] = await Promise.all([
        this.db.getGameStates(dateFilter, { limit: 10000 }),
        this.db.getPlayerStates({}, { limit: 10000 })
      ])

      const activeGames = games.data.filter(
        (g) => g.gameStatus === 'InProgress' || g.gameStatus === 'WaitingForPlayers'
      ).length
      const completedGames = games.data.filter((g) => g.gameStatus === 'Finished').length

      // Get unique players
      const uniquePlayers = new Set(players.data.map((p) => p.wallet))

      // Calculate averages
      const totalPlayersInGames = games.data.reduce((sum, game) => sum + game.currentPlayers, 0)
      const averagePlayersPerGame = games.data.length > 0 ? totalPlayersInGames / games.data.length : 0

      // Compute average game duration (minutes) for finished games
      const finishedDurationsMin = games.data
        .filter((g) => g.gameStatus === 'Finished' && g.startedAt != null && g.endedAt != null)
        .map((g) => {
          const start = Number(g.startedAt as number)
          const end = Number(g.endedAt as number)
          const delta = end - start
          const durationMs = end < 1e12 && start < 1e12 ? delta * 1000 : delta
          return durationMs / 60000
        })
      const averageGameDuration = finishedDurationsMin.length
        ? Math.round((finishedDurationsMin.reduce((a, b) => a + b, 0) / finishedDurationsMin.length) * 100) / 100
        : 0

      const totalPrizePoolSol = games.data.reduce((sum, g) => sum + Number(g.totalPrizePool || 0), 0) / LAMPORTS_PER_SOL

      // Earnings: sum of prize pools for finished and claimed games (lamports)
      const claimedPrizeLamports = games.data
        .filter((g) => g.gameStatus === 'Finished' && g.prizeClaimed)
        .reduce((sum, g) => sum + Number(g.totalPrizePool || 0), 0)

      // Combined player earnings now sourced from game_states prize pools for finished, claimed games (SOL)
      const claimedPrizeSol = claimedPrizeLamports / LAMPORTS_PER_SOL
      const combinedPlayerEarnings = claimedPrizeSol

      // Unclaimed prize pools from finished games where winner hasn't claimed yet (lamports -> SOL)
      const unclaimedPrizeSol =
        games.data
          .filter((g) => g.gameStatus === 'Finished' && !g.prizeClaimed)
          .reduce((sum, g) => sum + Number(g.totalPrizePool || 0), 0) / LAMPORTS_PER_SOL

      return {
        totalGames: games.data.length,
        activeGames,
        completedGames,
        totalPlayers: uniquePlayers.size,
        activePlayers: uniquePlayers.size, // Simplified - would need more complex logic
        averagePlayersPerGame: Math.round(averagePlayersPerGame * 100) / 100,
        averageGameDuration,
        topProperties: [], // Would need property purchase data
        totalPrizePool: roundSol(totalPrizePoolSol),
        totalEarnings: roundSol(claimedPrizeSol),
        combinedPlayerEarnings: roundSol(combinedPlayerEarnings),
        unclaimedPlayerEarnings: roundSol(unclaimedPrizeSol)
      }
    } catch (error) {
      throw new DatabaseError('Failed to get game analytics', error as Error)
    }
  }

  /**
   * Get player statistics by player ID
   */
  async getPlayerStats(playerId: string): Promise<PlayerStats | null> {
    try {
      // Get dynamic query limits
      const queryDefaults = await this.getQueryDefaults()
      const playerStates = await this.db.getPlayerStates(
        { wallet: playerId },
        { limit: queryDefaults.playerStatesQueryLimit }
      )

      if (playerStates.data.length === 0) {
        return null
      }

      const gamesPlayed = new Set<string>()
      let totalCash = 0
      let maxCash = 0
      let totalProperties = 0
      let lastActive = new Date(0)

      for (const player of playerStates.data) {
        gamesPlayed.add(player.game)
        totalCash += Number(player.cashBalance)
        maxCash = Math.max(maxCash, Number(player.cashBalance))
        totalProperties += player.propertiesOwned.length

        const updated = new Date(player.accountUpdatedAt)
        if (updated > lastActive) {
          lastActive = updated
        }
      }

      const totalGamesPlayed = gamesPlayed.size
      const averageCash = totalGamesPlayed > 0 ? totalCash / totalGamesPlayed : 0

      return {
        playerId,
        walletAddress: playerId, // playerId is the wallet address in our system
        totalGamesPlayed,
        totalGamesWon: 0, // Would need game outcome data
        totalGamesLost: totalGamesPlayed,
        winRate: 0,
        averageCashBalance: averageCash,
        highestCashBalance: maxCash,
        totalPropertiesOwned: totalProperties,
        lastActiveDate: lastActive.toISOString()
      }
    } catch (error) {
      throw new DatabaseError(`Failed to get player stats for ${playerId}`, error as Error)
    }
  }

  /**
   * Get player statistics by wallet address
   */
  async getPlayerStatsByWallet(walletAddress: string): Promise<PlayerStats | null> {
    try {
      // Use same logic as getPlayerStats since wallet and playerId are the same in our system
      return await this.getPlayerStats(walletAddress)
    } catch (error) {
      throw new DatabaseError(`Failed to get player stats for wallet ${walletAddress}`, error as Error)
    }
  }

  /**
   * Get comprehensive top players leaderboard
   * Ranked by combined score: games played (activity) + games won (success)
   * Perfect for main leaderboard display showing most active and successful players
   */
  async getTopPlayersLeaderboard(
    filters: LeaderboardFilters = {},
    pagination = { limit: 10, page: 1 }
  ): Promise<
    PaginatedResult<PlayerStats & { leaderboardScore: number; totalEarnings: number; unclaimedEarnings: number }>
  > {
    try {
      const page = Math.max(1, pagination.page || 1)
      const limit = Math.min(pagination.limit || 10, 50)
      const offset = (page - 1) * limit

      // Cache lookup
      const cacheKey = buildCacheKey('leaderboard:top-players', { filters, pagination: { page, limit } })
      const cached = (await getJsonCache(cacheKey)) as PaginatedResult<
        PlayerStats & { leaderboardScore: number; totalEarnings: number; unclaimedEarnings: number }
      > | null
      if (cached) return cached

      // Load dynamic defaults
      const queryDefaults = await this.getQueryDefaults()
      const minGames = filters.minGames ?? queryDefaults.minGamesThreshold

      // Prefer SQL aggregation if adapter supports raw queries and is connected
      const adapter: any = this.db as any
      const activityWeight = LeaderboardUtils.SCORING.ACTIVITY_WEIGHT
      const successWeight = LeaderboardUtils.SCORING.SUCCESS_WEIGHT

      // Determine ORDER BY based on rankingBy
      const rankingBy = filters.rankingBy || 'combined'
      const orderByClause =
        rankingBy === 'mostWins'
          ? 'ORDER BY total_games_won DESC, win_rate DESC, total_games_played DESC, wallet ASC'
          : rankingBy === 'highestEarnings'
            ? 'ORDER BY total_earnings DESC, win_rate DESC, total_games_played DESC, wallet ASC'
            : rankingBy === 'mostActive'
              ? 'ORDER BY total_games_played DESC, win_rate DESC, total_games_won DESC, wallet ASC'
              : rankingBy === 'combined'
                ? 'ORDER BY leaderboard_score DESC, win_rate DESC, total_games_played DESC, wallet ASC'
                : 'ORDER BY leaderboard_score DESC, win_rate DESC, total_games_played DESC, wallet ASC'

      // Build time range predicates for player_states and game_states
      let psWhere = ''
      let gsWhere = 'WHERE gs.winner IS NOT NULL'
      let gsDurationTimeFilter = ''
      let daysFilter: number | null = null
      if (filters.timeRange && filters.timeRange !== 'all') {
        const days = filters.timeRange === 'day' ? 1 : filters.timeRange === 'week' ? 7 : 30
        daysFilter = days
        psWhere = `WHERE ps.account_updated_at >= NOW() - INTERVAL '${days} days'`
        gsWhere = `WHERE gs.winner IS NOT NULL AND (CASE WHEN gs.created_at >= 1000000000000 THEN TO_TIMESTAMP(gs.created_at / 1000.0) ELSE TO_TIMESTAMP(gs.created_at) END) >= NOW() - INTERVAL '${days} days'`
        gsDurationTimeFilter = `WHERE (CASE WHEN gs.created_at >= 1000000000000 THEN TO_TIMESTAMP(gs.created_at / 1000.0) ELSE TO_TIMESTAMP(gs.created_at) END) >= NOW() - INTERVAL '${days} days'`
      }

      if (adapter?.rawQuery && adapter?.isConnected?.()) {
        try {
          const result = await adapter.rawQuery(
            `WITH player_stats AS (
              SELECT ps.wallet,
                     COUNT(DISTINCT ps.game) AS total_games_played,
                     /* games_won/lost computed from game_stats below */
                     AVG(ps.cash_balance::numeric) AS avg_cash,
                     MAX(ps.cash_balance::numeric) AS max_cash,
                     MIN(ps.cash_balance::numeric) AS min_cash,
                     SUM(COALESCE(json_array_length(ps.properties_owned), 0)) AS total_properties_owned,
                     MAX(ps.account_updated_at) AS last_active
              FROM player_states ps
              ${psWhere}
              GROUP BY ps.wallet
            ), game_stats AS (
              SELECT gs.winner AS wallet,
                     COUNT(*) AS total_games_won,
                     SUM(CASE WHEN gs.prize_claimed THEN gs.total_prize_pool ELSE 0 END) AS total_earnings,
                     SUM(CASE WHEN gs.prize_claimed = false THEN gs.total_prize_pool ELSE 0 END) AS total_unclaimed_earnings
              FROM game_states gs
              ${gsWhere}
              GROUP BY gs.winner
            ), combined AS (
              SELECT ps.wallet,
                     ps.total_games_played,
                     COALESCE(gs.total_games_won, 0) AS total_games_won,
                     GREATEST(ps.total_games_played - COALESCE(gs.total_games_won, 0), 0) AS total_games_lost,
                     COALESCE(gs.total_earnings, 0) AS total_earnings,
                     COALESCE(gs.total_unclaimed_earnings, 0) AS total_unclaimed_earnings,
                     ps.avg_cash,
                     ps.max_cash,
                     ps.min_cash,
                     ps.total_properties_owned,
                     ps.last_active
              FROM player_stats ps
              LEFT JOIN game_stats gs ON gs.wallet = ps.wallet
            ), with_rate AS (
              SELECT wallet,
                     total_games_played,
                     total_games_won,
                     total_games_lost,
                     total_earnings,
                     total_unclaimed_earnings,
                     ROUND((CASE WHEN total_games_played > 0 THEN (total_games_won::numeric / total_games_played::numeric) * 100 ELSE 0 END)::numeric, 2) AS win_rate,
                     ROUND(avg_cash::numeric, 2) AS avg_cash,
                     ROUND(max_cash::numeric, 2) AS max_cash,
                     ROUND(min_cash::numeric, 2) AS min_cash,
                     total_properties_owned,
                     (SELECT ROUND((AVG(
                        CASE WHEN gs2.started_at IS NOT NULL AND gs2.ended_at IS NOT NULL THEN 
                          CASE WHEN gs2.ended_at < 1000000000000 AND gs2.started_at < 1000000000000 
                            THEN (gs2.ended_at - gs2.started_at) * 1000 
                          ELSE (gs2.ended_at - gs2.started_at) 
                          END 
                        END
                      )::numeric) / 60000, 2) FROM game_states gs2 ${gsDurationTimeFilter}) AS avg_game_duration_min,
                     last_active
              FROM combined
            ), ranked AS (
              SELECT wallet,
                     total_games_played,
                     total_games_won,
                     total_games_lost,
                     total_earnings,
                     total_unclaimed_earnings,
                     win_rate,
                     avg_cash,
                     max_cash,
                     min_cash,
                     total_properties_owned,
                     avg_game_duration_min,
                     last_active,
                     ((total_games_played * ${activityWeight}) + (total_games_won * ${successWeight})) AS leaderboard_score
              FROM with_rate
              WHERE total_games_played >= ${minGames}
            )
            SELECT *
            FROM ranked
            ${orderByClause}
            LIMIT ${limit} OFFSET ${offset};
          `
          )

          const total: number = result.rowCount || result.rows.length
          const data = result.rows.map((row: any, idx: number) => ({
            playerId: row.wallet,
            walletAddress: row.wallet,
            playerName: undefined,
            totalGamesPlayed: Number(row.total_games_played) || 0,
            totalGamesWon: Number(row.total_games_won) || 0,
            totalGamesLost: Number(row.total_games_lost) || 0,
            winRate: Number(row.win_rate) || 0,
            averageCashBalance: Number(row.avg_cash) || 0,
            highestCashBalance: Number(row.max_cash) || 0,
            totalPropertiesOwned: Number(row.total_properties_owned) || 0,
            averageGameDuration: Number(row.avg_game_duration_min) || undefined,
            lastActiveDate: new Date(row.last_active).toISOString(),
            leaderboardScore:
              Math.round(
                ((Number(row.total_games_played) || 0) * activityWeight +
                  (Number(row.total_games_won) || 0) * successWeight) *
                  100
              ) / 100,
            totalEarnings: roundSol((Number(row.total_earnings) || 0) / LAMPORTS_PER_SOL),
            unclaimedEarnings: roundSol((Number(row.total_unclaimed_earnings) || 0) / LAMPORTS_PER_SOL),
            rank: offset + idx + 1
          }))

          const payload = { data, total, page, limit }
          const ttl =
            filters.timeRange === 'day'
              ? 30
              : filters.timeRange === 'week'
                ? 60
                : filters.timeRange === 'month'
                  ? 120
                  : 300
          await setJsonCache(cacheKey, payload, ttl)
          return payload
        } catch (e) {
          console.warn('Raw SQL leaderboard query failed, falling back to in-memory aggregation:', e)
        }
      }

      // Fallback to in-memory aggregation if SQL not available
      const [playerStates, winThreshold, finishedGames] = await Promise.all([
        this.db.getPlayerStates({}, { limit: 2000, sortBy: 'accountUpdatedAt', sortOrder: 'desc' }),
        this.getDynamicWinThreshold(),
        this.db.getGameStates({ gameStatus: 'Finished' }, { limit: 5000 })
      ])

      // Apply timeRange filter for fallback paths
      const filteredPlayerStates = (() => {
        if (!daysFilter) return playerStates.data
        const cutoff = Date.now() - daysFilter * 86400000
        return playerStates.data.filter((ps: any) => {
          const t = new Date(ps.accountUpdatedAt).getTime()
          return Number.isFinite(t) && t >= cutoff
        })
      })()

      const filteredFinishedGames = (() => {
        if (!daysFilter) return finishedGames.data
        const cutoff = Date.now() - daysFilter * 86400000
        return finishedGames.data.filter((gs: any) => {
          const created = Number(gs.createdAt ?? 0)
          const createdMs = created < 1e12 ? created * 1000 : created
          return createdMs >= cutoff
        })
      })()

      const playerStatsMap = new Map<
        string,
        {
          playerId: string
          gamesPlayed: Set<string>
          gamesWon: number
          totalCash: number
          maxCash: number
          properties: number
          lastActive: Date
        }
      >()

      const gameWinTracker = new Map<string, { game: string; maxCash: number; playerId: string }>()

      for (const player of filteredPlayerStates) {
        const playerId = player.wallet
        const cashBalance = Number(player.cashBalance || 0)
        const gameKey = `${playerId}-${player.game}`

        if (!playerStatsMap.has(playerId)) {
          playerStatsMap.set(playerId, {
            playerId,
            gamesPlayed: new Set(),
            gamesWon: 0,
            totalCash: 0,
            maxCash: 0,
            properties: 0,
            lastActive: new Date(0)
          })
        }

        const data = playerStatsMap.get(playerId)!
        data.gamesPlayed.add(player.game)
        data.totalCash += cashBalance
        data.maxCash = Math.max(data.maxCash, cashBalance)
        data.properties += player.propertiesOwned?.length || 0

        const updated = new Date(player.accountUpdatedAt)
        if (updated > data.lastActive) {
          data.lastActive = updated
        }

        if (!gameWinTracker.has(gameKey) || cashBalance > gameWinTracker.get(gameKey)!.maxCash) {
          gameWinTracker.set(gameKey, {
            game: player.game,
            maxCash: cashBalance,
            playerId
          })
        }
      }

      for (const [, gameData] of gameWinTracker) {
        if (LeaderboardUtils.isWin(gameData.maxCash, winThreshold)) {
          const playerData = playerStatsMap.get(gameData.playerId)!
          playerData.gamesWon++
        }
      }

      // Build finished game durations map (minutes), normalizing seconds→ms if needed
      const gameDurations = new Map<string, number>()
      for (const gs of filteredFinishedGames) {
        const start = Number((gs as any).startedAt ?? 0)
        const end = Number((gs as any).endedAt ?? 0)
        const gamePk = (gs as any).pubkey
        if (gamePk && start && end && end > start) {
          const delta = end - start
          const durationMs = end < 1e12 && start < 1e12 ? delta * 1000 : delta
          gameDurations.set(gamePk, durationMs / 60000)
        }
      }

      // Earnings per wallet from finished and claimed games
      const earningsByWallet = new Map<string, number>()
      for (const gs of finishedGames.data) {
        const winner = (gs as any).winner as string | undefined
        const prizeClaimed = Boolean((gs as any).prizeClaimed)
        const prize = Number((gs as any).totalPrizePool || 0)
        if (winner && prizeClaimed) {
          earningsByWallet.set(winner, (earningsByWallet.get(winner) || 0) + prize)
        }
      }

      // Unclaimed earnings per wallet from finished games
      const unclaimedByWallet = new Map<string, number>()
      for (const gs of finishedGames.data) {
        const winner = (gs as any).winner as string | undefined
        const prizeClaimed = Boolean((gs as any).prizeClaimed)
        const prize = Number((gs as any).totalPrizePool || 0)
        if (winner && !prizeClaimed) {
          unclaimedByWallet.set(winner, (unclaimedByWallet.get(winner) || 0) + prize)
        }
      }

      const playerStats: Array<
        PlayerStats & { leaderboardScore: number; totalEarnings: number; unclaimedEarnings: number }
      > = Array.from(playerStatsMap.values()).map((data) => {
        const totalGames = data.gamesPlayed.size

        const validatedWins = Math.min(data.gamesWon, totalGames)
        const validatedLost = Math.max(totalGames - validatedWins, 0)

        const winRate = LeaderboardUtils.calculateWinRate(validatedWins, totalGames)
        const avgCash = totalGames > 0 ? LeaderboardUtils.roundCash(data.totalCash / totalGames) : 0
        const leaderboardScore = LeaderboardUtils.calculateScore(totalGames, validatedWins)
        const durations = Array.from(data.gamesPlayed)
          .map((g) => gameDurations.get(g))
          .filter((v): v is number => v !== undefined)
        const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
        const totalEarnings = earningsByWallet.get(data.playerId) || 0
        const unclaimedEarnings = unclaimedByWallet.get(data.playerId) || 0

        return {
          playerId: data.playerId,
          walletAddress: data.playerId,
          playerName: undefined,
          totalGamesPlayed: totalGames,
          totalGamesWon: validatedWins,
          totalGamesLost: validatedLost,
          winRate,
          averageCashBalance: avgCash,
          highestCashBalance: LeaderboardUtils.roundCash(data.maxCash),
          totalPropertiesOwned: data.properties,
          averageGameDuration: avgDuration,
          lastActiveDate: data.lastActive.toISOString(),
          leaderboardScore,
          totalEarnings: roundSol(totalEarnings / LAMPORTS_PER_SOL),
          unclaimedEarnings: roundSol(unclaimedEarnings / LAMPORTS_PER_SOL)
        }
      })

      const minGamesFilter = filters.minGames || queryDefaults.minGamesThreshold
      let filteredStats = playerStats
      if (minGamesFilter > 0) {
        filteredStats = playerStats.filter((p) => p.totalGamesPlayed >= minGamesFilter)
      }

      filteredStats.sort((a, b) => {
        switch (rankingBy) {
          case 'mostWins':
            if (b.totalGamesWon !== a.totalGamesWon) return b.totalGamesWon - a.totalGamesWon
            if (b.winRate !== a.winRate) return b.winRate - a.winRate
            if (b.totalGamesPlayed !== a.totalGamesPlayed) return b.totalGamesPlayed - a.totalGamesPlayed
            return a.walletAddress.localeCompare(b.walletAddress)
          case 'highestEarnings':
            if (b.totalEarnings !== a.totalEarnings) return b.totalEarnings - a.totalEarnings
            if (b.winRate !== a.winRate) return b.winRate - a.winRate
            if (b.totalGamesPlayed !== a.totalGamesPlayed) return b.totalGamesPlayed - a.totalGamesPlayed
            return a.walletAddress.localeCompare(b.walletAddress)
          case 'mostActive':
            if (b.totalGamesPlayed !== a.totalGamesPlayed) return b.totalGamesPlayed - a.totalGamesPlayed
            if (b.winRate !== a.winRate) return b.winRate - a.winRate
            if (b.totalGamesWon !== a.totalGamesWon) return b.totalGamesWon - a.totalGamesWon
            return a.walletAddress.localeCompare(b.walletAddress)
          case 'combined':
            if (b.leaderboardScore !== a.leaderboardScore) return b.leaderboardScore - a.leaderboardScore
            if (b.winRate !== a.winRate) return b.winRate - a.winRate
            if (b.totalGamesPlayed !== a.totalGamesPlayed) return b.totalGamesPlayed - a.totalGamesPlayed
            return a.walletAddress.localeCompare(b.walletAddress)
          default:
            if (b.leaderboardScore !== a.leaderboardScore) return b.leaderboardScore - a.leaderboardScore
            if (b.winRate !== a.winRate) return b.winRate - a.winRate
            if (b.totalGamesPlayed !== a.totalGamesPlayed) return b.totalGamesPlayed - a.totalGamesPlayed
            return a.walletAddress.localeCompare(b.walletAddress)
        }
      })

      const rankedStats = filteredStats.map((player, index) => ({ ...player, rank: index + 1 }))

      const start = Math.max(((page || 1) - 1) * limit, 0)
      const end = Math.min(start + limit, rankedStats.length)
      const paginated = rankedStats.slice(start, end)

      const payload = { data: paginated, total: rankedStats.length, page, limit }
      const ttl =
        filters.timeRange === 'day' ? 30 : filters.timeRange === 'week' ? 60 : filters.timeRange === 'month' ? 120 : 300
      await setJsonCache(cacheKey, payload, ttl)
      return payload
    } catch (error) {
      throw new DatabaseError('Failed to get top players leaderboard', error as Error)
    }
  }

  /**
   * Get recent activity summary
   */
  async getRecentActivity(limit: number = 10): Promise<{
    recentGames: GameState[]
    newPlayers: number
    activePlayersToday: number
  }> {
    try {
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)

      const [recentGames, recentPlayers] = await Promise.all([
        this.db.getGameStates({}, { limit, sortBy: 'accountUpdatedAt', sortOrder: 'desc' }),
        this.db.getPlayerStates(
          {
            // Would need date filter implementation
          },
          { limit: 1000 }
        )
      ])

      const newPlayersToday = recentPlayers.data.filter((p) => new Date(p.accountCreatedAt) > oneDayAgo).length

      const activePlayersToday = recentPlayers.data.filter((p) => new Date(p.accountUpdatedAt) > oneDayAgo).length

      return {
        recentGames: recentGames.data,
        newPlayers: newPlayersToday,
        activePlayersToday
      }
    } catch (error) {
      throw new DatabaseError('Failed to get recent activity', error as Error)
    }
  }

  // Cache for query defaults to avoid repeated database calls
  private queryDefaultsCache: {
    data?: {
      defaultPageSize: number
      maxQueryLimit: number
      minGamesThreshold: number
      playerStatesQueryLimit: number
    }
    timestamp?: number
  } = {}

  // Cache for dynamic win threshold
  private winThresholdCache: {
    threshold?: number
    timestamp?: number
  } = {}

  /**
   * Optimized query defaults with intelligent caching
   */
  private async getQueryDefaults(): Promise<{
    defaultPageSize: number
    maxQueryLimit: number
    minGamesThreshold: number
    playerStatesQueryLimit: number
  }> {
    const CACHE_TTL = 5 * 60 * 1000 // 5 minutes cache
    const now = Date.now()

    // Return cached data if still valid
    if (
      this.queryDefaultsCache.data &&
      this.queryDefaultsCache.timestamp &&
      now - this.queryDefaultsCache.timestamp < CACHE_TTL
    ) {
      return this.queryDefaultsCache.data
    }

    try {
      // Optimized: Parallel queries with minimal data fetch
      const [playerCount, gameCount] = await Promise.all([
        this.db.getPlayerStates({}, { limit: 1 }).then((r) => r.total || 0),
        this.db.getGameStates({}, { limit: 1 }).then((r) => r.total || 0)
      ])

      // Intelligent defaults based on dataset size
      const defaults = {
        defaultPageSize: this.calculateOptimalPageSize(playerCount),
        maxQueryLimit: Math.min(Math.max(playerCount, 500), 2000),
        minGamesThreshold: gameCount > 50 ? 2 : 1,
        playerStatesQueryLimit: Math.min(Math.max(playerCount / 20, 200), 1000)
      }

      // Cache the result
      this.queryDefaultsCache = {
        data: defaults,
        timestamp: now
      }

      return defaults
    } catch {
      // Fallback values for error cases
      const fallback = {
        defaultPageSize: 10,
        maxQueryLimit: 1000,
        minGamesThreshold: 1,
        playerStatesQueryLimit: 200
      }

      this.queryDefaultsCache = {
        data: fallback,
        timestamp: now
      }

      return fallback
    }
  }

  /**
   * Calculate optimal page size based on dataset size
   */
  private calculateOptimalPageSize(playerCount: number): number {
    if (playerCount > 2000) return 25
    if (playerCount > 500) return 20
    if (playerCount > 100) return 15
    return 10
  }

  /**
   * Calculate dynamic win threshold based on actual cash distribution with caching
   */
  private async getDynamicWinThreshold(): Promise<number> {
    const CACHE_TTL = 10 * 60 * 1000 // 10 minutes cache (longer than query defaults)
    const now = Date.now()

    // Return cached threshold if still valid
    if (
      this.winThresholdCache.threshold &&
      this.winThresholdCache.timestamp &&
      now - this.winThresholdCache.timestamp < CACHE_TTL
    ) {
      return this.winThresholdCache.threshold
    }

    try {
      // Get recent player states to analyze cash distribution
      const playerStates = await this.db.getPlayerStates(
        {},
        {
          limit: 500,
          sortBy: 'accountUpdatedAt',
          sortOrder: 'desc'
        }
      )

      if (playerStates.data.length === 0) {
        const fallback = 2000
        this.winThresholdCache = { threshold: fallback, timestamp: now }
        return fallback
      }

      // Calculate cash distribution metrics
      const cashValues = playerStates.data
        .map((p) => Number(p.cashBalance || 0))
        .filter((cash) => cash > 0)
        .sort((a, b) => a - b)

      if (cashValues.length === 0) {
        const fallback = 2000
        this.winThresholdCache = { threshold: fallback, timestamp: now }
        return fallback
      }

      // Use 75th percentile as win threshold (top 25% performers)
      const percentile75Index = Math.floor(cashValues.length * 0.75)
      const dynamicThreshold = cashValues[percentile75Index] || 2000

      // Ensure reasonable bounds (between 1500 and 10000)
      const finalThreshold = Math.max(1500, Math.min(dynamicThreshold, 10000))

      // Cache the result
      this.winThresholdCache = {
        threshold: finalThreshold,
        timestamp: now
      }

      return finalThreshold
    } catch {
      const fallback = 2000
      this.winThresholdCache = { threshold: fallback, timestamp: now }
      return fallback
    }
  }

  /**
   * Get game configuration limits from database analysis
   */
  private async getGameLimits(): Promise<{
    maxPlayersPerGame: number
    popularityThreshold: number
    avgPlayersPerActiveGame: number
  }> {
    try {
      // Analyze existing games to determine realistic limits
      const recentGames = await this.db.getGameStates(
        { gameStatus: 'InProgress' },
        { limit: 100, sortBy: 'createdAt', sortOrder: 'desc' }
      )

      if (recentGames.data.length === 0) {
        // Fallback defaults if no data
        return {
          maxPlayersPerGame: 6,
          popularityThreshold: 2,
          avgPlayersPerActiveGame: 3
        }
      }

      // Calculate actual player counts for active games
      const playerCounts = await Promise.all(
        recentGames.data.slice(0, 20).map(async (game) => {
          try {
            const players = await this.db.getPlayerStates({ game: game.pubkey }, { limit: 20 })
            return new Set(players.data.map((p) => p.wallet)).size
          } catch {
            return 0
          }
        })
      )

      const validCounts = playerCounts.filter((count) => count > 0)

      if (validCounts.length === 0) {
        return {
          maxPlayersPerGame: 6,
          popularityThreshold: 2,
          avgPlayersPerActiveGame: 3
        }
      }

      const avgPlayers = validCounts.reduce((sum, count) => sum + count, 0) / validCounts.length
      const maxObserved = Math.max(...validCounts)

      // Dynamic caps based on database analysis
      const dynamicMaxPlayers = Math.min(maxObserved + 1, Math.max(maxObserved, 6)) // At least 6, max observed+1
      const dynamicPopularityThreshold = Math.max(Math.floor(avgPlayers * 0.6), 2) // 60% of avg, min 2

      return {
        maxPlayersPerGame: dynamicMaxPlayers,
        popularityThreshold: dynamicPopularityThreshold,
        avgPlayersPerActiveGame: Math.round(avgPlayers * 100) / 100
      }
    } catch {
      // Safe fallback
      return {
        maxPlayersPerGame: 6,
        popularityThreshold: 2,
        avgPlayersPerActiveGame: 3
      }
    }
  }

  /**
   * Get top performing games (by player engagement)
   */
  async getTopGames(limit: number = 10): Promise<
    Array<{
      gameId: string
      playerCount: number
      duration?: number
      status: GameStatus
      createdAt: string
      isPopular: boolean
    }>
  > {
    try {
      // Get dynamic game limits from database analysis
      const gameLimits = await this.getGameLimits()

      // Get games with strategic selection
      const games = await this.db.getGameStates(
        {},
        {
          limit: limit * 3, // Get more games to filter properly
          sortBy: 'createdAt',
          sortOrder: 'desc'
        }
      )

      // Calculate actual player count for each game by querying player states
      const gamesWithActualPlayerCount = await Promise.all(
        games.data.map(async (game) => {
          try {
            // Get actual players in this game
            const players = await this.db.getPlayerStates({ game: game.pubkey }, { limit: 100 })

            // Get unique players by wallet address
            const uniqueWallets = new Set(players.data.map((p) => p.wallet))
            const actualPlayerCount = uniqueWallets.size

            // Apply dynamic caps based on database analysis
            const cappedPlayerCount = Math.min(actualPlayerCount, gameLimits.maxPlayersPerGame)

            return {
              gameId: game.pubkey,
              playerCount: cappedPlayerCount,
              status: game.gameStatus,
              createdAt: new Date(Number(game.createdAt)).toISOString(),
              isPopular: cappedPlayerCount >= gameLimits.popularityThreshold,
              rawCurrentPlayers: game.currentPlayers // For debugging
            }
          } catch {
            // Fallback: calculate realistic estimates based on database patterns
            let estimatedPlayers = 1
            const avgPlayers = gameLimits.avgPlayersPerActiveGame

            if (game.gameStatus === 'InProgress') {
              // Estimate based on current players and average patterns
              const ratio = game.currentPlayers > 0 ? Math.min(game.currentPlayers / 50, avgPlayers * 1.5) : avgPlayers
              estimatedPlayers = Math.min(Math.max(2, Math.round(ratio)), gameLimits.maxPlayersPerGame)
            } else if (game.gameStatus === 'WaitingForPlayers') {
              // More conservative for waiting games
              const ratio = game.currentPlayers > 0 ? Math.min(game.currentPlayers / 80, avgPlayers) : avgPlayers * 0.7
              estimatedPlayers = Math.min(Math.max(1, Math.round(ratio)), gameLimits.maxPlayersPerGame - 1)
            }

            return {
              gameId: game.pubkey,
              playerCount: estimatedPlayers,
              status: game.gameStatus,
              createdAt: new Date(Number(game.createdAt)).toISOString(),
              isPopular: estimatedPlayers >= gameLimits.popularityThreshold,
              rawCurrentPlayers: game.currentPlayers
            }
          }
        })
      )

      // Sort by actual player count and return top games
      const sortedGames = gamesWithActualPlayerCount.sort((a, b) => b.playerCount - a.playerCount).slice(0, limit)

      // Remove debug field from response
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return sortedGames.map(({ rawCurrentPlayers, ...game }) => game)
    } catch (error) {
      throw new DatabaseError('Failed to get top games', error as Error)
    }
  }

  /**
   * Get comprehensive dynamic configuration for debugging/monitoring
   */
  async getDynamicConfiguration(): Promise<{
    winThreshold: number
    thresholdSource: string
    thresholdCalculatedAt: string
    gameDefaults: {
      minGames: number
      defaultLimit: number
      maxLimit: number
    }
    databaseStats: {
      recentGamesCount: number
      cashPercentiles: {
        p25: number
        p50: number
        p75: number
        p90: number
      }
    }
  }> {
    // Get dynamic win threshold with database stats
    const winThreshold = await this.getDynamicWinThreshold()

    // Get query defaults
    const queryDefaults = await this.getQueryDefaults()

    // Get recent cash data for percentile analysis
    const recentPlayerStates = await this.db.getPlayerStates(
      {},
      { limit: 1000, sortBy: 'accountUpdatedAt', sortOrder: 'desc' }
    )

    const cashValues = recentPlayerStates.data
      .map((p) => p.cashBalance)
      .filter((cash) => cash > 0)
      .sort((a, b) => a - b)

    const getPercentile = (values: number[], percentile: number): number => {
      const index = Math.ceil((percentile / 100) * values.length) - 1
      return Math.max(0, values[Math.max(0, index)] || 0)
    }

    return {
      winThreshold,
      thresholdSource: '75th percentile of recent games',
      thresholdCalculatedAt: new Date().toISOString(),
      gameDefaults: {
        minGames: queryDefaults.minGamesThreshold,
        defaultLimit: queryDefaults.defaultPageSize,
        maxLimit: queryDefaults.maxQueryLimit
      },
      databaseStats: {
        recentGamesCount: cashValues.length,
        cashPercentiles: {
          p25: getPercentile(cashValues, 25),
          p50: getPercentile(cashValues, 50),
          p75: getPercentile(cashValues, 75),
          p90: getPercentile(cashValues, 90)
        }
      }
    }
  }

  /**
   * Validate leaderboard filters
   */
  validateFilters(filters: LeaderboardFilters): string[] {
    const errors: string[] = []

    if (filters.minGames !== undefined && filters.minGames < 0) {
      errors.push('Minimum games must be non-negative')
    }

    if (filters.timeRange && !['day', 'week', 'month', 'all'].includes(filters.timeRange)) {
      errors.push('Time range must be one of: day, week, month, all')
    }

    if (filters.rankingBy && !['mostWins', 'highestEarnings', 'mostActive', 'combined'].includes(filters.rankingBy)) {
      errors.push('RankingBy must be one of: mostWins, highestEarnings, mostActive, combined')
    }

    return errors
  }
}

// Remove duplicate roundSol at file end}
