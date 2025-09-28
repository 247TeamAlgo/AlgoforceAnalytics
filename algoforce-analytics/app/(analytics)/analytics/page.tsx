"use client";

import { useEffect, useMemo } from "react";
import { AlertTriangle, CalendarRange, Loader2, Users } from "lucide-react";
import { Card } from "@/components/ui/card";

import MonthlyDrawdownCard from "./components/performance-metrics/CombinedDrawdownCard";
import ConsecutiveLosingDaysCard from "./components/performance-metrics/ConsecutiveLosingDaysCard";
import ReturnsCard from "./components/performance-metrics/ReturnsCard";
import LiveUpnlStrip from "./components/LiveUpnlStrip";
import NoData from "./components/NoDataCard";
import TotalPnlByPairCard from "./components/performance-metrics/pnl-pair/TotalPnlByPairCard";
import TotalPnlBySymbolCard from "./components/performance-metrics/pnl-pair/TotalPnlBySymbolCard";
import useAnalyticsData from "./hooks/useAnalyticsData";
import type { Account } from "./lib/performance_metric_types";
import { usePrefs } from "@/components/prefs/PrefsContext";

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


  return (
    <div className="min-h-full w-full bg-background p-5">
      <section className="p-5 space-y-5 max-w-[1600px] mx-auto">
        {error ? (
          <Card className="border-destructive/40 bg-destructive/5 text-destructive p-3 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </Card>
        ) : null}
        {/* Live UPNL strip */}
        <LiveUpnlStrip
          accounts={accounts}
          selected={selected}
          upnlAsOf={upnlAsOf}
          combined={combinedUpnl}
          perAccount={upnlMap}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MonthlyDrawdownCard perAccounts={perAccounts} />
          <ConsecutiveLosingDaysCard perAccounts={perAccounts} />

          {/* Realized totals by symbol + OPTIONAL live UPNL overlay */}
          {merged ? (
            <TotalPnlBySymbolCard
              metrics={merged}
              liveUpnlBySymbol={upnlSymbolMap}
            />
          ) : (
            <NoData title="Total PnL — Symbols" subtitle="Ranked" />
          )}

          {/* Realized totals by pair (no live overlay available for pairs) */}
          {merged ? (
            <TotalPnlByPairCard metrics={merged} />
          ) : (
            <NoData title="Total PnL — Pairs" subtitle="Ranked" />
          )}

          {merged ? (
            <ReturnsCard merged={merged} liveUpnl={combinedUpnl} />
          ) : null}
        </div>
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
