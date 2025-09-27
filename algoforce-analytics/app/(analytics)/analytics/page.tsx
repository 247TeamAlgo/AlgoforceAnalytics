// app/(analytics)/page.tsx
"use client";

import { useEffect } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

import { useAnalyticsData } from "./hooks/useAnalyticsData";
import Controls from "./components/Controls";
import MonthlyDrawdownCard from "./components/performance-metrics/CombinedDrawdownCard";
import ConsecutiveLosingDaysCard from "./components/performance-metrics/ConsecutiveLosingDaysCard";
import PnLPerSymbolCard from "./components/performance-metrics/PnLPerSymbolCard";
import ReturnsCard from "./components/performance-metrics/ReturnsCard";
import PnLPerPairCard from "./components/performance-metrics/PnLPerPairCard";
import LiveUpnlStrip from "./components/LiveUpnlStrip";
import { useUpnl } from "./hooks/useUpnl";

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
  } = useAnalyticsData();

  // ensure a non-empty selection once accounts arrive
  useEffect(() => {
    if (selected.length === 0 && accounts.length > 0) {
      const monitored = accounts
        .filter((a) => Boolean(a.monitored))
        .map((a) => a.redisName);
      setSelected(
        monitored.length > 0 ? monitored : accounts.map((a) => a.redisName)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  // heavy fetch trigger
  useEffect(() => {
    const hasExplicit = Boolean(range.start && range.end);
    if (selected.length > 0 && (hasExplicit || (earliest && range.end))) {
      void onAutoFetch();
    }
  }, [selected.length, range.start, range.end, earliest, onAutoFetch]);

  // live UPNL (polls every 60s)
  const { data: upnl } = useUpnl(selected, { pollMs: 1_000, jitterMs: 120 });

  return (
    <div className="min-h-full w-full bg-background p-5">
      <section className="p-5 space-y-5 max-w-[1600px] mx-auto">
        {error ? (
          <Card className="border-destructive/40 bg-destructive/5 text-destructive p-3 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </Card>
        ) : null}

        <Controls
          accounts={accounts}
          selected={selected}
          setSelected={setSelected}
          range={range}
          setRange={setRange}
          earliest={earliest}
          setEarliest={setEarliest}
          loading={loading}
          error={error}
        />

        {/* Live UPNL strip */}
        <LiveUpnlStrip
          accounts={accounts}
          selected={selected}
          upnlAsOf={upnl?.as_of}
          combined={upnl?.combined_upnl}
          perAccount={upnl?.per_account_upnl}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MonthlyDrawdownCard perAccounts={perAccounts} />
          <ConsecutiveLosingDaysCard perAccounts={perAccounts} />
          {merged ? <PnLPerSymbolCard merged={merged} /> : null}
          {merged ? <PnLPerPairCard merged={merged} /> : null}
          {merged ? (
            <ReturnsCard merged={merged} liveUpnl={upnl?.combined_upnl} />
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
