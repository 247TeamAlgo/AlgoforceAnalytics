"use client";

import * as React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { MetricsPayload } from "../types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

type Metric = "sharpe" | "sortino" | "calmar";
type WindowSel = "30d" | "90d" | "ytd";

type Row = { day: string; value: number | null };

const chartConfig = {
  value: { label: "Metric", color: "var(--chart-2)" },
} satisfies ChartConfig;

function isoDaysBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1))
    out.push(d.toISOString().slice(0, 10));
  return out;
}
function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - m) * (b - m), 0) / (vals.length - 1);
  return Math.sqrt(v);
}
function buildDailySeries(metrics: MetricsPayload, riskFreeAnnual: number) {
  const win = metrics.daily_return_last_n_days;
  const byDay = new Map(win.daily_rows.map((r) => [r.day, r]));
  const days = isoDaysBetween(win.window_start, win.window_end);
  const A = 252;
  const rfPerDay = riskFreeAnnual / A;

  const returns = days.map((d) => {
    const row = byDay.get(d);
    const pct = row?.daily_return_pct ?? 0;
    const equity =
      row?.end_balance ??
      byDay.get(d)?.start_balance ??
      metrics.initial_balance ??
      0;
    return { day: d, r: pct / 100, rExcess: pct / 100 - rfPerDay, equity };
  });
  return { returns, A };
}
function computeSharpe(excess: number[], A: number): number | null {
  if (excess.length < 3) return null;
  const μ = excess.reduce((a, b) => a + b, 0) / excess.length;
  const σ = stddev(excess);
  if (σ < 1e-9) return null;
  return Math.sqrt(A) * (μ / σ);
}
function computeSortino(excess: number[], A: number): number | null {
  if (excess.length < 3) return null;
  const μ = excess.reduce((a, b) => a + b, 0) / excess.length;
  const downside = excess.filter((x) => x < 0);
  const σd = downside.length > 1 ? stddev(downside) : 0;
  if (σd < 1e-9) return null;
  return Math.sqrt(A) * (μ / σd);
}
function computeCalmar(
  equity: number[],
  A: number,
  buckets: number
): number | null {
  if (equity.length < 3) return null;
  const E0 = equity[0];
  const En = equity[equity.length - 1];
  if (E0 <= 0) return null;
  const annReturn = Math.pow(En / E0, A / buckets) - 1;
  let peak = E0;
  let maxDD = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    if (peak > 0) {
      const dd = e / peak - 1;
      if (dd < maxDD) maxDD = dd;
    }
  }
  const denom = Math.abs(maxDD);
  if (denom < 1e-9) return null;
  return annReturn / denom;
}
function buildRollingSeries(
  metrics: MetricsPayload,
  metric: Metric,
  winSel: WindowSel,
  riskFreeAnnual: number
): Row[] {
  const { returns, A } = buildDailySeries(metrics, riskFreeAnnual);

  function inWindowIndex(i: number, j: number, days: string[]): boolean {
    const end = new Date(`${days[i]}T00:00:00Z`);
    const start = new Date(end);
    if (winSel === "30d") start.setUTCDate(end.getUTCDate() - 29);
    else if (winSel === "90d") start.setUTCDate(end.getUTCDate() - 89);
    else start.setUTCFullYear(end.getUTCFullYear(), 0, 1);
    const d = new Date(`${days[j]}T00:00:00Z`);
    return d >= start && d <= end;
  }

  const days = returns.map((x) => x.day);
  const out: Row[] = [];
  for (let i = 0; i < returns.length; i += 1) {
    const ex: number[] = [];
    const eq: number[] = [];
    let buckets = 0;
    for (let j = 0; j <= i; j += 1) {
      if (!inWindowIndex(i, j, days)) continue;
      if (metric === "calmar") eq.push(returns[j].equity);
      else ex.push(returns[j].rExcess);
      buckets += 1;
    }
    let v: number | null;
    if (metric === "sharpe") v = computeSharpe(ex, A);
    else if (metric === "sortino") v = computeSortino(ex, A);
    else v = computeCalmar(eq, A, buckets);
    out.push({ day: returns[i].day, value: v });
  }
  return out;
}

