// app/analytics/MarketRiskTab.tsx
"use client";

import type { MetricsPayload } from "../types";
import ChartPlaceholder from "../ChartPlaceholder";
import RealizedVolatilityCard from "./RealizedVolatilityCard";
import VarEsCard from "../VarEsCard";
import DrawdownMonitorCard from "./DrawdownMonitorCard";

export default function MarketRiskTab({ merged }: { merged: MetricsPayload | null }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {merged ? <RealizedVolatilityCard metrics={merged} /> : (
        <ChartPlaceholder title="Realized Volatility" subtitle="Rolling 30d / 90d" />
      )}
      {merged ? <VarEsCard metrics={merged} /> : (
        <ChartPlaceholder title="VaR & Expected Shortfall" subtitle="Historical 95% / 99%" />
      )}
      {merged ? <DrawdownMonitorCard metrics={merged} /> : (
        <ChartPlaceholder title="Drawdown Monitor" subtitle="Equity vs drawdowns" />
      )}
    </div>
  );
}
