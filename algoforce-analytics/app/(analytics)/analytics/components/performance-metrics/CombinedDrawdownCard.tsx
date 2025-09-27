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

import type { MetricsSlim } from "../../lib/types";

/** Negative decimal thresholds; e.g. -0.10 means -10% */
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

/* --------------------------- layout helpers --------------------------- */
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

/* ------------------------------- build ------------------------------- */
function buildRows(
  mags: number[],
  levelColors: string[],
  defaultBarColor: string,
  perAccounts?: Record<string, MetricsSlim>,
  includeCombined?: boolean,
  combinedLabel?: string,
  merged?: MetricsSlim | null
): Row[] {
  const toRow = (label: string, mag: number): Row => {
    let idx = -1;
    for (let i = 0; i < mags.length; i += 1) {
      if (mag >= mags[i]) idx = i;
      else break;
    }
    const color =
      idx >= 0 ? (levelColors[idx] ?? defaultBarColor) : defaultBarColor;
    return { account: label, ddMag: mag, crossedIndex: idx, color };
  };

  const rows: Row[] = perAccounts
    ? Object.entries(perAccounts)
        .map(([account, payload]) => toRow(account, payload.drawdown_mag ?? 0))
        .sort((a, b) => b.ddMag - a.ddMag)
    : [];

  if (includeCombined && merged) {
    rows.push(toRow(combinedLabel ?? "all", merged.drawdown_mag ?? 0));
  }

  return rows;
}

/* ------------------------------ tooltip ------------------------------ */
type TooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; payload: Row }>;
  legend: Array<{ x: number; label: string; color: string }>;
  mags: number[];
};

function CombinedDDTooltip(props: TooltipProps) {
  const { active, payload, legend, mags } = props;
  const item = payload?.[0];
  if (!active || item == null) return null;

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

/* ---------------------------- component ---------------------------- */
export default function CombinedDrawdownCard({
  perAccounts,
  merged,

  // thresholds & styling
  levels = [
    { value: -0.035, label: "-3.5%" },
    { value: -0.05, label: "-5.0%" },
    { value: -0.075, label: "-7.5%" },
    { value: -0.1, label: "-10%" },
    { value: -0.15, label: "-15%" },
  ],
  levelColors = [
    "var(--chart-5)",
    "#FFA94D",
    "#FF7043",
    "var(--chart-1)",
    "#C62828",
  ],
  defaultBarColor = "#39A0ED",
  includeCombined = true,
  combinedLabel = "all",
}: {
  perAccounts?: Record<string, MetricsSlim>;
  merged?: MetricsSlim | null;

  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
  includeCombined?: boolean;
  combinedLabel?: string;
}) {
  const orderedLevels = React.useMemo(
    () => [...levels].sort((a, b) => Math.abs(a.value) - Math.abs(b.value)),
    [levels]
  );
  const mags = React.useMemo(
    () => orderedLevels.map((l) => Math.abs(l.value)),
    [orderedLevels]
  );

  const rows: Row[] = React.useMemo(
    () =>
      buildRows(
        mags,
        levelColors,
        defaultBarColor,
        perAccounts,
        includeCombined,
        combinedLabel,
        merged ?? null
      ),
    [
      mags,
      levelColors,
      defaultBarColor,
      perAccounts,
      includeCombined,
      combinedLabel,
      merged,
    ]
  );

  const maxData = rows.reduce((m, r) => Math.max(m, r.ddMag), 0);
  const maxLevel = mags.reduce((m, v) => Math.max(m, v), 0);
  const xMax = Math.max(maxData, maxLevel) * 1.06 || 0.02;

  const legendAll = orderedLevels.map((l, i) => ({
    x: Math.abs(l.value),
    label: l.label ?? pctFromDecimal(l.value),
    color: levelColors[i] ?? defaultBarColor,
  }));

  const crossedCountsAll = mags.map(
    (m) => rows.filter((r) => r.ddMag >= m).length
  );

  const anyCrossedL1 = rows.some((r) => r.crossedIndex >= 0);

  const [contentRef, { width }] = useMeasure<HTMLDivElement>();
  const rowCount = Math.max(1, rows.length);

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

  const rightLabelChars = 8; // "-12.34%"
  const rightMargin = Math.max(12, 6 + rightLabelChars * 6);
  const topMargin = 24;
  const leftMargin = 0;
  const bottomMargin = 6;

  const chartHeight =
    rowCount * (barSize + gapY) + topMargin + bottomMargin + 4;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Drawdown Thresholds — Per Account + All</CardTitle>
            <CardDescription>
              Bars = min drawdown (magnitude) • vertical dashed lines =
              thresholds
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

        {/* FULL legend */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
              <span className="text-muted-foreground">{it.label}</span>
              <span className="text-muted-foreground">
                ({crossedCountsAll[i]})
              </span>
            </span>
          ))}
        </div>
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
                domain={[0, xMax]}
                tickFormatter={(v: number) => `-${Math.round(v * 100)}%`}
              />

              {/* FULL set of threshold reference lines */}
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
                content={<CombinedDDTooltip legend={legendAll} mags={mags} />}
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
