// ConsecutiveLosingDaysThresholdsCard.tsx
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
  Tooltip as ReTooltip,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MetricsSlim } from "../../lib/performance_metric_types";

/* ---------------- types ---------------- */
type ThresholdLevel = { value: number; label?: string }; // value in DAYS

type Row = {
  account: string;
  current: number; // current losing streak (days)
  max: number; // historical max losing streak (days)
  crossedIndex: number; // -1 if none
  color: string; // bar color for CURRENT
};

type SortMode =
  | "alpha-asc"
  | "alpha-desc"
  | "current-asc"
  | "current-desc"
  | "max-asc"
  | "max-desc";

/* Colors */
const CURRENT_HEX = "#39A0ED";
const MAX_BAR_FILL = "var(--primary)";
const MAX_BAR_FILL_OPACITY = 0.5;

const chartConfig: ChartConfig = {
  current: { label: "Current losing streak", color: "var(--chart-3)" },
  max: { label: "Max losing streak", color: "var(--muted-foreground)" },
};

/* ---------------- utils ---------------- */
function dayLabel(n: number): string {
  return `${n}d`;
}

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
  perAccounts: Record<string, MetricsSlim> | undefined,
  levels: ThresholdLevel[],
  levelColors: string[],
  defaultBarColor: string
) {
  const orderedLevels = [...levels].sort((a, b) => a.value - b.value);
  const vals = orderedLevels.map((l) => l.value);

  const rows: Row[] = perAccounts
    ? Object.entries(perAccounts).map(([account, p]) => {
        const cur = Math.max(0, Number(p.streaks?.current ?? 0));
        const mx = Math.max(0, Number(p.streaks?.max ?? 0));

        let idx = -1;
        for (let i = 0; i < vals.length; i += 1) {
          if (cur >= vals[i]!) idx = i;
          else break;
        }
        const color =
          idx >= 0 ? (levelColors[idx] ?? defaultBarColor) : defaultBarColor;
        return { account, current: cur, max: mx, crossedIndex: idx, color };
      })
    : [];

  const maxData = rows.reduce((m, r) => Math.max(m, r.current, r.max), 0);
  const maxLevel = vals.reduce((m, v) => Math.max(m, v), 0);
  const xMax = Math.max(maxData, maxLevel) * 1.06 || 1;

  const legendAll = orderedLevels.map((l, i) => ({
    x: l.value,
    label: l.label ?? dayLabel(l.value),
    color: levelColors[i] ?? defaultBarColor,
  }));

  const crossedCounts = vals.map(
    (v) => rows.filter((r) => r.current >= v).length
  );
  const anyCrossedL1 = rows.some((r) => r.crossedIndex >= 0);

  return {
    rows,
    xMax,
    legendAll,
    crossedCounts,
    anyCrossedL1,
    orderedLevels,
    vals,
  };
}

