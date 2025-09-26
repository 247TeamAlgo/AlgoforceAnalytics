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

        <Card className="p-3 text-sm flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <span className="text-muted-foreground">Selected:</span>{" "}
            <strong>{selected.length}</strong> / {accounts.length}
          </div>
          <div>
            <span className="text-muted-foreground">Range:</span>{" "}
            <strong>
              {(earliest && !range.start ? "Earliest" : range.start) ?? "—"} →{" "}
              {range.end ?? "—"}
            </strong>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span className="text-muted-foreground">
              {loading ? "Fetching metrics…" : "Ready"}
            </span>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {merged ? <MonthlyDrawdownCard merged={merged} /> : null}
          {merged ? <ReturnsCard merged={merged} /> : null}
          <ConsecutiveLosingDaysCard perAccounts={perAccounts} />
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
