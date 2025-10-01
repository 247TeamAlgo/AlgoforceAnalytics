// app/(analytics)/analytics/AnalyticsPage.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import MonthlyDrawdownCard from "./components/performance-metrics/CombinedDrawdownCard";
import ConsecutiveLosingDaysCard from "./components/performance-metrics/ConsecutiveLosingDaysCard";
import ReturnsCard from "./components/performance-metrics/ReturnsCard";
import LiveUpnlStrip from "./components/LiveUpnlStrip";
import NoData from "./components/NoDataCard";
import TotalPnlBySymbolCard from "./components/performance-metrics/pnl-pair/TotalPnlBySymbolCard";
// import TotalPnlByPairCard from "./components/performance-metrics/pnl-pair/TotalPnlByPairCard";

import useAnalyticsData from "./hooks/useAnalyticsData";
import type { Account } from "./lib/performance_metric_types";
import { usePrefs } from "@/components/prefs/PrefsContext";
import type { MetricsSlim } from "./lib/performance_metric_types";

/* ---- local date helpers for header -------------------------------------- */
function fromISODateLocal(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
const LOCAL_FMT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});
function prettyLocal(s?: string): string {
  const dt = fromISODateLocal(s);
  return dt ? LOCAL_FMT.format(dt) : "";
}
function rangeText(earliest: boolean, start?: string, end?: string): string {
  const left = earliest && !start ? "Earliest" : prettyLocal(start) || "—";
  const right = prettyLocal(end) || "—";
  return `${left} → ${right}`;
}
/* ------------------------------------------------------------------------- */

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
function sanitizeSelection(all: Account[], selected: string[]): string[] {
  const set = new Set(all.map((a) => a.redisName));
  return selected.filter((id) => set.has(id));
}
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function todayISOlocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfThisMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

/** Rebase an account’s metrics to MTD:
 * - initial_balance := equity level at the start of the month (prior cumulative)
 * - daily := only entries within [startOfMonth..end]
 * - total_return_pct_over_window is NOT used here (ReturnsCard recomputes locally
 *   when given `excludeLiveFromPct` + `upnlMap`), but we can leave a placeholder.
 */
function deriveMTDForAccount(m: MetricsSlim, mtdStart: string): MetricsSlim {
  const days = [...(m.daily ?? [])].sort((a, b) => a.day.localeCompare(b.day));
  let priorSum = 0;
  const mtdDaily = [];

  for (const r of days) {
    if (r.day < mtdStart) {
      priorSum += (r.net_pnl ?? 0);
    } else {
      mtdDaily.push(r);
    }
  }

  const rebasedInit = (m.initial_balance || 0) + priorSum;

  return {
    ...m,
    initial_balance: rebasedInit,
    window_start: mtdStart,
    daily: mtdDaily,
    // let cards recompute; keep placeholder
    total_return_pct_over_window: null,
  };
}

/** Build merged MTD from per-account MTD */
function deriveMTDMerged(perAcc: Record<string, MetricsSlim>): MetricsSlim {
  const keys = Object.keys(perAcc);
  let init = 0;
  const byDay = new Map<string, { gross: number; fees: number; net: number }>();
  for (const k of keys) {
    const m = perAcc[k]!;
    init += m.initial_balance || 0;
    for (const r of m.daily) {
      const cur = byDay.get(r.day) ?? { gross: 0, fees: 0, net: 0 };
      cur.gross += r.gross_pnl ?? 0;
      cur.fees += r.fees ?? 0;
      cur.net += r.net_pnl ?? 0;
      byDay.set(r.day, cur);
    }
  }
  const daily = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({
      day,
      gross_pnl: Number(v.gross.toFixed(2)),
      fees: Number(v.fees.toFixed(2)),
      net_pnl: Number(v.net.toFixed(2)),
    }));

  return {
    initial_balance: init,
    window_start: daily.length ? daily[0]!.day : startOfThisMonthISO(),
    window_end: daily.length ? daily[daily.length - 1]!.day : startOfThisMonthISO(),
    total_return_pct_over_window: null, // ReturnsCard recomputes
    drawdown_mag: 0,
    streaks: { current: 0, max: 0 },
    daily,
    pnl_per_symbol: [],
    pnl_per_pair: [],
  };
}