/* ---------------- tooltip ---------------- */
type TooltipItem = { dataKey?: string; value?: number; payload: Row };
type TooltipProps = {
  active?: boolean;
  payload?: TooltipItem[];
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

  const row = item.payload;
  const cur = Number(row.current ?? 0);
  const mx = Number(row.max ?? 0);

  const crossed = row.crossedIndex >= 0 ? legend[row.crossedIndex] : undefined;
  const next =
    row.crossedIndex + 1 < legend.length
      ? legend[row.crossedIndex + 1]
      : undefined;

  const nextVal =
    row.crossedIndex + 1 < vals.length ? vals[row.crossedIndex + 1] : null;
  const gap = nextVal != null ? Math.max(0, nextVal - cur) : null;

  return (
    <div className="min-w-[260px] rounded-md border bg-popover/95 p-3 text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">{row.account}</div>
        <Badge variant="secondary" className="shrink-0">
          {dayLabel(cur)} current
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
                Current crossed{" "}
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
                  ({gap} day(s) away)
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        <div className="mt-1 text-muted-foreground">
          Max losing streak: <span className="font-medium">{dayLabel(mx)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- component ---------------- */
export default function ConsecutiveLosingDaysThresholdsCard({
  perAccounts,
  levels = [
    { value: 4, label: "4d" },
    { value: 6, label: "6d" },
    { value: 10, label: "10d" },
    { value: 14, label: "14d" },
  ],
  levelColors = ["var(--chart-5)", "#FFA94D", "#FF7043", "var(--chart-1)"],
  defaultBarColor = CURRENT_HEX,
}: {
  perAccounts?: Record<string, MetricsSlim>;
  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
}) {
  const [sortMode, setSortMode] = React.useState<SortMode>("current-desc");

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

  const sortedRows: Row[] = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      switch (sortMode) {
        case "alpha-asc":
          return a.account.localeCompare(b.account, undefined, {
            sensitivity: "base",
          });
        case "alpha-desc":
          return b.account.localeCompare(a.account, undefined, {
            sensitivity: "base",
          });
        case "current-asc":
          return a.current - b.current;
        case "current-desc":
          return b.current - a.current;
        case "max-asc":
          return a.max - b.max;
        case "max-desc":
          return b.max - a.max;
        default:
          return 0;
      }
    });
    return copy;
  }, [rows, sortMode]);

  const [contentRef, { width }] = useMeasure<HTMLDivElement>();
  const rowCount = Math.max(1, sortedRows.length);

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

  const longest = sortedRows.reduce((m, r) => Math.max(m, r.account.length), 0);
  const yAxisWidth = Math.max(
    112,
    Math.min(Math.floor(width * 0.34), longest * 7 + 20)
  );

  const rightMargin = 48;
  const topMargin = 24;
  const leftMargin = 0;
  const bottomMargin = 6;

  const chartHeight =
    rowCount * (barSize + gapY) + topMargin + bottomMargin + 4;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 border-b">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <CardTitle>Consecutive Losing Days — Thresholds</CardTitle>
            <CardDescription>
              Current and <span className="text-muted-foreground">max </span>{" "}
              losing streak • dashed lines = thresholds (dont touch goods na)
            </CardDescription>
          </div>

          {/* RIGHT COLUMN: stacked — alarm/top, selection/bottom */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {anyCrossedL1 ? (
                <span className="inline-flex items-center gap-1 text-sm text-destructive">
                  <BellRing className="h-4 w-4" />
                  Alarm (crossed{" "}
                  {orderedLevels[0]!.label ?? dayLabel(orderedLevels[0]!.value)}
                  )
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Bell className="h-4 w-4" />
                  Threshold @{" "}
                  {orderedLevels[0]!.label ?? dayLabel(orderedLevels[0]!.value)}
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <Select
                value={sortMode}
                onValueChange={(v) => setSortMode(v as SortMode)}
              >
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="alpha-asc">Alphabetical (A–Z)</SelectItem>
                  <SelectItem value="alpha-desc">Alphabetical (Z–A)</SelectItem>
                  <SelectItem value="current-asc">
                    Current (Ascending)
                  </SelectItem>
                  <SelectItem value="current-desc">
                    Current (Descending)
                  </SelectItem>
                  <SelectItem value="max-asc">Max (Ascending)</SelectItem>
                  <SelectItem value="max-desc">Max (Descending)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs cursor-default"
            title="Max losing streak (muted bar)"
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/65 dark:bg-foreground/75"
            />
            <span className="text-muted-foreground">Max Losing Days</span>
          </span>

          {legendAll.map((it, i) => (
            <span
              key={it.label}
              className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs cursor-default"
              title={it.label}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: it.color }}
              />
              <span className="text-muted-foreground">
                {it.label} • {crossedCounts[i]} crossed
              </span>
            </span>
          ))}
        </div>
      </CardHeader>

      <CardContent
        ref={contentRef}
        className="
          p-2
          [--maxbar-color:var(--muted-foreground)]
          [--maxbar-fill:0.28] [--maxbar-stroke:0.50]
          dark:[--maxbar-color:var(--foreground)]
          dark:[--maxbar-fill:0.68] dark:[--maxbar-stroke:0.85]
        "
      >
        {!sortedRows.length ? (
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
              data={sortedRows}
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

              <ReTooltip
                cursor={{ strokeOpacity: 0.08 }}
                content={({ active, payload }) => (
                  <StreakThresholdTooltip
                    active={active}
                    payload={
                      (payload as unknown as TooltipItem[] | undefined) ?? []
                    }
                    legend={legendAll}
                    vals={vals}
                  />
                )}
              />

              <Bar
                dataKey="max"
                barSize={barSize}
                radius={4}
                fill={MAX_BAR_FILL}
                fillOpacity={MAX_BAR_FILL_OPACITY}
              >
                <LabelList
                  dataKey="max"
                  position="right"
                  offset={8}
                  className="fill-foreground"
                  formatter={(v: number) => `${v}d`}
                  fontSize={12}
                />
              </Bar>

              <Bar dataKey="current" radius={4} barSize={barSize}>
                {sortedRows.map((r) => (
                  <Cell key={r.account} fill={r.color || CURRENT_HEX} />
                ))}
                <LabelList
                  dataKey="current"
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

/* layout constants used above */
const leftMargin = 0;
const rightMargin = 48;
const topMargin = 24;
const bottomMargin = 6;
