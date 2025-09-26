// app/analytics/perf/page.tsx
"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DashboardData, Freq } from "./(components)/PerformanceDistributionBlock/types";
import { MetricsSummaryCard } from "./(components)/PerformanceDistributionBlock/cards/MetricsSummaryCard";
import { EquityCurveCard } from "./(components)/PerformanceDistributionBlock/cards/EquityCurveCard";
import { DrawdownSeriesCard } from "./(components)/PerformanceDistributionBlock/cards/DrawdownSeriesCard";
import { PnLBreakdownCard } from "./(components)/PerformanceDistributionBlock/cards/PnLBreakdownCard";
import { RollingRiskTableCard } from "./(components)/PerformanceDistributionBlock/cards/RollingRiskTableCard";
import { LosingStreakMonitorCard } from "./(components)/PerformanceDistributionBlock/cards/LosingStreakMonitorCard";
import { AvgReturnSummaryCard } from "./(components)/PerformanceDistributionBlock/cards/AvgReturnSummaryCard";
import { DrawdownExceedanceCard } from "./(components)/PerformanceDistributionBlock/cards/DrawdownExceedanceCard";
import { RunLengthProbabilityCard } from "./(components)/PerformanceDistributionBlock/cards/RunLengthProbabilityCard";
import { usePerformanceDistribution } from "./(components)/PerformanceDistributionBlock/hooks/usePerformanceDistribution";

type AccountsResponse =
  | { accounts: string[] }
  | { error: string };

export default function PerfPage(): React.ReactNode {
  const [allAccounts, setAllAccounts] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [freq, setFreq] = React.useState<Freq>("M");

  // load account names once
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/sqlytics", { cache: "no-store" });
      const json: AccountsResponse = await res.json();
      if (!alive) return;
      if ("accounts" in json) {
        setAllAccounts(json.accounts);
        setSelected(json.accounts); // default: select all
      }
    })();
    return () => { alive = false; };
  }, []);

  const { data, error, loading } = usePerformanceDistribution({
    accounts: selected,
    freq,
    sims: 10_000,
    apiPath: "/api/sqlytics",
  });

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      {/* Controls */}
      <Card className="rounded-2xl border">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={freq} onValueChange={(v) => setFreq(v as Freq)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Frequency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Monthly</SelectItem>
                <SelectItem value="W">Weekly</SelectItem>
                <SelectItem value="D">Daily</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setSelected(allAccounts)}>Select all</Button>
            <Button variant="outline" onClick={() => setSelected([])}>Clear</Button>
          </div>

          {/* very simple multi-select list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-auto border rounded p-3">
            {allAccounts.map((a) => {
              const checked = selected.includes(a);
              return (
                <label key={a} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelected((s) => checked ? s.filter(x => x !== a) : [...s, a])
                    }
                  />
                  {a}
                </label>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground">
            Selected: {selected.length} · Requested freq: {freq}
            {data && data.metrics?.freq && data.metrics.freq !== freq
              ? <> · Using: <span className="font-medium">{data.metrics.freq}</span> (auto-fallback)</>
              : null}
          </div>

          {loading && <div className="text-sm text-muted-foreground">Loading analytics…</div>}
          {error && <div className="text-sm text-destructive">Error: {error}</div>}
        </CardContent>
      </Card>

      {/* Render cards only when we have data */}
      {data ? <AnalyticsGrid data={data} /> : null}
    </div>
  );
}

function AnalyticsGrid({ data }: { data: DashboardData }): React.ReactNode {
  return (
    <>
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
    </>
  );
}
