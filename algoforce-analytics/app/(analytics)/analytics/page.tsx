"use client";
//app/(analytics)/page.tsx

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

  useEffect(() => {
    const hasExplicit = Boolean(range.start && range.end);
    if (selected.length && (hasExplicit || (earliest && range.end))) {
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
          onAutoFetch={onAutoFetch}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MonthlyDrawdownCard perAccounts={perAccounts} />
          <ConsecutiveLosingDaysCard perAccounts={perAccounts} />
          {merged ? <ReturnsCard merged={merged} /> : null}
          {merged ? <PnLPerSymbolCard merged={merged} /> : null}
          {merged ? <PnLPerPairCard merged={merged} /> : null}
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
