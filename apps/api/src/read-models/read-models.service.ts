import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  CONTRACT_VERSION,
  LeaderboardResponseSchema,
  SessionHistoryResponseSchema,
  type LeaderboardResponse,
  type SessionHistoryResponse,
} from "@pootown/game-contracts";
import type { Pool } from "pg";

import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { DATABASE_POOL } from "../database/database.constants";
import { EconomyService } from "../economy/economy.service";
import { ApiHttpException } from "../platform/http/api-http.exception";

interface LeaderboardRow {
  readonly rank: string;
  readonly player_id: string;
  readonly display_name: string | null;
  readonly games_played: string;
  readonly games_won: string;
  readonly account_coin_won: string;
  readonly total: string;
}

interface HistoryRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly result: "won" | "lost" | "cancelled" | "aborted";
  readonly account_coin_delta: string;
  readonly finished_at: Date;
}

@Injectable()
export class ReadModelsService {
  public constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly economy: EconomyService,
  ) {}

  public async leaderboard(page: number, limit: number, now = new Date()): Promise<LeaderboardResponse> {
    const offset = (page - 1) * limit;
    const result = await this.pool.query<LeaderboardRow>(
      `
        SELECT ranked.rank::text, ranked.player_id, ranked.display_name,
               ranked.games_played::text, ranked.games_won::text,
               ranked.account_coin_won::text, ranked.total::text
        FROM (
          SELECT player_id, display_name, games_played, games_won, account_coin_won,
                 row_number() OVER (
                   ORDER BY games_won DESC, account_coin_won DESC, games_played ASC, user_id ASC
                 ) AS rank,
                 count(*) OVER () AS total
          FROM readmodel.leaderboard_players
        ) ranked
        ORDER BY ranked.rank
        OFFSET $1 LIMIT $2
      `,
      [offset, limit],
    );
    const total = Number(result.rows[0]?.total ?? (await this.countLeaderboard()));
    return LeaderboardResponseSchema.parse({
      success: true,
      data: {
        data: result.rows.map((row) => ({
          rank: Number(row.rank),
          playerId: row.player_id,
          displayName: row.display_name,
          gamesPlayed: Number(row.games_played),
          gamesWon: Number(row.games_won),
          accountCoinWon: row.account_coin_won,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
      requestId: randomUUID(),
      timestamp: now.getTime(),
    });
  }

  public async history(
    principal: AuthenticatedPrincipal,
    limit: number,
    cursor?: string,
  ): Promise<SessionHistoryResponse> {
    const user = (await this.economy.provisionPrincipal(principal)).user;
    const boundary = cursor === undefined ? undefined : this.decodeHistoryCursor(cursor);
    const result = await this.pool.query<HistoryRow>(
      `
        SELECT id::text, game_session_id, player_id, result,
               account_coin_delta::text, finished_at
        FROM readmodel.session_history
        WHERE user_id = $1
          AND ($2::timestamptz IS NULL OR (finished_at, id) < ($2::timestamptz, $3::bigint))
        ORDER BY finished_at DESC, id DESC
        LIMIT $4
      `,
      [user.userId, boundary?.finishedAt ?? null, boundary?.id ?? "0", limit + 1],
    );
    const page = result.rows.slice(0, limit);
    const last = page.at(-1);
    return SessionHistoryResponseSchema.parse({
      contractVersion: CONTRACT_VERSION,
      items: page.map((row) => ({
        gameId: row.game_session_id,
        playerId: row.player_id,
        result: row.result,
        accountCoinDelta: row.account_coin_delta,
        finishedAtMs: row.finished_at.getTime(),
      })),
      nextCursor: result.rows.length > limit && last !== undefined
        ? Buffer.from(JSON.stringify({ finishedAt: last.finished_at.toISOString(), id: last.id })).toString("base64url")
        : null,
    });
  }

  private async countLeaderboard(): Promise<number> {
    const result = await this.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM readmodel.leaderboard_players");
    return Number(result.rows[0]?.count ?? "0");
  }

  private decodeHistoryCursor(cursor: string): { readonly finishedAt: string; readonly id: string } {
    try {
      const decoded = Buffer.from(cursor, "base64url");
      if (decoded.toString("base64url") !== cursor) throw new Error();
      const value: unknown = JSON.parse(decoded.toString("utf8"));
      if (typeof value !== "object" || value === null || !("finishedAt" in value) || !("id" in value)) throw new Error();
      const finishedAt = value.finishedAt;
      const id = value.id;
      const date = typeof finishedAt === "string" ? new Date(finishedAt) : null;
      if (
        Object.keys(value).sort().join(",") !== "finishedAt,id" ||
        typeof finishedAt !== "string" ||
        date === null ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString() !== finishedAt ||
        typeof id !== "string" ||
        !/^[1-9][0-9]{0,18}$/.test(id) ||
        BigInt(id) > 9_223_372_036_854_775_807n
      ) throw new Error();
      return { finishedAt, id };
    } catch {
      throw new ApiHttpException("REQUEST_INVALID", 400, "History cursor is invalid");
    }
  }
}
