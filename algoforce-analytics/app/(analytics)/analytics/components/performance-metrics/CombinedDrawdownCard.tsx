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
type MonthMode = `m:${string}` | "worst"; // m:YYYY-MM or worst across range

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

/* ---------------- helpers ---------------- */

function monthKey(isoDay: string): string {
  return isoDay.slice(0, 7); // "YYYY-MM"
}
function monthLabel(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleString(undefined, { month: "short", year: "numeric" });
}
function sortDaily(d: NonNullable<MetricsSlim["daily"]>): typeof d {
  return [...d].sort((a, b) => a.day.localeCompare(b.day));
}

/** Build equity for full window; optionally adjust last point by live delta. */
function buildEquityFull(
  initial: number,
  daily: NonNullable<MetricsSlim["daily"]>,
  liveDelta?: number
): number[] {
  const d = sortDaily(daily);
  const eq: number[] = [initial];
  let bal = initial;
  const lastIdx = d.length - 1;

  for (let i = 0; i < d.length; i += 1) {
    let net = ensureNumber(d[i]!.net_pnl, 0);
    if (i === lastIdx && liveDelta) net += liveDelta;
    bal += net;
    eq.push(bal);
  }
  return eq; // length = d.length + 1
}

/** Max drawdown magnitude over an equity slice (array of equity *levels*). */
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

/* ---------- monthly DD (specific month) for a single account ---------- */
/**
 * Returns the max DD magnitude *within target month*, with peak reset at the start of that month.
 * Live UPNL (delta) is applied to the final equity point only if the target month is the last
 * month present in this account’s daily series and a live delta is provided.
 */
function monthlyDDforMonth_Account(
  acc: MetricsSlim,
  targetMonth: string,
  liveDeltaMaybe?: number
): number {
  const daily = sortDaily(acc.daily ?? []);
  if (!daily.length) return 0;

  const months = Array.from(new Set(daily.map((r) => monthKey(r.day)))).sort();
  const accLastMonth = months[months.length - 1];

  // Build equity without live first to get month boundary values
  const eqNoLive = buildEquityFull(
    ensureNumber(acc.initial_balance, 0),
    daily,
    0
  );

  // slice indices for the target month
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < daily.length; i += 1) {
    if (monthKey(daily[i]!.day) === targetMonth) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    }
  }
  if (firstIdx < 0 || lastIdx < 0) return 0;

  // Build the equity slice for that month: start level then each day end level
  const slice = eqNoLive.slice(firstIdx + 1, lastIdx + 2);

  // If month is the last month for the account, add live delta to the final point
  if (targetMonth === accLastMonth && liveDeltaMaybe) {
    slice[slice.length - 1] =
      slice[slice.length - 1]! + ensureNumber(liveDeltaMaybe, 0);
  }

  return minDrawdownMagnitudeFromEquity(slice);
}

/* ---------- monthly DD (specific month) for Combined ("All") ---------- */
function monthlyDDforMonth_Combined(
  perAccounts: Record<string, MetricsSlim>,
  targetMonth: string,
  combinedLiveDeltaMaybe?: number
): number {
  const keys = Object.keys(perAccounts);
  if (!keys.length) return 0;

  // Build per-day net sums and initial total
  let initial = 0;
  const agg = new Map<string, number>(); // day -> net
  for (const k of keys) {
    const m = perAccounts[k]!;
    initial += ensureNumber(m.initial_balance, 0);
    for (const r of m.daily ?? []) {
      agg.set(
        r.day,
        ensureNumber(agg.get(r.day), 0) + ensureNumber(r.net_pnl, 0)
      );
    }
  }

  const days = Array.from(agg.keys()).sort();
  if (!days.length) return 0;

  // Determine months present in combined series
  const months = Array.from(new Set(days.map(monthKey))).sort();
  const combinedLastMonth = months[months.length - 1];

  // Build combined equity without live
  const eqNoLive: number[] = [initial];
  let bal = initial;
  for (const d of days) {
    bal += ensureNumber(agg.get(d), 0);
    eqNoLive.push(bal);
  }

  // locate first and last index for the target month
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < days.length; i += 1) {
    if (monthKey(days[i]!) === targetMonth) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    }
  }
  if (firstIdx < 0 || lastIdx < 0) return 0;

  const slice = eqNoLive.slice(firstIdx + 1, lastIdx + 2);

  if (targetMonth === combinedLastMonth && combinedLiveDeltaMaybe) {
    slice[slice.length - 1] =
      slice[slice.length - 1]! + ensureNumber(combinedLiveDeltaMaybe, 0);
  }

  return minDrawdownMagnitudeFromEquity(slice);
}

