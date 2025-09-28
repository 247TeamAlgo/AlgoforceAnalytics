// app/(analytics)/analytics/components/performance-metrics/CombinedDrawdownCard.tsx
"use client";

import * as React from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  BellRing,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { MetricsSlim } from "../../lib/performance_metric_types";

/** Level thresholds are magnitudes: 0.035 === 3.5% drawdown */
type ThresholdLevel = { value: number; label?: string };

type Row = {
  account: string;
  ddMag: number; // magnitude in [0..)
  crossedIndex: number; // highest crossed threshold index, -1 if none
  color: string;
  isCombined?: boolean; // keep “All” pinned to bottom
};

type DrawdownMode = "monthly" | "current" | "min";
type SortMode = "alpha-asc" | "alpha-desc" | "dd-asc" | "dd-desc";

const chartConfig: ChartConfig = {
  ddMag: { label: "Drawdown", color: "var(--chart-2)" },
};

function pctFromMag(m: number): string {
  return `-${(m * 100).toFixed(2)}%`;
}
function ensureNumber(n: unknown, fallback = 0): number {
  if (typeof n === "number") return Number.isFinite(n) ? n : fallback;
  if (typeof n === "string") {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }
  return fallback;
}

/* ---------------- equity + drawdown math ---------------- */

function buildEquitySeriesWithUpnlDelta(
  acc: MetricsSlim,
  upnlDelta: unknown
): number[] {
  const init = ensureNumber(acc.initial_balance, 0);
  const days = [...(acc.daily ?? [])].sort((a, b) =>
    a.day.localeCompare(b.day)
  );

  let bal = init;
  const eq: number[] = [bal];
  const lastIdx = days.length - 1;

  for (let i = 0; i < days.length; i += 1) {
    const net0 = ensureNumber(days[i]!.net_pnl, 0);
    const net = i === lastIdx ? net0 + ensureNumber(upnlDelta, 0) : net0;
    bal += net;
    eq.push(bal);
  }
  return eq;
}

function buildCombinedEquityWithUpnlDelta(
  perAccounts: Record<string, MetricsSlim>,
  combinedUpnlDelta?: unknown
): number[] {
  const keys = Object.keys(perAccounts);
  if (!keys.length) return [0];

  const daySet = new Set<string>();
  for (const k of keys)
    for (const r of perAccounts[k]!.daily) daySet.add(r.day);
  const dayOrder = Array.from(daySet).sort();

  const byDay = new Map<string, number>();
  for (const k of keys) {
    for (const r of perAccounts[k]!.daily) {
      byDay.set(
        r.day,
        ensureNumber(byDay.get(r.day), 0) + ensureNumber(r.net_pnl, 0)
      );
    }
  }

  const initTotal = keys.reduce(
    (s, k) => s + ensureNumber(perAccounts[k]!.initial_balance, 0),
    0
  );

  const eq: number[] = [initTotal];
  let bal = initTotal;
  for (const d of dayOrder) {
    bal += ensureNumber(byDay.get(d), 0);
    eq.push(bal);
  }

  const u = ensureNumber(combinedUpnlDelta, 0);
  if (u !== 0 && eq.length > 0) eq[eq.length - 1] = eq[eq.length - 1]! + u;
  return eq;
}

/** Max drawdown magnitude over series. */
function minDrawdownMagnitudeFromEquity(eq: number[]): number {
  if (eq.length === 0) return 0;
  let peak = eq[0]!;
  let minDD = 0;
  for (let i = 0; i < eq.length; i += 1) {
    const v = eq[i]!;
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1; // ≤ 0
      if (dd < minDD) minDD = dd;
    }
  }
  return Math.abs(minDD);
}

/** Current drawdown magnitude from latest vs peak. */
function currentDrawdownMagnitudeFromEquity(eq: number[]): number {
  if (eq.length === 0) return 0;
  let peak = eq[0]!;
  for (let i = 1; i < eq.length; i += 1) if (eq[i]! > peak) peak = eq[i]!;
  if (peak <= 0) return 0;
  const last = eq[eq.length - 1]!;
  const dd = last / peak - 1;
  return dd < 0 ? -dd : 0;
}

