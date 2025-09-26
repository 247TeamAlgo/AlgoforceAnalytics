"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { MetricsPayload } from "../types";
import { fmtUsd } from "../types";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

/** ---------- Types ---------- */

type Grain = "daily" | "weekly" | "monthly";

type DayRow = {
  day: string;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
};

type BucketRow = {
  key: string;      // e.g. "Aug 23" | "2025-W35" | "2025-09"
  startIso: string; // bucket start date ISO (YYYY-MM-DD)
  gross: number;
  feesNeg: number;  // negative fees for visualization
  net: number;
};

/** ---------- Chart Config ---------- */

const chartConfig: ChartConfig = {
  net: { label: "Net PnL", color: "var(--chart-1)" },
  gross: { label: "Gross PnL", color: "var(--chart-3)" },
  feesNeg: { label: "Fees", color: "var(--destructive)" },
};

/** ---------- Utils ---------- */

function toDateUTC(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`);
}

function iso(utcDate: Date): string {
  return utcDate.toISOString().slice(0, 10);
}

function startOfIsoWeek(d: Date): Date {
  const day = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
  const out = new Date(d);
  out.setUTCDate(d.getUTCDate() - (day - 1));
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function ymKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

function isoWeekKey(d: Date): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - ((dt.getUTCDay() || 7)));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+dt - +yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${`${weekNo}`.padStart(2, "0")}`;
}

function fmtDailyTick(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tooltipFormatter(
  val: ValueType,
  name: NameType
): [React.ReactNode, React.ReactNode] {
  const labels: Record<string, string> = {
    net: " Net",
    gross: " Gross",
    feesNeg: " Fees",
  };
  const label = labels[String(name)] ?? ` ${String(name)}`;
  let display: string;
  if (Array.isArray(val)) {
    const n = Number(val[0]);
    display = Number.isFinite(n) ? fmtUsd(n) : String(val[0]);
  } else if (typeof val === "number") {
    display = fmtUsd(val);
  } else {
    const n = Number(val);
    display = Number.isFinite(n) ? fmtUsd(n) : String(val);
  }
  return [display, label];
}

/** ---------- Data Shaping ---------- */

function gatherDailyRows(metrics: MetricsPayload): DayRow[] {
  return metrics.daily_return_last_n_days.daily_rows.map((r) => ({
    day: r.day,
    gross_pnl: r.gross_pnl,
    fees: r.fees,
    net_pnl: r.net_pnl,
  }));
}

function bucketize(rows: DayRow[], grain: Grain): BucketRow[] {
  if (grain === "daily") {
    return rows.map((r) => ({
      key: fmtDailyTick(r.day),
      startIso: r.day,
      gross: r.gross_pnl,
      feesNeg: -Math.abs(r.fees),
      net: r.net_pnl,
    }));
  }

  const map = new Map<string, { start: string; g: number; f: number; n: number }>();

  for (const r of rows) {
    const d = toDateUTC(r.day);
    if (grain === "weekly") {
      const s = startOfIsoWeek(d);
      const k = isoWeekKey(d);
      const start = iso(s);
      const prev = map.get(k) ?? { start, g: 0, f: 0, n: 0 };
      prev.g += r.gross_pnl;
      prev.f += r.fees;
      prev.n += r.net_pnl;
      map.set(k, prev);
    } else {
      const k = ymKey(d); // monthly
      const firstOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const start = iso(firstOfMonth);
      const prev = map.get(k) ?? { start, g: 0, f: 0, n: 0 };
      prev.g += r.gross_pnl;
      prev.f += r.fees;
      prev.n += r.net_pnl;
      map.set(k, prev);
    }
  }

  return [...map.entries()]
    .map(([k, v]) => ({
      key: k,
      startIso: v.start,
      gross: v.g,
      feesNeg: -Math.abs(v.f),
      net: v.n,
    }))
    .sort((a, b) => (a.startIso < b.startIso ? -1 : a.startIso > b.startIso ? 1 : 0));
}

/** ---------- Component ---------- */

export default function PnlBreakdownCard({
  metrics,
  minChartWidthPx = 900,
  barSizePx = 14,
  showNetLineDefault = true,
}: {
  metrics: MetricsPayload;
  minChartWidthPx?: number;
  barSizePx?: number;
  showNetLineDefault?: boolean;
}) {
  const [grain, setGrain] = React.useState<Grain>("daily");
  const [showNetLine, setShowNetLine] = React.useState<boolean>(showNetLineDefault);

  const dailyRows = React.useMemo(() => gatherDailyRows(metrics), [metrics]);
  const buckets = React.useMemo(() => bucketize(dailyRows, grain), [dailyRows, grain]);

  const innerWidthPx = React.useMemo(() => {
    const gap = 6;
    const side = 48;
    return Math.max(minChartWidthPx, buckets.length * (barSizePx + gap) + side);
  }, [buckets.length, barSizePx, minChartWidthPx]);

  if (buckets.length === 0) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">PnL Breakdown</CardTitle>
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
            <CardTitle className="leading-tight">PnL Breakdown</CardTitle>
            <CardDescription className="mt-0.5">
              Stacked bars: Gross &amp; Fees • Optional Net line
            </CardDescription>
          </div>

          <div className="px-6 pb-3 sm:py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={grain}
                  onValueChange={(v: string) => {
                    if (v === "daily" || v === "weekly" || v === "monthly") setGrain(v);
                  }}
                  className="h-8"
                >
                  <ToggleGroupItem value="daily" className="h-8 px-2">Daily</ToggleGroupItem>
                  <ToggleGroupItem value="weekly" className="h-8 px-2">Weekly</ToggleGroupItem>
                  <ToggleGroupItem value="monthly" className="h-8 px-2">Monthly</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="flex items-center gap-2">
                <Switch id="show-net" checked={showNetLine} onCheckedChange={setShowNetLine} />
                <Label htmlFor="show-net" className="text-xs sm:text-sm">Show Net line</Label>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-6">
        <div className="overflow-x-auto">
          <div style={{ width: `${innerWidthPx}px` }}>
            <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
              <ComposedChart data={buckets} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="key"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  interval="preserveStartEnd"
                />
                <YAxis tickFormatter={(v: number) => fmtUsd(v)} width={70} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      className="w-[220px]"
                      nameKey="net"
                      labelFormatter={(value: string) => value}
                      formatter={tooltipFormatter}
                    />
                  }
                />
                <Bar dataKey="gross" stackId="pnl" barSize={barSizePx}>
                  {buckets.map((b) => (
                    <Cell key={`g:${b.startIso}`} fill="var(--chart-3)" />
                  ))}
                </Bar>
                <Bar dataKey="feesNeg" stackId="pnl" barSize={barSizePx}>
                  {buckets.map((b) => (
                    <Cell key={`f:${b.startIso}`} fill="var(--destructive)" />
                  ))}
                </Bar>
                {showNetLine ? (
                  <Line
                    type="monotone"
                    dataKey="net"
                    dot={false}
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                ) : null}
              </ComposedChart>
            </ChartContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
