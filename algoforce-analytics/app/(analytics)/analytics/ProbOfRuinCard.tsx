// FILE: app/analytics/ProbOfRuinCard.tsx
"use client";

import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import type { MetricsPayload } from "./types";

type Horizon = "20D" | "60D" | "120D" | "252D";
type DailyRow = MetricsPayload["daily_return_last_n_days"]["daily_rows"][number];
type Point = { h: string; ruinPct: number };

const chartConfig: ChartConfig = {
  ruinPct: { label: "Probability", color: "var(--chart-2)" },
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

function horizonDays(h: Horizon): number {
  switch (h) {
    case "20D": return 20;
    case "60D": return 60;
    case "120D": return 120;
    case "252D": return 252;
  }
}

/** Stationary bootstrap indices; continues block with prob (1 - p). */
function stationaryBootstrapIndices(T: number, p: number): Uint32Array {
  const idx = new Uint32Array(T);
  let i = 0;
  let start = Math.floor(Math.random() * T);
  while (i < T) {
    idx[i++] = start as number;
    if (Math.random() < 1 - p) start = (start + 1) % T;
    else start = Math.floor(Math.random() * T);
  }
  return idx;
}

function simulateRuinProb(
  daily: number[],
  horizons: Horizon[],
  initEquity: number,
  ruinFloor: number,
  paths: number,
  p: number
): Point[] {
  const T = daily.length;
  if (T === 0 || initEquity <= 0 || ruinFloor <= 0) {
    return horizons.map((h) => ({ h, ruinPct: 0 }));
  }
  return horizons.map((h) => {
    const H = horizonDays(h);
    let ruin = 0;
    for (let b = 0; b < paths; b += 1) {
      const idx = stationaryBootstrapIndices(T, p);
      let eq = initEquity;
      for (let t = 0; t < H; t += 1) {
        const r = daily[idx[Math.floor(Math.random() * T)]];
        eq *= 1 + r;
        if (eq <= ruinFloor) { ruin += 1; break; }
      }
    }
    return { h, ruinPct: (ruin / paths) * 100 };
  });
}

export default function ProbOfRuinCard({
  metrics,
  defaultThresholdPct = 30,
  paths = 1000,
  p = 0.2,
}: {
  metrics: MetricsPayload;
  defaultThresholdPct?: number; // e.g., 30 => ruin if equity falls 30% from start
  paths?: number;
  p?: number; // stationary bootstrap parameter
}) {
  const [thrPct, setThrPct] = React.useState<number>(defaultThresholdPct);
  const [focusH, setFocusH] = React.useState<Horizon>("60D");

  const initEquity = metrics.initial_balance ?? 0; // ← fix: no metrics.merged
  const daily = React.useMemo(() => getDailyReturns(metrics), [metrics]);

  // Stable horizons list to satisfy react-hooks/exhaustive-deps
  const horizons = React.useMemo<Horizon[]>(
    () => ["20D", "60D", "120D", "252D"],
    []
  );

  const ruinData = React.useMemo(() => {
    const floor = initEquity * (1 - Math.max(0, Math.min(thrPct, 99.9)) / 100);
    return simulateRuinProb(daily, horizons, initEquity, floor, paths, p);
  }, [daily, horizons, initEquity, thrPct, paths, p]);

  if (daily.length === 0 || !isFiniteNumber(initEquity)) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Probability of Ruin</CardTitle>
            <CardDescription className="mt-0.5">No data in this range.</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const focusVal = ruinData.find((d) => d.h === focusH)?.ruinPct ?? 0;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle className="leading-tight">Probability of Ruin</CardTitle>
            <CardDescription className="mt-0.5">
              Ruin at −{thrPct.toFixed(1)}% from start • {focusH}: {focusVal.toFixed(1)}%
            </CardDescription>
          </div>
          <div className="px-6 pb-3 sm:py-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm">Threshold (%)</span>
              <Input
                type="number"
                step="0.5"
                className="h-8 w-[84px]"
                value={thrPct}
                onChange={(e) => setThrPct(Number(e.target.value || 0))}
              />
            </div>
            <ToggleGroup
              type="single"
              value={focusH}
              onValueChange={(v) => v && setFocusH(v as Horizon)}
              className="h-9 rounded-full border bg-muted/40 p-0 shadow-sm overflow-hidden"
            >
              <ToggleGroupItem value="20D" className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background">20D</ToggleGroupItem>
              <ToggleGroupItem value="60D" className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background">60D</ToggleGroupItem>
              <ToggleGroupItem value="120D" className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background">120D</ToggleGroupItem>
              <ToggleGroupItem value="252D" className="h-9 px-3 text-xs sm:text-sm font-medium data-[state=on]:bg-background">252D</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
          <AreaChart data={ruinData} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="h" tickMargin={8} />
            <YAxis width={60} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="ruinPct"
                  formatter={(val: unknown) => [`${Number(val).toFixed(1)}%`, " Probability"]}
                  labelFormatter={(v) => String(v)}
                />
              }
            />
            <Area dataKey="ruinPct" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.2} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
