"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeaderboardTimeframe, LeaderboardMetric } from "./leaderboard";

interface LeaderboardFiltersProps {
  timeframe: LeaderboardTimeframe;
  metric: LeaderboardMetric;
  onTimeframeChange: (timeframe: LeaderboardTimeframe) => void;
  onMetricChange: (metric: LeaderboardMetric) => void;
}

export function LeaderboardFilters({
  timeframe,
  metric,
  onTimeframeChange,
  onMetricChange,
}: LeaderboardFiltersProps) {
  const timeframeOptions = [
    { value: "all" as const, label: "All Time" },
    { value: "month" as const, label: "This Month" },
    { value: "week" as const, label: "This Week" },
  ];

  const metricOptions = [
    { value: "wins" as const, label: "Most Wins" },
    { value: "earnings" as const, label: "Highest Earnings" },
    { value: "games_played" as const, label: "Most Active" },
  ];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Timeframe Filter */}
          <div className="flex-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Time Period</h3>
            <div className="flex gap-2">
              {timeframeOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={timeframe === option.value ? "default" : "neutral"}
                  size="sm"
                  onClick={() => onTimeframeChange(option.value)}
                  className="flex-1 sm:flex-none"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Metric Filter */}
          <div className="flex-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Ranking By</h3>
            <div className="flex gap-2">
              {metricOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={metric === option.value ? "default" : "neutral"}
                  size="sm"
                  onClick={() => onMetricChange(option.value)}
                  className="flex-1 sm:flex-none"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}