export default function RollingSharpeCard({
  metrics,
  defaultRiskFreeAnnual = 0,
}: {
  metrics: MetricsPayload;
  defaultRiskFreeAnnual?: number;
}) {
  const [rfAnnual, setRfAnnual] = React.useState<number>(defaultRiskFreeAnnual);
  const [win, setWin] = React.useState<WindowSel>("30d");
  const [metric, setMetric] = React.useState<Metric>("sharpe");

  const series = React.useMemo(
    () => buildRollingSeries(metrics, metric, win, rfAnnual),
    [metrics, metric, win, rfAnnual]
  );

  const innerWidth = React.useMemo(
    () => Math.max(720, series.length * (10 + 6) + 48),
    [series.length]
  );

  const formatTick = React.useCallback((iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }, []);

  const metricLabel =
    metric === "sharpe"
      ? "Sharpe"
      : metric === "sortino"
        ? "Sortino"
        : "Calmar";
  const tooltipFormatter = React.useCallback(
    (val: ValueType, name: NameType): [React.ReactNode, React.ReactNode] => {
      if (val == null) return ["—", metricLabel];
      let out: string;
      if (Array.isArray(val)) {
        const n = Number(val[0]);
        out = Number.isFinite(n) ? n.toFixed(3) : String(val[0]);
      } else if (typeof val === "number") {
        out = val.toFixed(3);
      } else {
        const n = Number(val);
        out = Number.isFinite(n) ? n.toFixed(3) : String(val);
      }
      return [out, `\u00A0${metricLabel}`];
    },
    [metricLabel]
  );

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle className="leading-tight">
              Sharpe / Sortino / Calmar
            </CardTitle>
            <CardDescription className="mt-0.5">
              Rolling {win.toUpperCase()} on daily returns
            </CardDescription>
          </div>
          <div className="px-6 pb-3 sm:py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs sm:text-sm">Metric</Label>
                <ToggleGroup
                  type="single"
                  value={metric}
                  onValueChange={(v) => v && setMetric(v as Metric)}
                  className="h-8"
                >
                  <ToggleGroupItem value="sharpe" className="h-8 px-2">
                    Sharpe
                  </ToggleGroupItem>
                  <ToggleGroupItem value="sortino" className="h-8 px-2">
                    Sortino
                  </ToggleGroupItem>
                  <ToggleGroupItem value="calmar" className="h-8 px-2">
                    Calmar
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs sm:text-sm">Window</Label>
                <ToggleGroup
                  type="single"
                  value={win}
                  onValueChange={(v) => v && setWin(v as WindowSel)}
                  className="h-8"
                >
                  <ToggleGroupItem value="30d" className="h-8 px-2">
                    30D
                  </ToggleGroupItem>
                  <ToggleGroupItem value="90d" className="h-8 px-2">
                    90D
                  </ToggleGroupItem>
                  <ToggleGroupItem value="ytd" className="h-8 px-2">
                    YTD
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              {(metric === "sharpe" || metric === "sortino") && (
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <Label
                    htmlFor="rf"
                    className="text-xs sm:text-sm whitespace-nowrap"
                  >
                    Risk-free (annual %)
                  </Label>
                  <Input
                    id="rf"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    className="h-8 w-[84px]"
                    value={rfAnnual}
                    onChange={(e) => setRfAnnual(Number(e.target.value || 0))}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-6">
        <div className="overflow-x-auto">
          <div style={{ width: `${innerWidth}px` }}>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[240px] w-full"
            >
              <LineChart data={[...series]} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  interval="preserveStartEnd"
                  tickFormatter={formatTick}
                />
                <YAxis
                  width={56}
                  tickFormatter={(v: number) => (v == null ? "" : v.toFixed(2))}
                />
                {metric !== "calmar" && (
                  <ReferenceLine
                    y={0}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="3 3"
                  />
                )}
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      className="w-[180px]"
                      nameKey="value"
                      labelFormatter={(value: string) =>
                        new Date(value).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      }
                      formatter={tooltipFormatter}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  dot={false}
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  connectNulls
                />
              </LineChart>
            </ChartContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
