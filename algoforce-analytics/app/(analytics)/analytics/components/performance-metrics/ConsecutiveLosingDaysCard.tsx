// app/(analytics)/analytics/components/performance-metrics/ConsecutiveLosingDaysThresholdsCard.tsx
"use client";

import * as React from "react";
import {
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Bell,
  BellRing,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MetricsPayload } from "../../lib/types";

/* ---------------- types ---------------- */
type ThresholdLevel = { value: number; label?: string }; // value in DAYS

type Row = {
  account: string;
  streak: number; // current losing streak length in days
  crossedIndex: number; // -1 if none, else index of highest crossed level
  color: string; // bar color (by crossed level)
};

const chartConfig: ChartConfig = {
  streak: { label: "Consecutive Losing Days", color: "var(--chart-3)" },
};

/* ---------------- utils ---------------- */
function dayLabel(n: number): string {
  return `${n}d`;
}

function isLosingDay(
  r: MetricsPayload["daily_return_last_n_days"]["daily_rows"][number]
): boolean {
  if (typeof r.daily_return_pct === "number") return r.daily_return_pct < 0;
  const pnl =
    typeof r.net_pnl === "number"
      ? r.net_pnl
      : typeof r.start_balance === "number" && typeof r.end_balance === "number"
        ? r.end_balance - r.start_balance
        : 0;
  return pnl < 0;
}

/** Current (running) losing-streak length from the provided rows. */
function currentLosingStreak(
  rows: MetricsPayload["daily_return_last_n_days"]["daily_rows"]
): number {
  let cur = 0;
  for (const r of rows) {
    if (isLosingDay(r)) cur += 1;
    else cur = 0;
  }
  return cur;
}

/** Measure container (mutable ref so TS is happy when passing to DOM). */
function useMeasure<T extends HTMLElement>(): [
  React.MutableRefObject<T | null>,
  { width: number; height: number },
] {
  const ref = React.useRef<T>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ width: cr.width, height: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/* ---------------- data shaping ---------------- */
function build(
  perAccounts: Record<string, MetricsPayload> | undefined,
  levels: ThresholdLevel[],
  levelColors: string[],
  defaultBarColor: string
) {
  const orderedLevels = [...levels].sort((a, b) => a.value - b.value);
  const vals = orderedLevels.map((l) => l.value);

  const rows: Row[] = perAccounts
    ? Object.entries(perAccounts).map(([account, payload]) => {
        const streak = currentLosingStreak(
          payload.daily_return_last_n_days.daily_rows
        );
        let idx = -1;
        for (let i = 0; i < vals.length; i += 1) {
          if (streak >= vals[i]) idx = i;
          else break;
        }
        const color =
          idx >= 0 ? (levelColors[idx] ?? defaultBarColor) : defaultBarColor;
        return { account, streak, crossedIndex: idx, color };
      })
    : [];

  rows.sort((a, b) => b.streak - a.streak);

  const maxData = rows.reduce((m, r) => Math.max(m, r.streak), 0);
  const maxLevel = vals.reduce((m, v) => Math.max(m, v), 0);
  const xMax = Math.max(maxData, maxLevel) * 1.06 || 1;

  // Legend (full)
  const legendAll = orderedLevels.map((l, i) => ({
    x: l.value,
    label: l.label ?? dayLabel(l.value),
    color: levelColors[i] ?? defaultBarColor,
  }));

  // Show thresholds only up to the *next* threshold after the current worst streak
  const findIdx = legendAll.findIndex((t) => t.x >= maxData);
  const nextIdx = Math.min(
    findIdx === -1 ? legendAll.length - 1 : findIdx,
    legendAll.length - 1
  );
  const visibleLegend = legendAll.slice(0, nextIdx + 1);
  const visibleVals = vals.slice(0, nextIdx + 1);

  // Crossed counts for legend tooltips (across ALL levels)
  const crossedCounts = vals.map(
    (v) => rows.filter((r) => r.streak >= v).length
  );

  const anyCrossedL1 = rows.some((r) => r.crossedIndex >= 0);

  return {
    rows,
    xMax,
    legendAll,
    visibleLegend,
    crossedCounts,
    anyCrossedL1,
    orderedLevels,
    vals,
  };
}

/* ---------------- tooltip ---------------- */
type TooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; payload: Row }>;
  legend: Array<{ x: number; label: string; color: string }>;
  vals: number[];
};

