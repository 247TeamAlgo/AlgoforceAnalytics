"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { DatedPoint } from "../types";

type TimeRange = "all" | "90d" | "30d" | "7d";

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  return new Date(String(value));
}

function fmtCurrency(v: number): string {
  return `$${v.toFixed(2)}`;
}

function rangeLabel(data: DatedPoint[]): string {
  if (data.length === 0) return "—";
  const start = toDate(data[0].date);
  const end = toDate(data[data.length - 1].date);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function pctChange(data: DatedPoint[]): number {
  if (data.length < 2) return 0;
  const a = data[0].value;
  const b = data[data.length - 1].value;
  if (a === 0) return 0;
  return (b / a - 1) * 100;
}

function filterByRange(data: DatedPoint[], range: TimeRange): DatedPoint[] {
  if (range === "all" || data.length === 0) return data;
  const last = toDate(data[data.length - 1].date);
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  const start = new Date(last);
  start.setDate(start.getDate() - days);
  return data.filter((d) => toDate(d.date) >= start);
}

export function EquityCurveCard({
  data,
  title = "Equity Curve",
  description = "Cumulative equity over time",
  showCallout = false,
}: {
  data: DatedPoint[];
  title?: string;
  description?: string;
  showCallout?: boolean;
}): React.ReactNode {
  const series = React.useMemo(
    () => [...data].sort((a, b) => +toDate(a.date) - +toDate(b.date)),
    [data]
  );

  const [range, setRange] = React.useState<TimeRange>("all");
  const view = React.useMemo(
    () => filterByRange(series, range),
    [series, range]
  );

  const change = React.useMemo(() => pctChange(view), [view]);
  const isUp = change >= 0;
  const overallRange = React.useMemo(() => rangeLabel(view), [view]);
  const lastPoint: DatedPoint | undefined =
    view.length > 0 ? view[view.length - 1] : undefined;

  return (
    <Card className="rounded-3xl border shadow-2xl shadow-black/5 dark:shadow-black/40">
      <CardHeader className="flex items-center gap-2 space-y-0 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as TimeRange)}>
          <SelectTrigger className="w-[160px]" aria-label="Select time range">
            <SelectValue placeholder="All time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="relative">
        {showCallout && lastPoint ? (
          <div className="pointer-events-none absolute right-4 top-4 z-[1]">
            <div className="rounded-lg bg-primary/90 px-3 py-2 text-xs font-medium text-primary-foreground shadow-lg">
              {fmtCurrency(lastPoint.value)}
            </div>
            <div className="mt-1 rounded-lg bg-muted/90 px-3 py-1 text-[11px] text-muted-foreground shadow">
              {toDate(lastPoint.date).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "2-digit",
              })}
            </div>
          </div>
        ) : null}

        <ChartContainer
          config={{ eq: { label: "Equity", color: "var(--chart-6)" } }}
          className="h-[300px] w-full"
        >
          <AreaChart
            accessibilityLayer
            data={view}
            margin={{ left: 12, right: 12 }}
          >
            <defs>
              <linearGradient id="fillEq" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-eq)"
                  stopOpacity={0.25}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-eq)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} className="stroke-muted/40" />
            <YAxis
              width={56}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                new Intl.NumberFormat(undefined, {
                  maximumFractionDigits: 2,
                }).format(v)
              }
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(v) =>
                new Date(v).toLocaleDateString(undefined, { month: "short" })
              }
            />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<ChartTooltipContent />}
              labelFormatter={(value: unknown) =>
                toDate(value).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "2-digit",
                })
              }
              formatter={(val: unknown, name: unknown) => {
                const num = typeof val === "number" ? val : Number(val);
                return [
                  `$${(Number.isFinite(num) ? num : 0).toFixed(2)}`,
                  String(name),
                ];
              }}
            />

            {lastPoint ? (
              <ReferenceLine
                x={lastPoint.date as unknown as number}
                stroke="currentColor"
                strokeOpacity={0.25}
                strokeDasharray="3 3"
              />
            ) : null}

            <Area
              dataKey="value"
              name="Equity"
              type="monotone"
              fill="url(#fillEq)"
              stroke="var(--color-eq)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>

      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-1">
            <div className="flex items-center gap-2 leading-none font-medium">
              {isUp ? (
                <>
                  Up {change.toFixed(2)}% over range
                  <TrendingUp
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden
                  />
                </>
              ) : (
                <>
                  Down {Math.abs(change).toFixed(2)}% over range
                  <TrendingDown className="h-4 w-4 text-red-600" aria-hidden />
                </>
              )}
            </div>
            <div className="text-muted-foreground flex items-center gap-2 leading-none">
              {overallRange}
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
