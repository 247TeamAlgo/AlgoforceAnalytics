// app/(analytics)/analytics/components/performance-metrics/CombinedDrawdownCard.tsx
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
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MetricsPayload } from "../../lib/types";

/** Negative decimal; -0.035 == -3.5% */
type ThresholdLevel = { value: number; label?: string };

type Row = {
  account: string;
  ddMag: number; // positive magnitude (e.g., 0.1083 for -10.83%)
  crossedIndex: number; // -1 if none, else index of highest crossed level
  color: string; // bar color (by crossed level)
};

const chartConfig: ChartConfig = {
  ddMag: { label: "Min Drawdown", color: "var(--chart-2)" },
};

function pctFromDecimal(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function pctFromMag(m: number): string {
  return `-${(m * 100).toFixed(2)}%`;
}

/** Most-negative drawdown magnitude in the selected window. */
function minDrawdownMagnitude(payload: MetricsPayload): number {
  const rows = payload.daily_return_last_n_days.daily_rows;
  if (!rows.length) return 0;

  let equity =
    typeof rows[0]?.start_balance === "number"
      ? rows[0]!.start_balance
      : payload.initial_balance;

  let peak = equity;
  let minDD = 0;
  for (const r of rows) {
    equity =
      typeof r.end_balance === "number" ? r.end_balance : equity + r.net_pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? equity / peak - 1 : 0;
    if (dd < minDD) minDD = dd;
  }
  return Math.abs(minDD);
}

/** Measure container (MutableRef to avoid TS whining). */
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

function build(
  perAccounts: Record<string, MetricsPayload> | undefined,
  levels: ThresholdLevel[],
  levelColors: string[],
  defaultBarColor: string
) {
  const orderedLevels = [...levels].sort(
    (a, b) => Math.abs(a.value) - Math.abs(b.value)
  );
  const mags = orderedLevels.map((l) => Math.abs(l.value));

  const rows: Row[] = perAccounts
    ? Object.entries(perAccounts).map(([account, payload]) => {
        const mag = minDrawdownMagnitude(payload);
        let idx = -1;
        for (let i = 0; i < mags.length; i += 1) {
          if (mag >= mags[i]) idx = i;
          else break;
        }
        const color =
          idx >= 0 ? (levelColors[idx] ?? defaultBarColor) : defaultBarColor;
        return { account, ddMag: mag, crossedIndex: idx, color };
      })
    : [];

  rows.sort((a, b) => b.ddMag - a.ddMag);

  const maxData = rows.reduce((m, r) => Math.max(m, r.ddMag), 0);
  const maxLevel = mags.reduce((m, v) => Math.max(m, v), 0);
  const xMax = Math.max(maxData, maxLevel) * 1.06 || 0.02;

  // Legend (full)
  const legendAll = orderedLevels.map((l, i) => ({
    x: Math.abs(l.value),
    label: l.label ?? pctFromDecimal(l.value),
    color: levelColors[i] ?? defaultBarColor,
  }));

  // Show thresholds only up to the *next* threshold after the current worst drawdown.
  // Example: worst = 4.5% -> show 3.5% and 5.0%, but NOT 7.5%+.
  const nextIdx = Math.min(
    legendAll.findIndex((t) => t.x >= maxData) === -1
      ? legendAll.length - 1
      : legendAll.findIndex((t) => t.x >= maxData),
    legendAll.length - 1
  );
  const visibleLegend = legendAll.slice(0, nextIdx + 1);
  const visibleMags = mags.slice(0, nextIdx + 1);

  // Crossed counts for legend tooltips
  const crossedCounts = visibleMags.map(
    (m) => rows.filter((r) => r.ddMag >= m).length
  );

  const anyCrossedL1 = rows.some((r) => r.crossedIndex >= 0);

  return {
    rows,
    xMax,
    legendAll, // full list (unused by chart now)
    visibleLegend, // used by chart and legend UI
    crossedCounts, // per visible level
    anyCrossedL1,
    orderedLevels,
    mags,
    maxData,
  };
}

/** ---------- Custom Tooltip (icons + badges) ---------- */
type TooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; payload: Row }>;
  legend: Array<{ x: number; label: string; color: string }>;
  mags: number[];
};

