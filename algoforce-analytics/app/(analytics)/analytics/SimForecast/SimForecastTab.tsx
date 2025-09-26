// FILE: app/analytics/OpsForecastTab.tsx
"use client";

import ChartPlaceholder from "../ChartPlaceholder";
import type { MetricsPayload } from "../types";
import BootstrapDistCard from "../BootstrapDistCard";
import ProbOfRuinCard from "../ProbOfRuinCard";
import RecoveryTimeCard from "../RecoveryTimeCard";

export default function SimForecastTab({ merged }: { merged: MetricsPayload | null }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {merged ? <BootstrapDistCard metrics={merged} /> : (
        <ChartPlaceholder title="Bootstrap PnL Distribution" subtitle="Daily / Weekly / Monthly" />
      )}
      {merged ? <ProbOfRuinCard metrics={merged} /> : (
        <ChartPlaceholder title="Probability of Ruin" subtitle="equity below threshold" />
      )}
      {merged ? <RecoveryTimeCard metrics={merged} /> : (
        <ChartPlaceholder title="Expected Time to Recovery" subtitle="bootstrap-based ETR" />
      )}
            <ChartPlaceholder title="Forward Stress — Range-bound" subtitle="no convergence" />
      <ChartPlaceholder title="Forward Stress — Correlation Flip" subtitle="cointegration reversal" />

    </div>
  );
}
