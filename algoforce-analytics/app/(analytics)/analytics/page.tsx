// app/(analytics)/analytics/AnalyticsPage.tsx
"use client";

import { Card } from "@/components/ui/card";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect } from "react";

import LiveUpnlStrip from "./components/LiveUpnlStrip";
import NoData from "./components/NoDataCard";
import CombinedMonthlyDrawdownCard from "./components/performance-metrics/CombinedPerformanceMTDCard";
import ConsecutiveLosingDaysCard from "./components/performance-metrics/ConsecutiveLosingDaysCard";
import TotalPnlBySymbolCard from "./components/performance-metrics/pnl-pair/TotalPnlBySymbolCard";
import BalancesVerificationCard from "./components/performance-metrics/BalancesVerificationCard";

import { usePrefs } from "@/components/prefs/PrefsContext";
import useAnalyticsData from "./hooks/useAnalyticsData";
import type { Account } from "./lib/performance_metric_types";

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
    loading,
    error,

    // BULK MTD payload and shims (already filtered by selected accounts)
    bulk,
    mergedForSymbols,
    perAccountsForStreaks,

    onAutoFetch,

    // live overlays (independent of bulk; backend does not include UPNL in bulk)
    upnlAsOf,
    combinedUpnl,
    upnlMap,
    upnlSymbolMap,
  } = useAnalyticsData();

  const {
    setAnalyticsAccounts,
    setAnalyticsLoading,
    analyticsSelectedAccounts,
    setAnalyticsSelectedAccounts,
  } = usePrefs();

  // Publish accounts + loading to global prefs
  useEffect(() => {
    setAnalyticsAccounts(accounts);
  }, [accounts, setAnalyticsAccounts]);

  useEffect(() => {
    setAnalyticsLoading(loading);
  }, [loading, setAnalyticsLoading]);

  // Keep navbar selection and local selection in sync
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

  // Fetch BULK MTD whenever selected changes
  useEffect(() => {
    if (selected.length > 0) void onAutoFetch();
  }, [selected.length, onAutoFetch]);

  return (
    <div className="min-h-full w-full bg-background p-5">
      <section className="p-5 space-y-5 max-w-[1600px] mx-auto">
        {error ? (
          <Card className="border-destructive/40 bg-destructive/5 text-destructive p-3 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </Card>
        ) : null}

        {/* Live UPNL strip (independent polling, uses selected accounts) */}
        <LiveUpnlStrip
          accounts={accounts}
          selected={selected}
          upnlAsOf={upnlAsOf}
          combined={combinedUpnl}
          perAccount={upnlMap}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Drawdown/Return (MTD) from BULK payload */}
          {bulk ? (
            <CombinedMonthlyDrawdownCard bulk={bulk} />
          ) : (
            <NoData title="Drawdown" subtitle="No MTD data yet" />
          )}

          {/* Losing streaks based on BULK payload (filtered by selected) */}
          {perAccountsForStreaks ? (
            <ConsecutiveLosingDaysCard perAccounts={perAccountsForStreaks} />
          ) : (
            <NoData title="Consecutive Losing Days" subtitle="No streak data" />
          )}

          {/* Ranked Symbols (realized) based on BULK payload (filtered by selected) */}
          {mergedForSymbols ? (
            <TotalPnlBySymbolCard
              metrics={mergedForSymbols}
              liveUpnlBySymbol={upnlSymbolMap}
            />
          ) : (
            <NoData title="Total PnL — Symbols" subtitle="No realized PnL" />
          )}
        </div>

        {/* NEW: All balances verification table (selected accounts only) */}
        {bulk ? (
          <div className="mt-5">
            <BalancesVerificationCard bulk={bulk} selected={selected} />
          </div>
        ) : null}
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