function StreakThresholdTooltip({
  active,
  payload,
  legend,
  vals,
}: TooltipProps) {
  const item = payload?.[0];
  if (!active || !item) return null;

  const val = Number(item.value ?? 0);
  const row = item.payload as Row;

  const crossed = row.crossedIndex >= 0 ? legend[row.crossedIndex] : undefined;
  const next =
    row.crossedIndex + 1 < legend.length
      ? legend[row.crossedIndex + 1]
      : undefined;

  const nextVal =
    row.crossedIndex + 1 < vals.length ? vals[row.crossedIndex + 1] : null;
  const gap = nextVal != null ? Math.max(0, nextVal - row.streak) : null;

  return (
    <div className="min-w-[240px] rounded-md border bg-popover/95 p-3 text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">{row.account}</div>
        <Badge variant="secondary" className="shrink-0">
          {dayLabel(val)}
        </Badge>
      </div>

      <div className="mt-2 grid gap-1 text-xs leading-relaxed">
        <div className="flex items-center gap-2">
          {crossed ? (
            <AlertTriangle
              className="h-3.5 w-3.5"
              style={{ color: crossed.color }}
            />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span>
            {crossed ? (
              <>
                Crossed{" "}
                <span className="font-medium" style={{ color: crossed.color }}>
                  {crossed.label}
                </span>
              </>
            ) : (
              "Below first threshold"
            )}
          </span>
        </div>

        {next ? (
          <div className="flex items-center gap-2">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              Next:{" "}
              <span className="font-medium" style={{ color: next.color }}>
                {next.label}
              </span>
              {gap != null ? (
                <span className="text-muted-foreground">
                  {" "}
                  {`(${gap} day(s) away)`}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- component ---------------- */
export default function ConsecutiveLosingDaysThresholdsCard({
  perAccounts,
  // First level = 4 days (alarm). Add more as needed.
  levels = [
    { value: 4, label: "4d" },
    { value: 6, label: "6d" },
    { value: 10, label: "10d" },
    { value: 14, label: "14d" },
  ],
  // ⬇️ EXACT same palette order as the Drawdown baseline (no HSL).
  levelColors = ["var(--chart-5)", "#FFA94D", "#FF7043", "var(--chart-1)"],
  defaultBarColor = "#39A0ED",
}: {
  perAccounts?: Record<string, MetricsPayload>;
  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
}) {
  const {
    rows,
    xMax,
    legendAll,
    crossedCounts,
    anyCrossedL1,
    orderedLevels,
    vals,
  } = React.useMemo(
    () => build(perAccounts, levels, levelColors, defaultBarColor),
    [perAccounts, levels, levelColors, defaultBarColor]
  );

  const [contentRef, { width }] = useMeasure<HTMLDivElement>();
  const rowCount = Math.max(1, rows.length);

  // Responsive sizing (mirrors Drawdown card)
  const widthFactor =
    width < 520 ? 0.96 : width < 800 ? 1.06 : width < 1100 ? 1.18 : 1.3;

  const baseBar =
    rowCount <= 6
      ? 32
      : rowCount <= 10
        ? 28
        : rowCount <= 16
          ? 24
          : rowCount <= 24
            ? 20
            : rowCount <= 32
              ? 18
              : 16;

  const barSize = Math.max(12, Math.min(40, Math.round(baseBar * widthFactor)));
  const gapY = Math.round(barSize * 0.38);

  const longest = rows.reduce((m, r) => Math.max(m, r.account.length), 0);
  const yAxisWidth = Math.max(
    112,
    Math.min(Math.floor(width * 0.34), longest * 7 + 20)
  );

  // Minimal margins; keep labels safe.
  const rightLabelChars = 4; // e.g., "12d"
  const rightMargin = Math.max(12, 6 + rightLabelChars * 6);
  const topMargin = 24; // room for threshold labels
  const leftMargin = 0;
  const bottomMargin = 6;

  const chartHeight =
    rowCount * (barSize + gapY) + topMargin + bottomMargin + 4;

  return (
    <Card className="w-full">
      {/* Header + separator like baseline */}
      <CardHeader className="pb-2 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Consecutive Losing Days — Thresholds</CardTitle>
            <CardDescription>
              Bars = current losing streak • vertical dashed lines = thresholds
              (with legend).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {anyCrossedL1 ? (
              <span className="inline-flex items-center gap-1 text-sm text-destructive">
                <BellRing className="h-4 w-4" />
                Alarm (crossed{" "}
                {orderedLevels[0]!.label ?? dayLabel(orderedLevels[0]!.value)})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Bell className="h-4 w-4" />
                Threshold @{" "}
                {orderedLevels[0]!.label ?? dayLabel(orderedLevels[0]!.value)}
              </span>
            )}
          </div>
        </div>

        {/* Legend (pills) with tooltips & crossed counts — mirrors baseline */}
        <TooltipProvider>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {legendAll.map((it, i) => (
              <Tooltip key={it.label}>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs cursor-default"
                    title={it.label}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-[3px]"
                      style={{ backgroundColor: it.color }}
                    />
                    <span className="text-muted-foreground">{it.label}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  <div className="font-medium mb-1">
                    Level {i + 1} • {it.label}
                  </div>
                  <div className="text-muted">
                    Triggers when any account’s current losing streak ≥{" "}
                    {it.label}.
                  </div>
                  <div className="mt-1">
                    Crossed by{" "}
                    <span className="font-medium">{crossedCounts[i]}</span>{" "}
                    account{crossedCounts[i] === 1 ? "" : "s"}.
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </CardHeader>

      <CardContent ref={contentRef} className="p-2">
        {!rows.length ? (
          <div className="text-sm text-muted-foreground py-10 text-center">
            No data.
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="w-full"
            style={{ height: `${chartHeight}px` }}
          >
            <BarChart
              accessibilityLayer
              data={rows}
              layout="vertical"
              barCategoryGap={gapY}
              margin={{
                left: leftMargin,
                right: rightMargin,
                top: topMargin,
                bottom: bottomMargin,
              }}
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="account"
                type="category"
                width={yAxisWidth}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
              />
              <XAxis
                type="number"
                domain={[0, Math.max(1, Math.ceil(xMax))]}
                allowDecimals={false}
                tickFormatter={(v: number) => dayLabel(v)}
              />

              {/* Only the VISIBLE thresholds (up to next beyond worst) */}
              {legendAll.map((it) => (
                <ReferenceLine
                  key={`thr-${it.label}`}
                  x={it.x}
                  stroke={it.color}
                  strokeDasharray="6 6"
                  label={{
                    value: it.label,
                    position: "top",
                    fill: it.color,
                    fontSize: 11,
                  }}
                />
              ))}

              <ChartTooltip
                cursor={false}
                content={
                  <StreakThresholdTooltip legend={legendAll} vals={vals} />
                }
              />

              <Bar
                dataKey="streak"
                layout="vertical"
                radius={4}
                barSize={barSize}
              >
                {rows.map((r) => (
                  <Cell key={r.account} fill={r.color} />
                ))}
                <LabelList
                  dataKey="streak"
                  position="right"
                  offset={8}
                  className="fill-foreground"
                  formatter={(v: number) => dayLabel(v)}
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
