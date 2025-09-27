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

import type { MetricsSlim } from "../../lib/types";

/** Level thresholds are magnitudes: 0.035 === 3.5% drawdown */
type ThresholdLevel = { value: number; label?: string };

type Row = {
  account: string;
  ddMag: number; // magnitude in [0..)
  crossedIndex: number; // highest crossed threshold index, -1 if none
  color: string;
};

type DrawdownMode = "current" | "min";

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

/** Build equity series from calendarized daily rows. Overlay live UPNL on last point. */
function buildEquitySeriesWithUpnl(acc: MetricsSlim, upnl: unknown): number[] {
  const init = ensureNumber(acc.initial_balance, 0);
  const days = acc.daily ?? [];

  // Try to use end_balance if present on series (checked via first/last row)
  const firstEb =
    days.length > 0
      ? ensureNumber((days[0] as Record<string, unknown>)["end_balance"], NaN)
      : NaN;
  const lastEb =
    days.length > 0
      ? ensureNumber(
          (days[days.length - 1] as Record<string, unknown>)["end_balance"],
          NaN
        )
      : NaN;

  let equitySeries: number[] = [];
  if (Number.isFinite(firstEb) && Number.isFinite(lastEb)) {
    equitySeries = days.map((r) =>
      ensureNumber((r as Record<string, unknown>)["end_balance"], 0)
    );
  } else {
    let bal = init;
    equitySeries = days.map((r) => {
      bal += ensureNumber((r as Record<string, unknown>)["net_pnl"], 0);
      return bal;
    });
  }

  // Prepend initial to ensure peaks are correct
  if (equitySeries.length > 0) {
    const first = equitySeries[0]!;
    if (Math.abs(first - init) > 1e-9) {
      equitySeries = [init, ...equitySeries];
    }
  } else {
    equitySeries = [init];
  }

  // Overlay live UPNL at terminal point
  const u = ensureNumber(upnl, 0);
  if (u !== 0 && equitySeries.length > 0) {
    equitySeries[equitySeries.length - 1] =
      equitySeries[equitySeries.length - 1]! + u;
  }
  return equitySeries;
}

/** Min drawdown magnitude over the whole series (peak-to-trough). */
function minDrawdownMagnitudeFromEquity(eq: number[]): number {
  if (eq.length === 0) return 0;
  let peak = eq[0]!;
  let minDD = 0;
  for (let i = 0; i < eq.length; i += 1) {
    const v = eq[i]!;
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1; // <= 0
      if (dd < minDD) minDD = dd;
    }
  }
  return Math.abs(minDD);
}

/** Current drawdown magnitude = last point vs max peak so far. */
function currentDrawdownMagnitudeFromEquity(eq: number[]): number {
  if (eq.length === 0) return 0;
  let peak = eq[0]!;
  for (let i = 1; i < eq.length; i += 1) {
    if (eq[i]! > peak) peak = eq[i]!;
  }
  if (peak <= 0) return 0;
  const last = eq[eq.length - 1]!;
  const dd = last / peak - 1; // <= 0 if below peak
  return dd < 0 ? -dd : 0;
}