function monthKey(isoDay: string): string {
  return isoDay.slice(0, 7);
}

/** Latest month’s min drawdown magnitude from account daily (inject delta only on last day). */
function latestMonthlyMinDDFromAccount(
  acc: MetricsSlim,
  upnlDelta: unknown
): number {
  const daily = [...(acc.daily ?? [])].sort((a, b) =>
    a.day.localeCompare(b.day)
  );
  if (daily.length === 0) return 0;

  const init = ensureNumber(acc.initial_balance, 0);
  let bal = init;
  const lastIdx = daily.length - 1;

  let curMonth = "";
  let monthPeak = Number.NEGATIVE_INFINITY;
  let monthMinDD = 0; // ≤ 0

  for (let i = 0; i < daily.length; i += 1) {
    const r = daily[i]!;
    const net0 = ensureNumber(r.net_pnl, 0);
    const net = i === lastIdx ? net0 + ensureNumber(upnlDelta, 0) : net0;

    bal += net;

    const mk = monthKey(r.day);
    if (mk !== curMonth) {
      curMonth = mk;
      monthPeak = bal;
      monthMinDD = 0;
    } else if (bal > monthPeak) {
      monthPeak = bal;
    }

    if (monthPeak > 0) {
      const dd = bal / monthPeak - 1;
      if (dd < monthMinDD) monthMinDD = dd;
    }
  }
  return Math.abs(monthMinDD);
}

/** Latest month’s min drawdown for combined. */
function latestMonthlyMinDDCombined(
  perAccounts: Record<string, MetricsSlim>,
  combinedUpnlDelta?: unknown
): number {
  const keys = Object.keys(perAccounts);
  if (!keys.length) return 0;

  const agg = new Map<string, number>(); // day -> net sum
  let initial = 0;
  for (const k of keys) {
    const m = perAccounts[k]!;
    initial += ensureNumber(m.initial_balance, 0);
    for (const r of m.daily) {
      agg.set(
        r.day,
        ensureNumber(agg.get(r.day), 0) + ensureNumber(r.net_pnl, 0)
      );
    }
  }

  const days = Array.from(agg.keys()).sort();
  if (!days.length) return 0;

  const lastDay = days[days.length - 1]!;
  let bal = initial;
  let curMonth = "";
  let monthPeak = Number.NEGATIVE_INFINITY;
  let monthMinDD = 0;

  for (const d of days) {
    let net = ensureNumber(agg.get(d), 0);
    if (d === lastDay) net += ensureNumber(combinedUpnlDelta, 0);
    bal += net;

    const mk = monthKey(d);
    if (mk !== curMonth) {
      curMonth = mk;
      monthPeak = bal;
      monthMinDD = 0;
    } else if (bal > monthPeak) {
      monthPeak = bal;
    }

    if (monthPeak > 0) {
      const dd = bal / monthPeak - 1;
      if (dd < monthMinDD) monthMinDD = dd;
    }
  }
  return Math.abs(monthMinDD);
}

/* ---------------- UI sizing helpers ---------------- */

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

/* ---------------- tooltip ---------------- */

