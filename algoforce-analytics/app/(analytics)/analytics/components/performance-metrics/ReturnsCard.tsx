"use client";

import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { MetricsSlim } from "../../lib/performance_metric_types";

/* ---------------- helpers ---------------- */

function ensureNumber(n: unknown, fallback = 0): number {
  if (typeof n === "number") return Number.isFinite(n) ? n : fallback;
  if (typeof n === "string") {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }
  return fallback;
}

type DailyRow = NonNullable<MetricsSlim["daily"]>[number];

function monthKey(dayISO: string): string {
  return dayISO.slice(0, 7); // YYYY-MM
}
function sortDaily(d: DailyRow[]): DailyRow[] {
  return [...d].sort((a, b) => a.day.localeCompare(b.day));
}
function monthLabel(mkey: string): string {
  const [y, m] = mkey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleString(undefined, { month: "short", year: "numeric" });
}

/** Equity levels; optionally add live delta to the final point only. */
function buildEquity(
  initial: number,
  daily: DailyRow[],
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
  return eq;
}

/** Return for a specific YYYY-MM inside the window (month isolated). */
function monthReturnPct(
  initial: number,
  daily: DailyRow[],
  targetMonth: string,
  liveDeltaForLastMonth?: number
): number | null {
  const d = sortDaily(daily);
  if (d.length === 0) return null;
  const lastMonth = monthKey(d[d.length - 1]!.day);

  // month boundaries
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < d.length; i += 1) {
    if (monthKey(d[i]!.day) === targetMonth) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    }
  }
  if (firstIdx < 0 || lastIdx < 0) return null;

  // Equity WITHOUT live to get month start level; WITH live only if month is last.
  const eqNoLive = buildEquity(initial, d, 0);
  const eqMaybeLive = buildEquity(
    initial,
    d,
    targetMonth === lastMonth ? liveDeltaForLastMonth : 0
  );

  const startEq = eqNoLive[firstIdx]!;
  const endEq = eqMaybeLive[lastIdx + 1]!;
  if (!(startEq > 0)) return null;

  const pct = (endEq - startEq) / startEq;
  return Number((pct * 100).toFixed(2));
}

/** Compounded return across all months present in the window. */
function compoundedReturnAcrossRange(
  initial: number,
  daily: DailyRow[],
  liveDeltaForLastMonth?: number
): number | null {
  const d = sortDaily(daily);
  if (!d.length) return null;

  // Build equity with live applied only to the final point
  const eq = buildEquity(initial, d, liveDeltaForLastMonth);

  const firstIdx: Record<string, number> = {};
  const lastIdx: Record<string, number> = {};
  for (let i = 0; i < d.length; i += 1) {
    const mk = monthKey(d[i]!.day);
    if (!(mk in firstIdx)) firstIdx[mk] = i;
    lastIdx[mk] = i;
  }
  const months = Object.keys(firstIdx).sort();
  if (!months.length) return null;

  let product = 1;
  for (const mk of months) {
    const fi = firstIdx[mk]!;
    const li = lastIdx[mk]!;
    const startEq = eq[fi]!;
    const endEq = eq[li + 1]!;
    if (startEq > 0) {
      const r = (endEq - startEq) / startEq;
      product *= 1 + r;
    }
  }
  return Number(((product - 1) * 100).toFixed(2));
}

/* ---------------- component ---------------- */

type ModeValue = `m:${string}` | "compounded"; // m:YYYY-MM or compounded