/** Combined equity from per-account daily nets using the union of calendars. */
function buildCombinedEquityWithUpnl(
  perAccounts: Record<string, MetricsSlim>,
  combinedUpnl?: unknown
): number[] {
  const keys = Object.keys(perAccounts);
  if (keys.length === 0) return [0];

  // Union calendar across all accounts (YYYY-MM-DD sorts lexicographically)
  const daySet = new Set<string>();
  for (const k of keys) {
    for (const r of perAccounts[k]!.daily) daySet.add(r.day);
  }
  const dayOrder = Array.from(daySet).sort();

  // Sum per-day net across accounts
  const byDay = new Map<string, number>();
  for (const k of keys) {
    for (const r of perAccounts[k]!.daily) {
      byDay.set(
        r.day,
        ensureNumber(byDay.get(r.day), 0) +
          ensureNumber((r as Record<string, unknown>)["net_pnl"], 0)
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

  const u = ensureNumber(combinedUpnl, 0);
  if (u !== 0 && eq.length > 0) {
    eq[eq.length - 1] = eq[eq.length - 1]! + u;
  }
  return eq;
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

/* ---------------- component ---------------- */

export default function CombinedDrawdownCard({
  perAccounts,
  upnlMap = {}, // always defined for robustness
  combinedUpnl,
  upnlAsOf,
  // thresholds (magnitudes)
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
  drawdownMode = "current", // default so bars move with UPNL
}: {
  perAccounts?: Record<string, MetricsSlim>;
  upnlMap?: Record<string, number | string>;
  combinedUpnl?: number | string;
  upnlAsOf?: string;

  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
  includeCombined?: boolean;
  combinedLabel?: string;
  drawdownMode?: DrawdownMode;
}) {
  const accounts = perAccounts ?? {};
  const keys = React.useMemo(() => Object.keys(accounts), [accounts]);

  // Recompute when UPNL values change even if object identity stays the same
  const upnlFingerprint = React.useMemo(
    () => JSON.stringify(upnlMap),
    [upnlMap]
  );

  const orderedLevels = React.useMemo(
    () => [...levels].sort((a, b) => a.value - b.value),
    [levels]
  );
  const mags = React.useMemo(
    () => orderedLevels.map((l) => l.value),
    [orderedLevels]
  );

  const ddFromEq = React.useCallback(
    (eq: number[]): number =>
      drawdownMode === "current"
        ? currentDrawdownMagnitudeFromEquity(eq)
        : minDrawdownMagnitudeFromEquity(eq),
    [drawdownMode]
  );

  const rows: Row[] = React.useMemo(() => {
    const out: Row[] = [];

    for (const k of keys) {
      const acc = accounts[k]!;
      const live = (upnlMap as Record<string, number | string>)[k] ?? 0;
      const eq = buildEquitySeriesWithUpnl(acc, live);
      const mag = ddFromEq(eq);

      let idx = -1;
      for (let i = 0; i < mags.length; i += 1) {
        if (mag >= mags[i]!) idx = i;
        else break;
      }
      const color =
        idx >= 0 ? (levelColors[idx] ?? defaultBarColor) : defaultBarColor;
      out.push({ account: k, ddMag: mag, crossedIndex: idx, color });
    }

    if (includeCombined && keys.length > 0) {
      const eqCombined = buildCombinedEquityWithUpnl(accounts, combinedUpnl);
      const magC = ddFromEq(eqCombined);
      let idxC = -1;
      for (let i = 0; i < mags.length; i += 1) {
        if (magC >= mags[i]!) idxC = i;
        else break;
      }
      const colorC =
        idxC >= 0 ? (levelColors[idxC] ?? defaultBarColor) : defaultBarColor;
      out.push({
        account: combinedLabel,
        ddMag: magC,
        crossedIndex: idxC,
        color: colorC,
      });
    }

    out.sort((a, b) => b.ddMag - a.ddMag);
    return out;
  }, [
    includeCombined,
    keys,
    accounts,
    upnlFingerprint, // critical dependency to reflect value changes
    levelColors,
    defaultBarColor,
    mags,
    combinedUpnl,
    combinedLabel,
    ddFromEq,
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

  // responsive sizing
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

  const modeLabel =
    drawdownMode === "current"
      ? "Current drawdown (vs last peak)"
      : "Minimum drawdown in window";

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Drawdown Thresholds — Per Account + All</CardTitle>
            <CardDescription>
              {modeLabel}. Latest point includes live UPNL.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs">
            {upnlAsOf ? (
              <span className="text-muted-foreground">
                UPNL as of {new Date(upnlAsOf).toLocaleTimeString()}
              </span>
            ) : null}
            {anyCrossedL1 ? (
              <span className="inline-flex items-center gap-1 text-destructive">
                ● Alarm — crossed {legendAll[0]!.label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                ● Threshold @ {legendAll[0]!.label}
              </span>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {legendAll.map((it) => (
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
                {it.label} • {crossedCountsAll[legendAll.indexOf(it)]} crossed
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
                cursor={false}
                content={({ active, payload }) => {
                  const first = Array.isArray(payload) ? payload[0] : undefined;
                  const possibleRow =
                    first && typeof first === "object"
                      ? (first as { payload?: unknown }).payload
                      : undefined;
                  const rowObj =
                    possibleRow && typeof possibleRow === "object"
                      ? (possibleRow as Record<string, unknown>)
                      : undefined;

                  if (!active || !rowObj) return null;

                  const val = ensureNumber(rowObj["ddMag"], 0);
                  const accountLabel = String(rowObj["account"] ?? "");
                  const crossedIndex = ensureNumber(rowObj["crossedIndex"], -1);

                  const crossed =
                    crossedIndex >= 0 ? legendAll[crossedIndex] : undefined;
                  const next =
                    crossedIndex + 1 < legendAll.length
                      ? legendAll[crossedIndex + 1]
                      : undefined;
                  const nextGap =
                    crossedIndex + 1 < mags.length
                      ? mags[crossedIndex + 1]! - val
                      : null;

                  return (
                    <div className="min-w-[240px] rounded-md border bg-popover/95 p-3 text-popover-foreground shadow-lg">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">
                          {accountLabel}
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {pctFromMag(val)}
                        </Badge>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs leading-relaxed">
                        <div>
                          {crossed ? (
                            <>
                              Crossed{" "}
                              <span
                                className="font-medium"
                                style={{ color: crossed.color }}
                              >
                                {crossed.label}
                              </span>
                            </>
                          ) : (
                            "Below first threshold"
                          )}
                        </div>
                        {next ? (
                          <div>
                            Next:{" "}
                            <span
                              className="font-medium"
                              style={{ color: next.color }}
                            >
                              {next.label}
                            </span>
                            {nextGap != null ? (
                              <span className="text-muted-foreground">
                                {" "}
                                ({(nextGap * 100).toFixed(2)}% away)
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                }}
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
