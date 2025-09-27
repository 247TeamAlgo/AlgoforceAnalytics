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

  // 1) As soon as accounts load, ensure we have a non-empty selection.
  useEffect(() => {
    if (selected.length === 0 && accounts.length > 0) {
      const monitored = accounts
        .filter((a) => Boolean(a.monitored))
        .map((a) => a.redisName);

      // Prefer monitored; else fall back to all accounts.
      setSelected(monitored.length > 0 ? monitored : accounts.map((a) => a.redisName));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  // 2) Trigger heavy fetch when selection and date window are ready.
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MonthlyDrawdownCard perAccounts={perAccounts} selected={selected} range={range} earliest={earliest} />
          <ConsecutiveLosingDaysCard perAccounts={perAccounts} />
          {merged ? <PnLPerSymbolCard merged={merged} /> : null}
          {merged ? <PnLPerPairCard merged={merged} /> : null}
          {merged ? <ReturnsCard merged={merged} /> : null}
        </div>
      </section>
    </div>
  );
}
