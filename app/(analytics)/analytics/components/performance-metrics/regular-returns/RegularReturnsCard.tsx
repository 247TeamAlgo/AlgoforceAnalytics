// app/(analytics)/analytics/components/performance-metrics/regular-returns/RegularReturnsCard.tsx
"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { ChevronDown, TrendingUp, TrendingDown } from "lucide-react";

/* ----------------------------- Types ------------------------------ */

type Range = "Daily" | "Weekly";

export type RegularReturnsPayload = Record<
  string, // "YYYY-MM-DD"
  Record<string, number> // { fund2: 12.3, fund3: -1.2, total: 11.1 }
>;

type PerformanceWindow = {
  mode: "MTD" | "WTD" | "Custom";
  startDay: string;
  endDay: string;
};

type Props = {
  accounts: string[];
  data: RegularReturnsPayload;
  window?: PerformanceWindow;
};

type Point = {
  key: string;
  label: string; // x-axis label
  date: Date;
  value: number;
  [account: string]: number | string | Date;
};

/* ----------------------------- Helpers ---------------------------- */

const CUT_HOUR = 8;

function usd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(v);
  const body = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(abs);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${body}`;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const off = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - off);
  return x;
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function fmtDailyLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtWeeklyLabel(wkStart: Date) {
  const end = addDays(wkStart, 7);
  const s = wkStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const e = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${s} → ${e}`;
}

/** ceil to a “nice” 0.5×10^k step (1234→1500, 2686→3000, …) */
function niceCeilHalfPow10(x: number): number {
  const v = Math.max(0, Math.abs(x));
  if (v === 0) return 1;
  const k = Math.floor(Math.log10(v));
  const pow = Math.pow(10, k);
  const step = 0.5 * pow;
  return Math.ceil(v / step) * step;
}

function tone(n: number) {
  if (!Number.isFinite(n) || n === 0) return "flat" as const;
  return n > 0 ? ("pos" as const) : ("neg" as const);
}
function valueCls(n: number) {
  const t = tone(n);
  if (t === "pos") return "text-emerald-500";
  if (t === "neg") return "text-red-500";
  return "text-muted-foreground";
}

/* Vertical (rotated) X tick so every date shows on a single column */
type CustomTickProps = {
  x?: number;
  y?: number;
  payload?: { value: string | number };
};
const VerticalTick: React.FC<CustomTickProps> = ({ x = 0, y = 0, payload }) => (
  <g transform={`translate(${x},${y})`}>
    <text
      transform="rotate(-90)"
      textAnchor="end"
      dy={4}
      dx={-4}
      className="fill-muted-foreground"
      style={{ fontSize: 11 }}
    >
      {payload?.value as React.ReactNode}
    </text>
  </g>
);

/* Reference-style pill (dot • optional icon • label • bold value) */
const MetricPill: React.FC<{
  dot?: string;
  icon?: React.ReactNode;
  label: string;
  value: string;
  ringColor?: string;
}> = ({ dot, icon, label, value, ringColor }) => (
  <span
    className="inline-flex items-center gap-2 rounded-[10px] border bg-card/60 px-3 py-1 text-xs shadow-sm"
    style={
      ringColor
        ? {
            boxShadow: `inset 0 0 0 1px var(--border), 0 0 0 2px color-mix(in oklab, ${ringColor} 18%, transparent)`,
          }
        : undefined
    }
  >
    <span
      aria-hidden
      className="h-2.5 w-2.5 rounded-[3px]"
      style={{ backgroundColor: dot ?? "var(--foreground)" }}
    />
    {icon ? <span aria-hidden className="mr-0.5">{icon}</span> : null}
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold text-foreground">{value}</span>
  </span>
);

/* ----------------------------- Component -------------------------- */