function DrawdownThresholdTooltip({
  active,
  payload,
  legend,
  mags,
  modeLabel,
}: {
  active?: boolean;
  payload?: unknown[];
  legend: Array<{ x: number; label: string; color: string }>;
  mags: number[];
  modeLabel: "Monthly" | "Current" | "Minimum";
}) {
  const item = Array.isArray(payload) ? (payload[0] as unknown) : undefined;
  const rowObj =
    item &&
    typeof item === "object" &&
    "payload" in (item as Record<string, unknown>)
      ? ((item as { payload?: unknown }).payload as Record<string, unknown>)
      : undefined;

  if (!active || !rowObj) return null;

  const accountLabel = String(rowObj["account"] ?? "");
  const val = ensureNumber(rowObj["ddMag"], 0);
  const crossedIndex = ensureNumber(rowObj["crossedIndex"], -1);

  const crossed = crossedIndex >= 0 ? legend[crossedIndex] : undefined;
  const next =
    crossedIndex + 1 < legend.length ? legend[crossedIndex + 1] : undefined;
  const nextGap =
    crossedIndex + 1 < mags.length ? mags[crossedIndex + 1]! - val : null;

  return (
    <div className="min-w-[260px] rounded-md border bg-popover/95 p-3 text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">{accountLabel}</div>
        <Badge variant="secondary" className="shrink-0">
          {pctFromMag(val)} {modeLabel.toLowerCase()}
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
              {nextGap != null ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({(nextGap * 100).toFixed(2)}% away)
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

export default function CombinedDrawdownCard({
  perAccounts,
  // IMPORTANT: these must be DELTAS for parity; we will pass delta props from the hook.
  upnlDeltaMap = {},
  combinedUpnlDelta,
  upnlAsOf,
  levels = [
    { value: 0.035, label: "-3.5%" },
    { value: 0.05, label: "-5.0%" },
    { value: 0.075, label: "-7.5%" },
    { value: 0.1, label: "-10%" },
    { value: 0.15, label: "-15%" },
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
  combinedLabel = "All",
  drawdownMode = "monthly",
}: {
  perAccounts?: Record<string, MetricsSlim>;
  upnlDeltaMap?: Record<string, number | string>;
  combinedUpnlDelta?: number | string;
  upnlAsOf?: string;

  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
  includeCombined?: boolean;
  combinedLabel?: string;
  drawdownMode?: DrawdownMode;
}) {
  const accounts = React.useMemo<Record<string, MetricsSlim>>(
    () => perAccounts ?? {},
    [perAccounts]
  );

  const [sortMode, setSortMode] = React.useState<SortMode>("dd-desc");
  const keys = React.useMemo(() => Object.keys(accounts), [accounts]);

  const orderedLevels = React.useMemo(
    () => [...levels].sort((a, b) => a.value - b.value),
    [levels]
  );
  const mags = React.useMemo(
    () => orderedLevels.map((l) => l.value),
    [orderedLevels]
  );

  const rows: Row[] = React.useMemo(() => {
    const main: Row[] = [];

    for (const k of keys) {
      const acc = accounts[k]!;
      const delta = (upnlDeltaMap as Record<string, number | string>)[k] ?? 0;

      const mag =
        drawdownMode === "monthly"
          ? latestMonthlyMinDDFromAccount(acc, delta)
          : drawdownMode === "current"
            ? currentDrawdownMagnitudeFromEquity(
                buildEquitySeriesWithUpnlDelta(acc, delta)
              )
            : minDrawdownMagnitudeFromEquity(
                buildEquitySeriesWithUpnlDelta(acc, delta)
              );

      let idx = -1;
      for (let i = 0; i < mags.length; i += 1) {
        if (mag >= mags[i]!) idx = i;
        else break;
      }
      const color =
        idx >= 0 ? (levelColors[idx] ?? defaultBarColor) : defaultBarColor;
      main.push({ account: k, ddMag: mag, crossedIndex: idx, color });
    }

    const sorted = [...main].sort((a, b) => {
      switch (sortMode) {
        case "alpha-asc":
          return a.account.localeCompare(b.account, undefined, {
            sensitivity: "base",
          });
        case "alpha-desc":
          return b.account.localeCompare(a.account, undefined, {
            sensitivity: "base",
          });
        case "dd-asc":
          return a.ddMag - b.ddMag;
        case "dd-desc":
        default:
          return b.ddMag - a.ddMag;
      }
    });

    if (includeCombined && keys.length > 0) {
      const magC =
        drawdownMode === "monthly"
          ? latestMonthlyMinDDCombined(accounts, combinedUpnlDelta)
          : drawdownMode === "current"
            ? currentDrawdownMagnitudeFromEquity(
                buildCombinedEquityWithUpnlDelta(accounts, combinedUpnlDelta)
              )
            : minDrawdownMagnitudeFromEquity(
                buildCombinedEquityWithUpnlDelta(accounts, combinedUpnlDelta)
              );

      let idxC = -1;
      for (let i = 0; i < mags.length; i += 1) {
        if (magC >= mags[i]!) idxC = i;
        else break;
      }
      const colorC =
        idxC >= 0 ? (levelColors[idxC] ?? defaultBarColor) : defaultBarColor;
      sorted.push({
        account: combinedLabel,
        ddMag: magC,
        crossedIndex: idxC,
        color: colorC,
        isCombined: true,
      });
    }

    return sorted;
  }, [
    includeCombined,
    keys,
    accounts,
    upnlDeltaMap,
    levelColors,
    defaultBarColor,
    mags,
    combinedUpnlDelta,
    combinedLabel,
    sortMode,
    drawdownMode,
  ]);

  const maxData = React.useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.ddMag), 0),
    [rows]
  );
  const maxLevel = React.useMemo(
    () => mags.reduce((m, v) => Math.max(m, v), 0),
    [mags]
  );
  const xMax = Math.max(maxData, maxLevel) * 1.06 || 0.02;

  const legendAll = React.useMemo(
    () =>
      orderedLevels.map((l, i) => ({
        x: l.value,
        label: l.label ?? `-${(l.value * 100).toFixed(1)}%`,
        color: levelColors[i] ?? defaultBarColor,
      })),
    [orderedLevels, levelColors, defaultBarColor]
  );
  const crossedCountsAll = React.useMemo(
    () => mags.map((m) => rows.filter((r) => r.ddMag >= m).length),
    [mags, rows]
  );
  const anyCrossedL1 = React.useMemo(
    () => rows.some((r) => r.crossedIndex >= 0),
    [rows]
  );

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

  const rightLabelChars = 8;
  const rightMargin = Math.max(12, 6 + rightLabelChars * 6);
  const topMargin = 24;
  const leftMargin = 0;
  const bottomMargin = 6;
  const chartHeight =
    rowCount * (barSize + gapY) + topMargin + bottomMargin + 4;

  const modeLabel: "Monthly" | "Current" | "Minimum" =
    drawdownMode === "monthly"
      ? "Monthly"
      : drawdownMode === "current"
        ? "Current"
        : "Minimum";

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 border-b">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <CardTitle>Drawdown Thresholds — Per Account + All</CardTitle>
            <CardDescription>
              {drawdownMode === "monthly"
                ? "Monthly max drawdown (current calendar month)."
                : drawdownMode === "current"
                  ? "Current drawdown (vs last peak)."
                  : "Minimum drawdown across window."}{" "}
              Latest point includes live UPNL delta only.
            </CardDescription>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {anyCrossedL1 ? (
                <span className="inline-flex items-center gap-1 text-sm text-destructive">
                  <BellRing className="h-4 w-4" />
                  Alarm (crossed {legendAll[0]!.label})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Bell className="h-4 w-4" />
                  Threshold @ {legendAll[0]!.label}
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              {upnlAsOf ? (
                <span className="text-xs text-muted-foreground">
                  UPNL as of {new Date(upnlAsOf).toLocaleTimeString()}
                </span>
              ) : null}

              <Select
                value={sortMode}
                onValueChange={(v) => setSortMode(v as SortMode)}
              >
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="alpha-asc">Alphabetical (A–Z)</SelectItem>
                  <SelectItem value="alpha-desc">Alphabetical (Z–A)</SelectItem>
                  <SelectItem value="dd-asc">Drawdown (Ascending)</SelectItem>
                  <SelectItem value="dd-desc">Drawdown (Descending)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="mt-2 grid auto-cols-max grid-flow-col gap-2">
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
                {it.label} • {crossedCountsAll[i]} crossed
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
                cursor={{ strokeOpacity: 0.08 }}
                content={({ active, payload }) => (
                  <DrawdownThresholdTooltip
                    active={active}
                    payload={payload as unknown[]}
                    legend={legendAll}
                    mags={mags}
                    modeLabel={modeLabel}
                  />
                )}
              />

              <Bar
                dataKey="ddMag"
                layout="vertical"
                radius={4}
                barSize={barSize}
              >
                {rows.map((r, i) => (
                  <Cell key={`${r.account}-${i}`} fill={r.color} />
                ))}
                <LabelList
                  dataKey="ddMag"
                  position="right"
                  offset={8}
                  className="fill-foreground"
                  formatter={(v: number | string) =>
                    pctFromMag(ensureNumber(v, 0))
                  }
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
