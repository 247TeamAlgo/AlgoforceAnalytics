"use client";

import { Card } from "@/components/ui/card";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect } from "react";

import NoData from "./components/NoDataCard";
import CombinedPerformanceMTDCard from "./components/performance-metrics/CombinedPerformanceMTDCard";
import ConsecutiveLosingDaysCard from "./components/performance-metrics/ConsecutiveLosingDaysCard";
import TotalPnlBySymbolCard from "./components/performance-metrics/pnl-pair/TotalPnlBySymbolCard";
import BalancesVerificationCard from "./components/performance-metrics/BalancesVerificationCard";

import { usePrefs } from "@/components/prefs/PrefsContext";
import useAnalyticsData from "./hooks/useAnalyticsData";
import type { Account } from "./lib/performance_metric_types";
import LiveUpnlStrip from "./components/LiveUpnlStrip";

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

    bulk,
    mergedForSymbols,
    perAccountsForStreaks,

    onAutoFetch,

    // live derived from bulk.uPnl
    upnlSymbolMap,
    combinedUpnl,
  } = useAnalyticsData();

  const {
    setAnalyticsAccounts,
    setAnalyticsLoading,
    analyticsSelectedAccounts,
    setAnalyticsSelectedAccounts,
  } = usePrefs();

  // Provide accounts list to global prefs (for AccountsDialog in navbar)
  useEffect(() => {
    setAnalyticsAccounts(accounts);
  }, [accounts, setAnalyticsAccounts]);

  // Expose a lightweight loading flag (only first sequence shows spinner)
  useEffect(() => {
    setAnalyticsLoading(loading);
  }, [loading, setAnalyticsLoading]);

  // Keep local selection ↔ prefs in sync without overriding on every render.
  useEffect(() => {
    if (accounts.length === 0) return;

    // Prefer whatever prefs currently hold; if empty, adopt hook's default (which is fund2&fund3 if present)
    const cleaned = sanitizeSelection(
      accounts,
      analyticsSelectedAccounts
    );
    if (cleaned.length === 0 && selected.length > 0) {
      // initialize prefs from hook's selected
      setAnalyticsSelectedAccounts(selected);
      return;
    }

    // Align both ways but avoid loops by diffing
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

  // First-render bulk fetch (with graceful “double fetch” if hasUpdated), later silent refreshes are inside hook
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

        {/* {bulk?.uPnl ? (
          <div className="mb-5">
            <LiveUpnlStrip bulk={bulk} />
          </div>
        ) : null} */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Four-metric MTD (realized + margin/live via combinedUpnl) */}
          {bulk ? (
            <CombinedPerformanceMTDCard
              bulk={bulk}
              selected={selected}
              combinedUpnl={combinedUpnl ?? 0}
            />
          ) : (
            <NoData title="Drawdown / Return" subtitle="No MTD data yet" />
          )}

          {/* Losing streaks (realized) */}
          {perAccountsForStreaks ? (
            <ConsecutiveLosingDaysCard
              perAccounts={perAccountsForStreaks}
              accounts={accounts}
            />
          ) : (
            <NoData title="Consecutive Losing Days" subtitle="No streak data" />
          )}

          {/* Ranked Symbols (realized) with optional live overlay */}
          {mergedForSymbols ? (
            <TotalPnlBySymbolCard
              metrics={mergedForSymbols}
              liveUpnlBySymbol={upnlSymbolMap}
            />
          ) : (
            <NoData title="Total PnL — Symbols" subtitle="No realized PnL" />
          )}
        </div>

        {/* Balances verification (realized) */}
        {bulk ? (
          <div className="mt-5">
            <BalancesVerificationCard bulk={bulk} selected={selected} />
          </div>
        ) : null}
      </section>

      {loading ? (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/40 backdrop-blur-sm">
          <div className="glass-card px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading charts…</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
