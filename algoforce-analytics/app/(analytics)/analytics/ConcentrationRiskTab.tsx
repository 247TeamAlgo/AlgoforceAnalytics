// app/analytics/ConcentrationRiskTab.tsx
"use client";

import GrossNetExposuresCard from "./ConcentrationLeverage/GrossNetExposuresCard";
import PairExposuresCard from "./ConcentrationLeverage/PairExposuresCard";
import ConcentrationCard from "./ConcentrationLeverage/ConcentrationCard";
import PairCorrelationCard from "./ConcentrationLeverage/PairCorrelationCard";
import NoData from "./NoDataCard";
import type { MetricsPayload } from "./types";

export default function ConcentrationRiskTab({
  merged,
}: {
  merged: MetricsPayload | null;
}) {
  if (!merged) return <NoData title="Concentration & Leverage" subtitle="No data available" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {merged.symbolExposures?.length ? (
        <GrossNetExposuresCard merged={merged} />
      ) : (
        <NoData title="Gross / Net Exposures" subtitle="Per crypto asset" />
      )}

      {merged.pairExposures?.length ? (
        <PairExposuresCard merged={merged} />
      ) : (
        <NoData title="Pair Exposures" subtitle="Per cointegrated pair" />
      )}

      {merged.concentration ? (
        <ConcentrationCard merged={merged} />
      ) : (
        <NoData title="Concentration Risk" subtitle="Largest pair % of portfolio" />
      )}

      {merged.corrMatrix ? (
        <PairCorrelationCard merged={merged} />
      ) : (
        <NoData title="Pair Correlations" subtitle="Correlation between cointegrated pairs" />
      )}
    </div>
  );
}