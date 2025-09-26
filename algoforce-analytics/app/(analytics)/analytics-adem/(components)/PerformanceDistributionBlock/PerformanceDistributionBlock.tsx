"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";

import { MetricsSummaryCard } from "./cards/MetricsSummaryCard";
import { EquityCurveCard } from "./cards/EquityCurveCard";
import { DrawdownSeriesCard } from "./cards/DrawdownSeriesCard";
import { RollingRiskTableCard } from "./cards/RollingRiskTableCard";
import { PnLBreakdownCard } from "./cards/PnLBreakdownCard";
import { AvgReturnSummaryCard } from "./cards/AvgReturnSummaryCard";
import { DrawdownExceedanceCard } from "./cards/DrawdownExceedanceCard";
import { RunLengthProbabilityCard } from "./cards/RunLengthProbabilityCard";
import { LosingStreakMonitorCard } from "./cards/LosingStreakMonitorCard";
import type { DashboardData } from "@/app/analytics/(components)/PerformanceDistributionBlock/types";

// -------------------------
// Types
// -------------------------
type AnalyticsResponse = DashboardData | { error: string };

// -------------------------
// Component
// -------------------------
export function PerformanceDistributionDashboard({
  accounts,
  freq = "M",
}: {
  accounts: string[];
  freq?: "D" | "W" | "M";
}): React.ReactNode {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sqlytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            accounts,
            freq,
            sims: 10_000,
          }),
        });

        const json: AnalyticsResponse = await res.json();

        if (!res.ok || "error" in json) {
          throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
        }

        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accounts, freq]);

  // -------------------------
  // Render states
  // -------------------------
  if (loading) {
    return (
      <Card className="rounded-2xl border">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading data and computing performance…
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="rounded-2xl border">
        <CardContent className="p-6 text-sm text-destructive">
          Failed to load: {error ?? "Unknown error"}
        </CardContent>
      </Card>
    );
  }

  // -------------------------
  // Dashboard layout
  // -------------------------
  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      <MetricsSummaryCard metrics={data.metrics} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EquityCurveCard data={data.equity} />
        <DrawdownSeriesCard data={data.drawdown} />
      </div>

      <PnLBreakdownCard data={data.pnlBreakdown} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RollingRiskTableCard data={data.rolling} />
        <LosingStreakMonitorCard streaks={data.streaks} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DrawdownExceedanceCard data={data.drawdownExceed} />
        <RunLengthProbabilityCard rows={data.runlen} />
      </div>

      <AvgReturnSummaryCard rows={data.avgSummary} />
    </div>
  );
}