export default function RegularReturnsCard({ accounts, data }: Props) {
  const [range, setRange] = useState<Range>("Daily");

  /* Normalize payload → daily points */
  const dailyPoints = useMemo<Point[]>(() => {
    const pts: Point[] = [];
    const keys = Object.keys(data).sort();
    for (const day of keys) {
      const [Y, M, D] = day.split("-").map(Number);
      if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D))
        continue;
      const date = new Date(
        Y,
        (M as number) - 1,
        D as number,
        CUT_HOUR,
        0,
        0,
        0
      );
      const row = data[day] ?? {};
      const p: Point = {
        key: `${day} ${String(CUT_HOUR).padStart(2, "0")}:00`,
        label: fmtDailyLabel(date),
        date,
        value: Number(row.total ?? 0),
      };
      for (const a of accounts) p[a] = Number(row[a] ?? 0);
      pts.push(p);
    }
    return pts;
  }, [data, accounts]);

  /* Weekly aggregation */
  const displayed: Point[] = useMemo(() => {
    if (range === "Daily") return dailyPoints;

    const map = new Map<string, Point>();
    for (const p of dailyPoints) {
      const wk = startOfWeekMonday(p.date);
      const k = wk.toISOString().slice(0, 10);
      const prev = map.get(k);
      if (!prev) {
        const q: Point = {
          key: `${k} ${String(CUT_HOUR).padStart(2, "0")}:00`,
          label: fmtWeeklyLabel(wk),
          date: wk,
          value: p.value,
        };
        for (const a of accounts) q[a] = Number(p[a] as number) || 0;
        map.set(k, q);
      } else {
        prev.value += p.value;
        for (const a of accounts) {
          prev[a] =
            (Number(prev[a] as number) || 0) + (Number(p[a] as number) || 0);
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  }, [dailyPoints, range, accounts]);

  /* Y-scale & ticks */
  const maxAbsRaw = useMemo(
    () => displayed.reduce((m, p) => Math.max(m, Math.abs(p.value)), 0),
    [displayed]
  );
  const yCeil = Math.max(1, niceCeilHalfPow10(maxAbsRaw));
  const yTicks = useMemo(
    () => [-yCeil, -yCeil / 2, 0, yCeil / 2, yCeil],
    [yCeil]
  );

  const bestDay = useMemo(() => {
    if (!dailyPoints.length) return null;
    return dailyPoints.reduce(
      (best, p) => (p.value > (best?.value ?? -Infinity) ? p : best),
      dailyPoints[0]!
    );
  }, [dailyPoints]);

  const worstDay = useMemo(() => {
    if (!dailyPoints.length) return null;
    return dailyPoints.reduce(
      (worst, p) => (p.value < (worst?.value ?? Infinity) ? p : worst),
      dailyPoints[0]!
    );
  }, [dailyPoints]);

  const winRate = useMemo(() => {
    const n = dailyPoints.length || 1;
    const wins = dailyPoints.filter((p) => p.value > 0).length;
    return (wins / n) * 100;
  }, [dailyPoints]);

  /* Typed Tooltip */
  const ReturnsTooltip: React.FC<TooltipProps<number, string>> = (props) => {
    if (!props.active || !props.payload?.length) return null;
    const row = props.payload[0]?.payload as Point | undefined;
    if (!row) return null;
    const v = Number(row.value) || 0;

    return (
      <div className="rounded-md border bg-popover text-popover-foreground p-2 text-xs shadow-md">
        <div className="font-semibold">
          <span className={valueCls(v)}>{usd(v)}</span>
        </div>
        <div className="text-muted-foreground mb-1">{row.label} (8:00 cut)</div>
        <div className="grid grid-cols-1 gap-0.5">
          {accounts.map((a) => {
            const av = Number(row[a] as number) || 0;
            return (
              <div key={a} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{a}</span>
                <span className={["font-mono", valueCls(av)].join(" ")}>
                  {usd(av)}
                </span>
              </div>
            );
          })}
          <div className="mt-1 h-px w-full bg-border/60" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">total</span>
            <span className={["font-mono", valueCls(v)].join(" ")}>
              {usd(v)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  /* ----------------------------- Render ---------------------------- */

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-4 sm:px-6 pt-2 pb-2 sm:pt-3 sm:pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base leading-tight">
              Daily/Weekly Returns ($)
            </CardTitle>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 gap-1"
                  aria-label="Select range"
                >
                  {range}
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => setRange("Daily")}>
                  Daily
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRange("Weekly")}>
                  Weekly
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-1 text-sm text-muted-foreground">
            Dollar PnL by day or ISO week (8:00 cut). Hover bars for account
            breakdown.
          </div>

          {dailyPoints.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Highest with icon */}
              <MetricPill
                dot="hsl(142 72% 45%)"
                icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                label={`Highest${bestDay ? ` • ${bestDay.label}` : ""}`}
                value={bestDay ? usd(bestDay.value) : "—"}
              />
              {/* Lowest with icon */}
              <MetricPill
                dot="hsl(0 72% 51%)"
                icon={<TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                label={`Lowest${worstDay ? ` • ${worstDay.label}` : ""}`}
                value={worstDay ? usd(worstDay.value) : "—"}
              />
              {/* Win rate keeps the same simple style (no icon in your ref) */}
              <MetricPill
                dot="hsl(200 70% 45%)"
                label="Win Rate"
                value={`${winRate.toFixed(0)}%`}
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-2 px-2 sm:px-3 pb-3">
        {displayed.length === 0 ? (
          <div className="text-sm text-muted-foreground px-4 py-12">
            No data.
          </div>
        ) : (
          <ChartContainer
            config={{ value: { label: "PnL" } }}
            className="items-center justify-center w-full"
          >
            <BarChart
              data={displayed}
              barCategoryGap={1}
              barGap={1}
              margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                stroke="var(--border)"
                strokeOpacity={0.8}
                strokeDasharray="6 6"
                horizontal
                vertical
              />

              <XAxis
                dataKey="label"
                type="category"
                interval={0}
                allowDuplicatedCategory={false}
                tick={<VerticalTick />}
                height={68}
                axisLine={false}
                tickLine={false}
                padding={{ left: 0, right: 0 }}
              />
              <YAxis
                domain={[-yCeil, yCeil]}
                ticks={yTicks}
                width={72}
                tickMargin={10}
                axisLine={false}
                tickLine={false}
                tickFormatter={(n) => usd(Number(n))}
              />

              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={2} />

              <ChartTooltip
                cursor={{ opacity: 0.06 }}
                content={<ReturnsTooltip />}
              />

              <Bar dataKey="value" radius={[2, 2, 2, 2]}>
                {displayed.map((row) => (
                  <Cell
                    key={row.key}
                    fill={
                      (row.value as number) >= 0
                        ? "hsl(142 72% 45%)"
                        : "hsl(0 72% 51%)"
                    }
                    opacity={0.9}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