/* ---------- worst (max) monthly DD over a set of months ---------- */
function worstMonthlyDD_Account(
  acc: MetricsSlim,
  months: string[],
  liveDeltaMaybe?: number
): number {
  if (!months.length) return 0;
  const lastMonthForAcc = Array.from(
    new Set((acc.daily ?? []).map((r) => monthKey(r.day)))
  )
    .sort()
    .at(-1);
  let worst = 0;
  for (const mk of months) {
    const useLive = mk === lastMonthForAcc ? liveDeltaMaybe : 0;
    const v = monthlyDDforMonth_Account(acc, mk, useLive);
    if (v > worst) worst = v;
  }
  return worst;
}
function worstMonthlyDD_Combined(
  perAccounts: Record<string, MetricsSlim>,
  months: string[],
  combinedLiveDeltaMaybe?: number
): number {
  if (!months.length) return 0;
  const allDays = new Set<string>();
  for (const m of Object.values(perAccounts))
    (m.daily ?? []).forEach((r) => allDays.add(r.day));
  const lastMonthCombined = Array.from(allDays)
    .sort()
    .map(monthKey)
    .sort()
    .at(-1);

  let worst = 0;
  for (const mk of months) {
    const useLive = mk === lastMonthCombined ? combinedLiveDeltaMaybe : 0;
    const v = monthlyDDforMonth_Combined(perAccounts, mk, useLive);
    if (v > worst) worst = v;
  }
  return worst;
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
  modeLabel: string; // generic label like "Aug 2025", "worst month", "current"
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
          {pctFromMag(val)} {modeLabel}
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
  // IMPORTANT: deltas (now - baseline) to avoid double counting realized PnL.
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

  // Detect months present across all accounts (union)
  const monthsInRange = React.useMemo(() => {
    const set = new Set<string>();
    for (const k of keys)
      (accounts[k]!.daily ?? []).forEach((r) => set.add(monthKey(r.day)));
    return Array.from(set).sort();
  }, [accounts, keys]);

  // local month mode (default to last month if exists; else worst)
  const [monthMode, setMonthMode] = React.useState<MonthMode>(() =>
    monthsInRange.length
      ? (`m:${monthsInRange[monthsInRange.length - 1]}` as MonthMode)
      : "worst"
  );
  React.useEffect(() => {
    if (!monthsInRange.length) {
      setMonthMode("worst");
      return;
    }
    const current = monthMode.startsWith("m:") ? monthMode.slice(2) : "";
    if (!current || !monthsInRange.includes(current)) {
      setMonthMode(`m:${monthsInRange[monthsInRange.length - 1]}` as MonthMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsInRange.join("|")]);

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
      const delta = ensureNumber(
        (upnlDeltaMap as Record<string, unknown>)[k],
        0
      );

      let mag = 0;

      if (drawdownMode === "monthly") {
        if (!monthsInRange.length) {
          mag = 0;
        } else if (monthMode === "worst") {
          mag = worstMonthlyDD_Account(acc, monthsInRange, delta);
        } else {
          const mkey = monthMode.slice(2); // YYYY-MM
          // include live only when this month is the last month for this account
          const accMonths = Array.from(
            new Set((acc.daily ?? []).map((r) => monthKey(r.day)))
          ).sort();
          const accLastMonth = accMonths.at(-1);
          const liveForThisMonth = mkey === accLastMonth ? delta : 0;
          mag = monthlyDDforMonth_Account(acc, mkey, liveForThisMonth);
        }
      } else if (drawdownMode === "current") {
        // current vs last peak over full window
        const eq = buildEquityFull(
          ensureNumber(acc.initial_balance, 0),
          acc.daily ?? [],
          delta
        );
        if (eq.length) {
          let peak = eq[0]!;
          const last = eq[eq.length - 1]!;
          for (const v of eq) if (v > peak) peak = v;
          mag = peak > 0 && last < peak ? (peak - last) / peak : 0;
        }
      } else {
        // minimum (worst) over entire window
        const eq = buildEquityFull(
          ensureNumber(acc.initial_balance, 0),
          acc.daily ?? [],
          delta
        );
        mag = minDrawdownMagnitudeFromEquity(eq);
      }

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
      let magC = 0;

      if (drawdownMode === "monthly") {
        if (!monthsInRange.length) {
          magC = 0;
        } else if (monthMode === "worst") {
          magC = worstMonthlyDD_Combined(
            accounts,
            monthsInRange,
            ensureNumber(combinedUpnlDelta, 0)
          );
        } else {
          const mkey = monthMode.slice(2);
          const allDays = new Set<string>();
          for (const m of Object.values(accounts))
            (m.daily ?? []).forEach((r) => allDays.add(r.day));
          const lastMonthCombined = Array.from(allDays)
            .sort()
            .map(monthKey)
            .sort()
            .at(-1);
          const liveForThisMonth =
            mkey === lastMonthCombined ? ensureNumber(combinedUpnlDelta, 0) : 0;
          magC = monthlyDDforMonth_Combined(accounts, mkey, liveForThisMonth);
        }
      } else if (drawdownMode === "current") {
        // combined current DD over full window
        const agg = new Map<string, number>();
        let init = 0;
        for (const k of Object.keys(accounts)) {
          const m = accounts[k]!;
          init += ensureNumber(m.initial_balance, 0);
          for (const r of m.daily ?? []) {
            agg.set(
              r.day,
              ensureNumber(agg.get(r.day), 0) + ensureNumber(r.net_pnl, 0)
            );
          }
        }
        const days = Array.from(agg.keys()).sort();
        const eq: number[] = [init];
        let bal = init;
        for (const d of days) {
          bal += ensureNumber(agg.get(d), 0);
          eq.push(bal);
        }
        if (eq.length) {
          eq[eq.length - 1] =
            eq[eq.length - 1]! + ensureNumber(combinedUpnlDelta, 0);
          let peak = eq[0]!;
          const last = eq[eq.length - 1]!;
          for (const v of eq) if (v > peak) peak = v;
          magC = peak > 0 && last < peak ? (peak - last) / peak : 0;
        }
      } else {
        // combined minimum DD over full window
        const agg = new Map<string, number>();
        let init = 0;
        for (const k of Object.keys(accounts)) {
          const m = accounts[k]!;
          init += ensureNumber(m.initial_balance, 0);
          for (const r of m.daily ?? []) {
            agg.set(
              r.day,
              ensureNumber(agg.get(r.day), 0) + ensureNumber(r.net_pnl, 0)
            );
          }
        }
        const days = Array.from(agg.keys()).sort();
        const eq: number[] = [init];
        let bal = init;
        for (const d of days) {
          bal += ensureNumber(agg.get(d), 0);
          eq.push(bal);
        }
        eq[eq.length - 1] =
          eq[eq.length - 1]! + ensureNumber(combinedUpnlDelta, 0);
        magC = minDrawdownMagnitudeFromEquity(eq);
      }

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
    monthsInRange,
    monthMode,
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

  const contextLabel =
    drawdownMode === "monthly"
      ? monthMode === "worst"
        ? "worst month"
        : monthLabel(monthMode.slice(2))
      : drawdownMode === "current"
        ? "current"
        : "minimum (window)";

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 border-b space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 md:max-w-[60%]">
            <CardTitle className="truncate">
              Drawdown Thresholds — Per Account + All
            </CardTitle>
            <CardDescription className="mt-1">
              {drawdownMode === "monthly"
                ? "Monthly max drawdown (pick a month or show worst across range)."
                : drawdownMode === "current"
                  ? "Current drawdown (vs last peak)."
                  : "Minimum drawdown across the full window."}{" "}
              Latest point includes live UPNL delta only when applicable.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            {anyCrossedL1 ? (
              <span className="inline-flex items-center gap-1 text-sm text-destructive shrink-0">
                <BellRing className="h-4 w-4" />
                Alarm (crossed {legendAll[0]!.label})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground shrink-0">
                <Bell className="h-4 w-4" />
                Threshold @ {legendAll[0]!.label}
              </span>
            )}

            {upnlAsOf ? (
              <span className="text-xs text-muted-foreground shrink-0">
                UPNL as of {new Date(upnlAsOf).toLocaleTimeString()}
              </span>
            ) : null}

            {/* Month selector (only in monthly mode) */}
            {drawdownMode === "monthly" ? (
              <Select
                value={monthMode}
                onValueChange={(v) => setMonthMode(v as MonthMode)}
              >
                <SelectTrigger className="h-8 min-w-[180px] md:w-[240px]">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent align="end">
                  {monthsInRange.map((mk) => (
                    <SelectItem key={mk} value={`m:${mk}` as MonthMode}>
                      {monthLabel(mk)}
                    </SelectItem>
                  ))}
                  <SelectItem value="worst">
                    Across range (worst month)
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : null}

            {/* Sort selector */}
            <Select
              value={sortMode}
              onValueChange={(v) => setSortMode(v as SortMode)}
            >
              <SelectTrigger className="h-8 min-w-[180px] md:w-[220px]">
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

        {/* thresholds + context pill */}
        <div className="grid auto-cols-max grid-flow-col gap-2 overflow-x-auto pb-1">
          {legendAll.map((it, i) => (
            <span
              key={it.label}
              className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs cursor-default whitespace-nowrap"
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
          <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs cursor-default whitespace-nowrap">
            <span className="text-muted-foreground">View: {contextLabel}</span>
          </span>
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
                    modeLabel={contextLabel}
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