export default function ReturnsCard({
  merged,
  perAccount,
  liveUpnl,
  upnlMap,
  excludeLiveFromPct = true,
  title = "Combined Selected Range Return",
  subtitle = "Total return for the current date selection",
}: {
  merged: MetricsSlim;
  perAccount?: Record<string, MetricsSlim>;
  liveUpnl?: number;
  upnlMap?: Record<string, number>;
  excludeLiveFromPct?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const daily = merged?.daily ?? [];
  const monthsInRange = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of daily) set.add(monthKey(r.day));
    return Array.from(set).sort(); // ["2025-08","2025-09",...]
  }, [daily]);

  const lastMonthInRange = monthsInRange[monthsInRange.length - 1];

  // Default = last month; fallback compounded if range empty
  const [mode, setMode] = React.useState<ModeValue>(
    monthsInRange.length ? (`m:${lastMonthInRange}` as ModeValue) : "compounded"
  );

  // Keep selection valid when range changes
  React.useEffect(() => {
    if (monthsInRange.length === 0) {
      setMode("compounded");
      return;
    }
    const mkey = (mode.startsWith("m:") ? mode.slice(2) : "") || "";
    if (!mkey || !monthsInRange.includes(mkey)) {
      setMode(`m:${monthsInRange[monthsInRange.length - 1]}` as ModeValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsInRange.join("|")]);

  // Live delta only if you opt in
  const combinedLiveDelta = excludeLiveFromPct ? 0 : ensureNumber(liveUpnl, 0);

  // Combined %
  const combinedPct: number | null = React.useMemo(() => {
    const init = ensureNumber(merged?.initial_balance, 0);
    const d = merged?.daily ?? [];
    if (!d.length) return null;

    if (mode === "compounded") {
      return compoundedReturnAcrossRange(init, d, combinedLiveDelta);
    } else {
      const mkey = mode.slice(2); // YYYY-MM
      const liveForThisMonth = mkey === lastMonthInRange ? combinedLiveDelta : 0;
      return monthReturnPct(init, d, mkey, liveForThisMonth);
    }
  }, [merged, mode, combinedLiveDelta, lastMonthInRange]);

  // Per-account rows
  const perRows = React.useMemo(() => {
    if (!perAccount) return [];
    return Object.entries(perAccount).map(([k, m]) => {
      const init = ensureNumber(m.initial_balance, 0);
      const d = m.daily ?? [];
      if (!d.length) return { key: k, pct: null as number | null };

      const liveDelta = excludeLiveFromPct ? 0 : ensureNumber(upnlMap?.[k], 0);

      if (mode === "compounded") {
        return { key: k, pct: compoundedReturnAcrossRange(init, d, liveDelta) };
      } else {
        const mkey = mode.slice(2);
        // only include live on the last month this account actually has
        const accMonths = Array.from(new Set(d.map((r) => monthKey(r.day)))).sort();
        const accLastMonth = accMonths[accMonths.length - 1];
        const liveForThisMonth = mkey === accLastMonth ? liveDelta : 0;
        return { key: k, pct: monthReturnPct(init, d, mkey, liveForThisMonth) };
      }
    });
  }, [perAccount, upnlMap, excludeLiveFromPct, mode]);

  function pctToBarWidth(p: number | null): string {
    if (p == null) return "0%";
    const w = Math.min(100, Math.max(0, Math.abs(p)));
    return `${w}%`;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{subtitle}</CardDescription>
          </div>

          <Select value={mode} onValueChange={(v) => setMode(v as ModeValue)}>
            <SelectTrigger className="h-8 w-[260px]">
              <SelectValue placeholder="Return mode" />
            </SelectTrigger>
            <SelectContent align="end">
              {monthsInRange.map((mk) => (
                <SelectItem key={mk} value={`m:${mk}` as ModeValue}>
                  {monthLabel(mk)}
                </SelectItem>
              ))}
              <SelectItem value="compounded">Compounded across range</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="flex items-baseline justify-between mb-4">
          <div className="text-3xl font-semibold">
            {combinedPct == null ? "—" : `${combinedPct.toFixed(2)}%`}
            <span className="ml-2 text-sm text-muted-foreground">
              return (realized only)
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            Live UPNL:{" "}
            {typeof liveUpnl === "number"
              ? liveUpnl >= 0
                ? `+$${liveUpnl.toFixed(2)}`
                : `-$${Math.abs(liveUpnl).toFixed(2)}`
              : "—"}
          </div>
        </div>

        <div className="space-y-3">
          {/* Combined */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <div className="text-sm text-muted-foreground">Combined</div>
            <div className="relative h-8 rounded-full bg-secondary/50 overflow-hidden">
              <div
                className={`absolute inset-y-0 ${
                  combinedPct && combinedPct < 0 ? "bg-destructive/80" : "bg-primary/70"
                }`}
                style={{ width: pctToBarWidth(combinedPct) }}
              />
              <div className="absolute inset-0 grid place-items-center text-xs">
                {combinedPct == null ? "—" : `${combinedPct.toFixed(2)}%`}
              </div>
            </div>
          </div>

          {/* Per-account */}
          {perRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="text-sm text-muted-foreground">{row.key}</div>
              <div className="relative h-8 rounded-full bg-secondary/50 overflow-hidden">
                <div
                  className={`absolute inset-y-0 ${
                    row.pct && row.pct < 0 ? "bg-destructive/80" : "bg-primary/70"
                  }`}
                  style={{ width: pctToBarWidth(row.pct) }}
                />
                <div className="absolute inset-0 grid place-items-center text-xs">
                  {row.pct == null ? "—" : `${row.pct.toFixed(2)}%`}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-5 text-[11px] text-muted-foreground">
          <div className="text-left">-5.00%</div>
          <div className="text-left">-2.5%</div>
          <div className="text-center">+0.00%</div>
          <div className="text-right">+2.5%</div>
          <div className="text-right">+5.00%</div>
        </div>
      </CardContent>
    </Card>
  );
}
