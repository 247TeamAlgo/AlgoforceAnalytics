// FILE: app/analytics/BootstrapDistCard.tsx
"use client";

import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MetricsPayload } from "./types";

type Horizon = "1D" | "5D" | "20D" | "60D";
type DailyRow =
  MetricsPayload["daily_return_last_n_days"]["daily_rows"][number];
type HistBin = { x: number; y: number };

const chartConfig: ChartConfig = {
  y: { label: "Frequency", color: "var(--chart-1)" },
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// add near top
function fmtPct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

function getDailyReturns(metrics: MetricsPayload): number[] {
  const rows: DailyRow[] = metrics.daily_return_last_n_days?.daily_rows ?? [];
  // returns as decimals (e.g., 0.0042)
  return rows
    .map((r) =>
      isFiniteNumber(r.daily_return_pct) ? r.daily_return_pct / 100 : null
    )
    .filter((v): v is number => v !== null);
}

// Stationary bootstrap indices (Politis–Romano); geometric block length with parameter p.
function stationaryBootstrapIndices(T: number, p: number): Uint32Array {
  const idx = new Uint32Array(T);
  let i = 0;
  let start = Math.floor(Math.random() * T);
  while (i < T) {
    idx[i++] = start as number;
    // continue block with prob (1 - p) or start new block
    if (Math.random() < 1 - p) {
      start = (start + 1) % T;
    } else {
      start = Math.floor(Math.random() * T);
    }
  }
  return idx;
}

function horizonToDays(h: Horizon): number {
  switch (h) {
    case "1D":
      return 1;
    case "5D":
      return 5;
    case "20D":
      return 20; // ~1M
    case "60D":
      return 60; // ~3M
  }
}

function simulateHorizonReturns(
  daily: number[],
  horizon: Horizon,
  nPaths: number,
  p: number
): number[] {
  const T = daily.length;
  const H = horizonToDays(horizon);
  if (T === 0 || H <= 0 || nPaths <= 0) return [];
  const out: number[] = new Array(nPaths);
  for (let b = 0; b < nPaths; b += 1) {
    const idx = stationaryBootstrapIndices(T, p);
    let cum = 1;
    for (let t = 0; t < H; t += 1) {
      const r = daily[idx[Math.floor(Math.random() * T)]];
      cum *= 1 + r;
    }
    out[b] = cum - 1; // horizon return
  }
  return out;
}

function histogram(values: number[], bins: number): HistBin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bw = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let bi = Math.floor((v - min) / bw);
    if (bi >= bins) bi = bins - 1;
    if (bi < 0) bi = 0;
    counts[bi] += 1;
  }
  return counts.map((c, i) => ({ x: min + (i + 0.5) * bw, y: c }));
}

export default function BootstrapDistCard({
  metrics,
  defaultHorizon = "20D",
  paths = 800,
  p = 0.2,
}: {
  metrics: MetricsPayload;
  defaultHorizon?: Horizon;
  paths?: number;
  p?: number;
}) {
  const [h, setH] = React.useState<Horizon>(defaultHorizon);

  const daily = React.useMemo(() => getDailyReturns(metrics), [metrics]);
  const sims = React.useMemo(
    () => simulateHorizonReturns(daily, h, paths, p),
    [daily, h, paths, p]
  );
  const bins = React.useMemo(() => histogram(sims, 32), [sims]);

  if (daily.length === 0) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">
              Bootstrap PnL Distribution
            </CardTitle>
            <CardDescription className="mt-0.5">
              No data in this range.
            </CardDescription>
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
            <CardTitle className="leading-tight">
              Bootstrap PnL Distribution
            </CardTitle>
            <CardDescription className="mt-0.5">
              Stationary bootstrap, {h} horizon, {sims.length} paths
            </CardDescription>
          </div>
          <div className="px-6 pb-3 sm:py-3">
            <ToggleGroup
              type="single"
              value={h}
              onValueChange={(v) => v && setH(v as Horizon)}
              className="h-9 rounded-full border bg-muted/40 p-0 shadow-sm overflow-hidden"
            >
              <ToggleGroupItem
                value="1D"
                className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background"
              >
                1D
              </ToggleGroupItem>
              <ToggleGroupItem
                value="5D"
                className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background"
              >
                5D
              </ToggleGroupItem>
              <ToggleGroupItem
                value="20D"
                className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background"
              >
                20D
              </ToggleGroupItem>
              <ToggleGroupItem
                value="60D"
                className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background"
              >
                60D
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[240px] w-full"
        >
          <BarChart data={bins} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="x"
              tickMargin={8}
              tickFormatter={(v: number) => fmtPct(v)}
            />
            <YAxis width={60} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="y"
                  // value: y (count), payload: array with the hovered bin
                  formatter={(val: unknown) => [String(val), " Frequency"]}
                  labelFormatter={(
                    _value: unknown,
                    payload?: Array<{ payload?: { x?: number } }>
                  ) => {
                    const x = payload?.[0]?.payload?.x;
                    return Number.isFinite(x) ? fmtPct(x as number) : "";
                  }}
                />
              }
            />
            <Bar dataKey="y" fill="var(--chart-1)" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
