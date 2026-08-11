import { Controller, Get, Inject } from "@nestjs/common";
import type { Pool } from "pg";

import { DATABASE_POOL } from "../database/database.constants";
import { Public } from "../auth/public.decorator";
import { ApiHttpException } from "../platform/http/api-http.exception";

@Controller("health")
export class HealthController {
  public constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Public()
  @Get("live")
  public live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  public async ready(): Promise<{ status: "ready"; database: "up" }> {
    try {
      await this.pool.query("SELECT 1");
    } catch {
      throw new ApiHttpException("DATABASE_UNAVAILABLE", 503, "Database is unavailable");
    }
    return { status: "ready", database: "up" };
  }
}
