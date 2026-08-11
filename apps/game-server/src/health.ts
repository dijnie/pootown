import type { Express } from "express";
import type { Pool } from "pg";

export interface ReadinessState {
  isAcceptingConnections(): boolean;
}

export function registerHealthRoutes(app: Express, pool: Pool, readiness: ReadinessState): void {
  app.get("/health/live", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  app.get("/health/ready", async (_request, response) => {
    if (!readiness.isAcceptingConnections()) {
      response.status(503).json({ status: "not_ready" });
      return;
    }
    try {
      await pool.query("SELECT 1");
      response.status(200).json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "database_unavailable" });
    }
  });
}