export default function AnalyticsPage() {
  const {
    accounts,
    selected,
    setSelected,
    range,
    setRange,
    earliest,
    setEarliest,
    loading,
    error,
    merged,
    perAccounts,
    onAutoFetch,
    // live overlays
    upnlAsOf,
    combinedUpnl,
    upnlMap,
    upnlSymbolMap,
    // drawdown-safe deltas
    upnlDeltaMapForDrawdown,
    combinedUpnlDeltaForDrawdown,
  } = useAnalyticsData();

  const {
    analyticsAccounts,
    setAnalyticsAccounts,
    analyticsLoading,
    setAnalyticsLoading,
    analyticsSelectedAccounts,
    setAnalyticsSelectedAccounts,
    analyticsRange,
    setAnalyticsRange,
    analyticsEarliest,
    setAnalyticsEarliest,
  } = usePrefs();

  // NEW: local tab
  const [tab, setTab] = useState<"ranged" | "mtd">("ranged");

  /** publish accounts + loading to global prefs */
  useEffect(() => {
    setAnalyticsAccounts(accounts);
  }, [accounts, setAnalyticsAccounts]);

  useEffect(() => {
    setAnalyticsLoading(loading);
  }, [loading, setAnalyticsLoading]);

  /** default selection when prefs are empty; keep in sync */
  useEffect(() => {
    if (accounts.length === 0) return;
    const cleaned = sanitizeSelection(accounts, analyticsSelectedAccounts);

    if (cleaned.length === 0) {
      const monitored = accounts
        .filter((a) => Boolean(a.monitored))
        .map((a) => a.redisName);
      const fallback =
        monitored.length > 0 ? monitored : accounts.map((a) => a.redisName);
      setAnalyticsSelectedAccounts(fallback);
      setSelected(fallback);
      return;
    }

    if (!arraysEqual(cleaned, analyticsSelectedAccounts)) {
      setAnalyticsSelectedAccounts(cleaned);
    }
    if (!arraysEqual(selected, cleaned)) {
      setSelected(cleaned);
    }
  }, [
    accounts,
    analyticsSelectedAccounts,
    selected,
    setAnalyticsSelectedAccounts,
    setSelected,
  ]);

  /** keep hook range/earliest in sync with global prefs */
  useEffect(() => {
    const rStart = analyticsRange.start ?? undefined;
    const rEnd = analyticsRange.end ?? undefined;
    if (range.start !== rStart || range.end !== rEnd) {
      setRange({ start: rStart, end: rEnd });
    }
    if (earliest !== analyticsEarliest) {
      setEarliest(analyticsEarliest);
    }
  }, [
    analyticsRange.start,
    analyticsRange.end,
    analyticsEarliest,
    range.start,
    range.end,
    earliest,
    setRange,
    setEarliest,
  ]);

  /** when navbar selection changes, sync into hook */
  useEffect(() => {
    if (!arraysEqual(selected, analyticsSelectedAccounts)) {
      setSelected(analyticsSelectedAccounts);
    }
  }, [analyticsSelectedAccounts, selected, setSelected]);

  /** heavy fetch trigger */
  useEffect(() => {
    const hasExplicit = Boolean(range.start && range.end);
    if (selected.length > 0 && (hasExplicit || (earliest && range.end))) {
      void onAutoFetch();
    }
  }, [selected.length, range.start, range.end, earliest, onAutoFetch]);

  /* ---------------- derived: Ranged vs MTD ---------------- */

  const endIsToday = useMemo(
    () => (range.end ? range.end === todayISOlocal() : false),
    [range.end]
  );

  // Build MTD series by rebasing each account to start-of-month and slicing daily to MTD
  const mtdStart = startOfThisMonthISO();
  const mtdPerAccounts = useMemo(() => {
    if (!perAccounts) return undefined;
    const out: Record<string, MetricsSlim> = {};
    for (const [k, v] of Object.entries(perAccounts)) {
      out[k] = deriveMTDForAccount(v, mtdStart);
    }
    return out;
  }, [perAccounts, mtdStart]);

  const mtdMerged = useMemo(() => {
    if (!mtdPerAccounts) return null;
    return deriveMTDMerged(mtdPerAccounts);
  }, [mtdPerAccounts]);

  /* ---------------- render ---------------- */

  return (
    <div className="min-h-full w-full bg-background p-5">
      <section className="p-5 space-y-5 max-w-[1600px] mx-auto">
        {error ? (
          <Card className="border-destructive/40 bg-destructive/5 text-destructive p-3 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </Card>
        ) : null}

        {/* Live UPNL strip (shared) */}
        <LiveUpnlStrip
          accounts={accounts}
          selected={selected}
          upnlAsOf={upnlAsOf}
          combined={combinedUpnl}
          perAccount={upnlMap}
        />

        {/* Tabs: Ranged vs MTD */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as "ranged" | "mtd")}>
          <TabsList className="mb-4">
            <TabsTrigger value="ranged">Ranged</TabsTrigger>
            <TabsTrigger value="mtd">MTD</TabsTrigger>
          </TabsList>

          {/* --------- Ranged (existing behavior, but only include live if end is today) --------- */}
          <TabsContent value="ranged">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <MonthlyDrawdownCard
                perAccounts={perAccounts}
                // include deltas only if the selected end is today
                upnlDeltaMap={endIsToday ? (upnlDeltaMapForDrawdown as Record<string, number>) : {}}
                combinedUpnlDelta={endIsToday ? combinedUpnlDeltaForDrawdown : 0}
                drawdownMode="monthly"
              />
              <ConsecutiveLosingDaysCard perAccounts={perAccounts} />

              {merged ? (
                <TotalPnlBySymbolCard
                  metrics={merged}
                  liveUpnlBySymbol={upnlSymbolMap}
                />
              ) : (
                <NoData title="Total PnL — Symbols" subtitle="Ranked" />
              )}

              {/* If you bring pairs back, keep as-is */}
              {/* {merged ? <TotalPnlByPairCard metrics={merged} /> : <NoData title="Total PnL — Pairs" subtitle="Ranked" />} */}

              {merged ? (
                <ReturnsCard
                  merged={merged}
                  perAccount={perAccounts}
                  liveUpnl={combinedUpnl}
                  // IMPORTANT: exclude live from %s unless end is today
                  excludeLiveFromPct={!endIsToday}
                  upnlMap={upnlMap}
                />
              ) : null}
            </div>
          </TabsContent>

          {/* --------- MTD (month-to-date; always includes live) --------- */}
          <TabsContent value="mtd">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <MonthlyDrawdownCard
                perAccounts={mtdPerAccounts}
                upnlDeltaMap={upnlDeltaMapForDrawdown as Record<string, number>}
                combinedUpnlDelta={combinedUpnlDeltaForDrawdown}
                drawdownMode="monthly"
              />

              {/* MTD returns: rebased series; include live */}
              {mtdMerged ? (
                <ReturnsCard
                  merged={mtdMerged}
                  perAccount={mtdPerAccounts}
                  liveUpnl={combinedUpnl}
                  excludeLiveFromPct={false}
                  upnlMap={upnlMap}
                />
              ) : (
                <NoData title="Returns — MTD" subtitle="Current month only" />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {loading ? (
        <div className="pointer-events-none fixed inset-0 grid place-items-center bg-background/40 backdrop-blur-sm">
          <div className="glass-card px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading charts…</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
