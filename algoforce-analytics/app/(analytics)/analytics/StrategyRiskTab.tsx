// FILE: app/analytics/StrategyRiskTab.tsx
"use client";

import { useEffect, useState } from "react";
import BreakdownCard from "./BreakdownCard";
import CorrelationCard from "./CorrelationCard";
import NoData from "./NoDataCard";
import ReversionCard from "./ReversionCard";
import SpreadMonitorCard from "./SpreadMonitorCard";
import StationarityCard from "./StationarityCard";
import type { StrategyRiskResult } from "./types";

type ApiResponse = {
  meta: { windowDays: number; alpha: number };
  pairs: StrategyRiskResult[];
};

export default function StrategyRiskTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/metrics_adem_3", { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = (await res.json()) as ApiResponse;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading strategy risk metrics…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return <div>No data available</div>;

  // For now we pass the merged shape as { strategy_risk_results: data.pairs }
  const merged = data.pairs;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {data ? (
        <SpreadMonitorCard merged={merged}/>
      ) : (
        <NoData title="Spread Tracker" subtitle="Z-score vs historical" />
      )}
      {data ? (
        <ReversionCard merged={merged}/>
      ) : (
        <NoData title="Spread Tracker" subtitle="Mean reversion and Half-life" />
      )}
      {data ? (
        <StationarityCard merged={merged}/>
      ) : (
        <NoData title="Stationarity Tests" subtitle="ADF / KPSS / Johansen (rolling)" />
      )}
      {data ? (
        <BreakdownCard merged={merged}/>
      ) : (
        <NoData title="Breakdown Probability" subtitle="% windows CI tests fail" />
      )}
      {data ? (
        <CorrelationCard merged={merged}/>
      ) : (
        <NoData title="Rolling Correlations" subtitle="Pearson / Kendall / Spearman" />
      )}
    </div>
  );
}