function CombinedDDTooltip(props: TooltipProps) {
  const { active, payload, legend, mags } = props;
  const item = payload?.[0];
  if (!active || !item) return null;

  const val = Number(item.value ?? 0);
  const row = item.payload as Row;

  const crossed = row.crossedIndex >= 0 ? legend[row.crossedIndex] : undefined;
  const next =
    row.crossedIndex + 1 < legend.length
      ? legend[row.crossedIndex + 1]
      : undefined;

  const nextMag =
    row.crossedIndex + 1 < mags.length ? mags[row.crossedIndex + 1] : null;
  const gapPct =
    nextMag != null ? Math.max(0, nextMag - row.ddMag) * 100 : null;

  return (
    <div className="min-w-[240px] rounded-md border bg-popover/95 p-3 text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">{row.account}</div>
        <Badge variant="secondary" className="shrink-0">
          {pctFromMag(val)}
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
              {gapPct != null ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({gapPct.toFixed(2)}% away)
                </span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** ---------- Component ---------- */
export default function CombinedDrawdownCard({
  perAccounts,
  levels = [
    { value: -0.035, label: "-3.5%" },
    { value: -0.05, label: "-5.0%" },
    { value: -0.075, label: "-7.5%" },
    { value: -0.1, label: "-10%" },
    { value: -0.15, label: "-15%" },
  ],
  // Blue → warmer → deep red (no HSL).
  levelColors = [
    "var(--chart-5)", // mild (start at a theme blue/teal)
    "#FFA94D", // orange
    "#FF7043", // orange-red
    "var(--chart-1)", // stronger
    "#C62828", // deep red
  ],
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
    visibleLegend,
    crossedCounts,
    anyCrossedL1,
    orderedLevels,
    mags,
  } = React.useMemo(
    () => build(perAccounts, levels, levelColors, defaultBarColor),
    [perAccounts, levels, levelColors, defaultBarColor]
  );

  const [contentRef, { width }] = useMeasure<HTMLDivElement>();
  const rowCount = Math.max(1, rows.length);

  // Bars & spacing scale with width + rows; use the space aggressively.
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

  // Y-axis width (auto; cap to ~34% of card width).
  const longest = rows.reduce((m, r) => Math.max(m, r.account.length), 0);
  const yAxisWidth = Math.max(
    112,
    Math.min(Math.floor(width * 0.34), longest * 7 + 20)
  );

  // Minimal margins; keep labels safe.
  const rightLabelChars = 8; // "-12.34%"
  const rightMargin = Math.max(12, 6 + rightLabelChars * 6);
  const topMargin = 24; // room for threshold labels
  const leftMargin = 0;
  const bottomMargin = 6;

  // Chart height: tight packing.
  const chartHeight =
    rowCount * (barSize + gapY) + topMargin + bottomMargin + 4;

  return (
    <Card className="w-full">
      {/* Header + separator */}
      <CardHeader className="pb-2 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Drawdown Thresholds — Per Account</CardTitle>
            <CardDescription>
              Bars = min drawdown (magnitude) • vertical dashed lines =
              thresholds (with legend).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {anyCrossedL1 ? (
              <span className="inline-flex items-center gap-1 text-sm text-destructive">
                <BellRing className="h-4 w-4" />
                Alarm (crossed{" "}
                {orderedLevels[0]!.label ??
                  pctFromDecimal(orderedLevels[0]!.value)}
                )
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Bell className="h-4 w-4" />
                Threshold @{" "}
                {orderedLevels[0]!.label ??
                  pctFromDecimal(orderedLevels[0]!.value)}
              </span>
            )}
          </div>
        </div>

        {/* Legend (pills) with tooltips */}
        <TooltipProvider>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {visibleLegend.map((it, i) => (
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
                    Triggers when any account’s min drawdown ≤ {it.label}.
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
        {rows.length === 0 ? (
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
                domain={[0, xMax]}
                tickFormatter={(v: number) => `-${Math.round(v * 100)}%`}
              />

              {/* Only the VISIBLE thresholds (up to next beyond worst) */}
              {visibleLegend.map((it) => (
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
                  <CombinedDDTooltip legend={visibleLegend} mags={mags} />
                }
              />

              <Bar
                dataKey="ddMag"
                layout="vertical"
                radius={4}
                barSize={barSize}
              >
                {rows.map((r) => (
                  <Cell key={r.account} fill={r.color} />
                ))}
                <LabelList
                  dataKey="ddMag"
                  position="right"
                  offset={8}
                  className="fill-foreground"
                  formatter={(v: number) => pctFromMag(v)}
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
