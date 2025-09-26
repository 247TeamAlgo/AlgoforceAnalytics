"use client";

import GrossNetExposuresCard from "../GrossNetExposuresCard";
import PairExposuresCard from "../PairExposuresCard";
import ConcentrationCard from "../ConcentrationCard";
import PairCorrelationCard from "../PairCorrelationCard";
import NoData from "../NoDataCard";
import { MetricsPayload } from "../types";

/** Minimal shape the cards expect from the merged payload */
export type ConcentrationMerged = {
  symbolExposures?: { symbol: string; gross: number; net: number }[];
  pairExposures?: { pair: string; gross: number; net: number }[];
  concentration?: { largest_pair_pct: number | null };
  corrMatrix?: Record<string, Record<string, number | null>>;
};

export default function ConcentrationLeverageTab({
  merged,
}: {
  merged: MetricsPayload | null;
}) {

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {merged ? (
        <GrossNetExposuresCard merged={merged} />
      ) : (
        <NoData title="Gross / Net Exposures" subtitle="Per crypto asset" />
      )}

      {merged ? (
        <PairExposuresCard merged={merged} />
      ) : (
        <NoData title="Pair Exposures" subtitle="Per cointegrated pair" />
      )}

      {merged ? (
        <ConcentrationCard merged={merged} />
      ) : (
        <NoData title="Concentration Risk" subtitle="Largest pair % of portfolio" />
      )}

      {merged ? (
        <PairCorrelationCard merged={merged} />
      ) : (
        <NoData title="Pair Correlations" subtitle="Correlation between cointegrated pairs" />
      )}
    </div>
  );
}
