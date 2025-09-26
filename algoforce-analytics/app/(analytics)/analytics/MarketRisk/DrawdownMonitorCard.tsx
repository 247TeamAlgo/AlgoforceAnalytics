"use client";

import * as React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { MetricsPayload } from "../types";

type DDPoint = { day: string; equity: number; peak: number; dd: number };

const chartConfig: ChartConfig = {
  dd: { label: "Drawdown %", color: "var(--chart-2)" },
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function endBalanceSafe(r: {
  end_balance?: number;
  start_balance?: number;
  net_pnl?: number;
}): number | null {
  if (isFiniteNumber(r.end_balance)) return r.end_balance;
  if (isFiniteNumber(r.start_balance) && isFiniteNumber(r.net_pnl)) return r.start_balance + r.net_pnl;
  return null;
}

function buildDrawdownSeries(metrics: MetricsPayload): DDPoint[] {
  const rows = metrics.daily_return_last_n_days?.daily_rows ?? [];
  if (rows.length === 0) return [];

  // Seed peak from initial_balance if sane, else first valid end balance
  let peakSeed = isFiniteNumber(metrics.initial_balance) ? metrics.initial_balance : null;
  if (!isFiniteNumber(peakSeed)) {
    for (const r of rows) {
      const eb = endBalanceSafe(r);
      if (isFiniteNumber(eb)) {
        peakSeed = eb;
        break;
      }
    }
  }
  if (!isFiniteNumber(peakSeed)) return []; // nothing to plot

  let peak = peakSeed;
  const out: DDPoint[] = [];

  for (const r of rows) {
    const eb = endBalanceSafe(r);
    if (!isFiniteNumber(eb)) continue; // skip broken row
    peak = Math.max(peak, eb);
    const dd = peak > 0 ? (eb / peak - 1) * 100 : 0;
    out.push({ day: r.day, equity: eb, peak, dd });
  }
  return out;
}

export default function DrawdownMonitorCard({ metrics }: { metrics: MetricsPayload }) {
  const series = React.useMemo(() => buildDrawdownSeries(metrics), [metrics]);

  if (series.length === 0) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Drawdown Monitor</CardTitle>
            <CardDescription className="mt-0.5">No data in this range.</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">Drawdown Monitor</CardTitle>
          <CardDescription className="mt-0.5">Equity peak vs. drawdown (%)</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
          <LineChart data={series} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickMargin={8} />
            <YAxis width={60} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="dd"
                  formatter={(val: unknown) => {
                    const n = Number(val);
                    return [Number.isFinite(n) ? `${n.toFixed(2)}%` : "–", " Drawdown"];
                  }}
                  labelFormatter={(d) =>
                    new Date(d).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  }
                />
              }
            />
            <Line type="monotone" dataKey="dd" dot={false} stroke="var(--chart-2)" strokeWidth={2} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
