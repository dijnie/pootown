import type { Express } from "express";

export type RealtimeMetricName =
  | "all_offline_windows_started_total"
  | "lease_losses_total"
  | "player_commands_committed_total"
  | "player_command_handler_rejections_total"
  | "player_commands_replayed_total"
  | "room_finalization_failures_total"
  | "rooms_created_total"
  | "settlement_retries_total"
  | "timer_commands_accepted_total"
  | "timer_commands_rejected_total";

const metricNames: readonly RealtimeMetricName[] = [
  "all_offline_windows_started_total",
  "lease_losses_total",
  "player_commands_committed_total",
  "player_command_handler_rejections_total",
  "player_commands_replayed_total",
  "room_finalization_failures_total",
  "rooms_created_total",
  "settlement_retries_total",
  "timer_commands_accepted_total",
  "timer_commands_rejected_total",
];

export interface RealtimeMetrics {
  increment(name: RealtimeMetricName): void;
}

export type OperationalErrorType = "error" | "unknown";

export function operationalErrorType(error: unknown): OperationalErrorType {
  return error instanceof Error ? "error" : "unknown";
}

export class RuntimeMetrics implements RealtimeMetrics {
  private readonly counters = new Map<RealtimeMetricName, bigint>(metricNames.map((name) => [name, 0n]));

  public increment(name: RealtimeMetricName): void {
    this.counters.set(name, (this.counters.get(name) ?? 0n) + 1n);
  }

  public render(): string {
    return `${metricNames.map((name) => {
      const wireName = `pootown_realtime_${name}`;
      return `# TYPE ${wireName} counter\n${wireName} ${this.counters.get(name) ?? 0n}`;
    }).join("\n")}\n`;
  }
}

export function registerMetricsRoute(app: Express, metrics: RuntimeMetrics): void {
  app.get("/metrics", (_request, response) => {
    response.type("text/plain; version=0.0.4; charset=utf-8").status(200).send(metrics.render());
  });
}
