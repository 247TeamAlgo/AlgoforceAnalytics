// FILE: app/analytics/RecoveryTimeCard.tsx
"use client";

import * as React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import type { MetricsPayload } from "./types";

type StartMode = "current-dd" | "fresh-peak";
type DailyRow = MetricsPayload["daily_return_last_n_days"]["daily_rows"][number];
type Pt = { bucket: string; medianDays: number; p90Days: number };

const chartConfig: ChartConfig = {
  medianDays: { label: "Median", color: "var(--chart-1)" },
  p90Days: { label: "P90", color: "var(--chart-3)" },
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function getDailyReturns(metrics: MetricsPayload): number[] {
  const rows: DailyRow[] = metrics.daily_return_last_n_days?.daily_rows ?? [];
  return rows
    .map((r) => (isFiniteNumber(r.daily_return_pct) ? r.daily_return_pct / 100 : null))
    .filter((v): v is number => v !== null);
}
function stationaryBootstrapIndices(T: number, p: number): Uint32Array {
  const idx = new Uint32Array(T);
  let i = 0;
  let start = Math.floor(Math.random() * T);
  while (i < T) {
    idx[i++] = start as number;
    if (Math.random() < 0.8) start = (start + 1) % T;
    else start = Math.floor(Math.random() * T);
  }
  return idx;
}
function quantiles(xs: number[], ps: number[]): number[] {
  const a = [...xs].sort((x, y) => x - y);
  return ps.map((p) => {
    const pos = (a.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (base + 1 >= a.length) return a[base];
    return a[base] + rest * (a[base + 1] - a[base]);
  });
}

function simulateETR(
  daily: number[],
  startMode: StartMode,
  startDdLevels: number[], // e.g., [0.1, 0.2, 0.3] for 10/20/30% DD
  paths: number,
  maxDays: number
): Pt[] {
  const T = daily.length;
  if (T === 0) return startDdLevels.map((dd) => ({ bucket: `${Math.round(dd * 100)}%`, medianDays: 0, p90Days: 0 }));

  const out: Pt[] = [];
  for (const dd of startDdLevels) {
    const days: number[] = [];
    for (let b = 0; b < paths; b += 1) {
      let peak = 1;
      let equity = startMode === "current-dd" ? 1 - dd : 1; // start below peak or at peak
      let d = 0;
      while (d < maxDays && equity < peak) {
        const idx = stationaryBootstrapIndices(T, 0.2);
        const r = daily[idx[Math.floor(Math.random() * T)]];
        equity *= 1 + r;
        if (equity > peak) peak = equity;
        d += 1;
      }
      days.push(equity >= peak ? d : maxDays); // cap if not recovered
    }
    const [med, p90] = quantiles(days, [0.5, 0.9]);
    out.push({ bucket: `${Math.round(dd * 100)}%`, medianDays: med, p90Days: p90 });
  }
  return out;
}

export default function RecoveryTimeCard({
  metrics, paths = 1000, startModeDefault = "current-dd",
}: {
  metrics: MetricsPayload;
  paths?: number;
  startModeDefault?: StartMode;
}) {
  const [mode, setMode] = React.useState<StartMode>(startModeDefault);
  const daily = React.useMemo(() => getDailyReturns(metrics), [metrics]);

  // DD buckets to show ETR for
  const dds = [0.1, 0.2, 0.3, 0.4]; // 10%..40%
  const series = React.useMemo(() => simulateETR(daily, mode, dds, paths, 365), [daily, mode, paths]);

  if (daily.length === 0) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Expected Time to Recovery</CardTitle>
            <CardDescription className="mt-0.5">No data in this range.</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle className="leading-tight">Expected Time to Recovery</CardTitle>
            <CardDescription className="mt-0.5">
              Bootstrap ETR by drawdown bucket • Mode: {mode === "current-dd" ? "Current-DD Start" : "Fresh Peak"}
            </CardDescription>
          </div>
          <div className="px-6 pb-3 sm:py-3">
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as StartMode)} className="h-9 rounded-full border bg-muted/40 p-0 shadow-sm overflow-hidden">
              <ToggleGroupItem value="current-dd" className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background">Current-DD</ToggleGroupItem>
              <ToggleGroupItem value="fresh-peak" className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background">Fresh-Peak</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
          <LineChart data={series} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="bucket" tickMargin={8} />
            <YAxis width={60} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="medianDays"
                  formatter={(val: unknown, name: unknown) => [`${Number(val).toFixed(0)} days`, ` ${String(name)}`]}
                  labelFormatter={(v) => `DD ${String(v)}`}
                />
              }
            />
            <Line type="monotone" dataKey="medianDays" dot={false} stroke="var(--chart-1)" strokeWidth={2} />
            <Line type="monotone" dataKey="p90Days" dot={false} stroke="var(--chart-3)" strokeWidth={2} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
