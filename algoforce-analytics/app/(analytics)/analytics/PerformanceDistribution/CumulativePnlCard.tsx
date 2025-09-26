"use client";

import * as React from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
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
import { fmtUsd } from "../types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

type CumRow = {
  day: string;
  net: number;
  gross: number;
  feesNeg: number;
  cum: number;
};

const chartConfig = {
  cum: { label: "Cumulative Net PnL", color: "var(--chart-1)" },
  gross: { label: "Gross PnL", color: "var(--chart-3)" },
  fees: { label: "Fees", color: "var(--destructive)" },
} satisfies ChartConfig;

function isoDaysBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1))
    out.push(d.toISOString().slice(0, 10));
  return out;
}

function buildCumSeries(metrics: MetricsPayload): CumRow[] {
  const win = metrics.daily_return_last_n_days;
  const byDay = new Map(win.daily_rows.map((r) => [r.day, r]));
  const days = isoDaysBetween(win.window_start, win.window_end);

  let cum = 0;
  const out: CumRow[] = [];
  for (const day of days) {
    const r = byDay.get(day);
    if (r) {
      cum += r.net_pnl;
      out.push({
        day,
        net: r.net_pnl,
        gross: r.gross_pnl,
        feesNeg: -Math.abs(r.fees),
        cum,
      });
    } else {
      out.push({ day, net: 0, gross: 0, feesNeg: 0, cum });
    }
  }
  return out;
}

function ema(values: number[], alpha: number): number[] {
  if (values.length === 0) return [];
  const out: number[] = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i += 1)
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  return out;
}

export default function CumulativePnlCard({
  metrics,
  minChartWidthPx = 900,
  barSizePx = 10,
}: {
  metrics: MetricsPayload;
  minChartWidthPx?: number;
  barSizePx?: number;
}) {
  const [showComponents, setShowComponents] = React.useState<boolean>(true);
  const [smooth, setSmooth] = React.useState<boolean>(false);

  const rows = React.useMemo(() => buildCumSeries(metrics), [metrics]);

  const innerWidthPx = React.useMemo(() => {
    const gap = 6;
    const side = 48;
    return Math.max(minChartWidthPx, rows.length * (barSizePx + gap) + side);
  }, [rows.length, barSizePx, minChartWidthPx]);

  const data: CumRow[] = React.useMemo(() => {
    if (!smooth) return [...rows];
    const smoothed = ema(
      rows.map((r) => r.cum),
      0.2
    );
    return rows.map((r, i) => ({ ...r, cum: smoothed[i] }));
  }, [rows, smooth]);

  const formatTick = React.useCallback((iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }, []);

  const nameMap: Record<string, string> = {
    gross: "Gross",
    feesNeg: "Fees",
    net: "Net",
    cum: "Cumulative",
  };

  const tooltipFormatter = React.useCallback(
    (val: ValueType, name: NameType): [React.ReactNode, React.ReactNode] => {
      const label = `\u00A0${nameMap[String(name)] ?? String(name)}`;
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
    },
    []
  );

  if (rows.length === 0) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Cumulative PnL</CardTitle>
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
            <CardTitle className="leading-tight">Cumulative PnL</CardTitle>
            <CardDescription className="mt-0.5">
              Line: net cumulative • Bars: gross &amp; fees
            </CardDescription>
          </div>

          <div className="px-6 pb-3 sm:py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="cmp"
                  checked={showComponents}
                  onCheckedChange={setShowComponents}
                />
                <Label htmlFor="cmp" className="text-xs sm:text-sm">
                  Show components
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="sm" checked={smooth} onCheckedChange={setSmooth} />
                <Label htmlFor="sm" className="text-xs sm:text-sm">
                  Smoothing (EMA)
                </Label>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-6">
        <div className="overflow-x-auto">
          <div style={{ width: `${innerWidthPx}px` }}>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[280px] w-full"
            >
              <ComposedChart data={data} margin={{ left: 12, right: 12 }}>
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
                  yAxisId="left"
                  orientation="left"
                  tickFormatter={(v: number) => fmtUsd(v)}
                  width={70}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v: number) => fmtUsd(v)}
                  width={70}
                  hide={!showComponents}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      className="w-[220px]"
                      nameKey="cum"
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
                {showComponents ? (
                  <Bar yAxisId="right" dataKey="gross" barSize={barSizePx}>
                    {data.map((d) => (
                      <Cell key={`g:${d.day}`} fill="var(--chart-3)" />
                    ))}
                  </Bar>
                ) : null}
                {showComponents ? (
                  <Bar yAxisId="right" dataKey="feesNeg" barSize={barSizePx}>
                    {data.map((d) => (
                      <Cell key={`f:${d.day}`} fill="var(--destructive)" />
                    ))}
                  </Bar>
                ) : null}
                <Line
                  yAxisId="right"
                  dataKey="net"
                  dot={false}
                  strokeOpacity={0}
                  activeDot={false as unknown as boolean}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="cum"
                  dot={false}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ChartContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
