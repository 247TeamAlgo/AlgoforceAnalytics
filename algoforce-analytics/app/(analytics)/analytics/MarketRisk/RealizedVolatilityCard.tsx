"use client";

import * as React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MetricsPayload } from "../types";

type RVPoint = { day: string; rv: number | null };

const chartConfig: ChartConfig = {
  rv: { label: "Realized Vol (ann.)", color: "var(--chart-3)" },
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v);
}

function buildRVSeries(metrics: MetricsPayload, win: number): RVPoint[] {
  const rows = metrics.daily_return_last_n_days?.daily_rows ?? [];
  if (rows.length === 0) return [];

  const A = 252;
  // Normalize returns; keep nulls as null so windows can skip them
  const returns = rows.map((r) => ({
    day: r.day,
    r: isFiniteNumber(r.daily_return_pct) ? r.daily_return_pct / 100 : null,
  }));

  const out: RVPoint[] = [];
  for (let i = 0; i < returns.length; i++) {
    const slice = returns.slice(Math.max(0, i - win + 1), i + 1).map((x) => x.r).filter(isFiniteNumber);
    if (slice.length < Math.min(10, win / 2)) {
      out.push({ day: returns[i].day, rv: null });
      continue;
    }
    const sigma = stddev(slice);
    out.push({ day: returns[i].day, rv: sigma * Math.sqrt(A) * 100 });
  }
  return out;
}

export default function RealizedVolatilityCard({ metrics }: { metrics: MetricsPayload }) {
  const [win, setWin] = React.useState<30 | 90>(30);
  const series = React.useMemo(() => buildRVSeries(metrics, win), [metrics, win]);

  if (series.length === 0) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Realized Volatility</CardTitle>
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
            <CardTitle className="leading-tight">Realized Volatility</CardTitle>
            <CardDescription className="mt-0.5">Rolling {win}d window, annualized</CardDescription>
          </div>
          <div className="px-6 pb-3 sm:py-3">
            <ToggleGroup type="single" value={String(win)} onValueChange={(v) => v && setWin(Number(v) as 30 | 90)} className="h-8">
              <ToggleGroupItem value="30" className="h-8 px-2">30D</ToggleGroupItem>
              <ToggleGroupItem value="90" className="h-8 px-2">90D</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
          <LineChart data={series} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickMargin={8} />
            <YAxis width={60} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="rv"
                  formatter={(val: unknown) => {
                    const n = Number(val);
                    return [Number.isFinite(n) ? `${n.toFixed(2)}%` : "–", " RV"];
                  }}
                  labelFormatter={(d) =>
                    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  }
                />
              }
            />
            <Line type="monotone" dataKey="rv" stroke="var(--chart-3)" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
