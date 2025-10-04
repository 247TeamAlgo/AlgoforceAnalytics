"use client";

import { Bucket, MetricsSlim } from "../../../lib/performance_metric_types";
import RankedBarCard from "./RankedBarCard";

export default function TotalPnlBySymbolCard({
  metrics,
  liveUpnlBySymbol,
  fmtUsd,
}: {
  metrics: MetricsSlim; // realized
  liveUpnlBySymbol?: Record<string, number>; // overlay (likely undefined with bulk-only)
  fmtUsd?: (x: number) => string;
}) {
  const rows: Bucket[] = (metrics.pnl_per_symbol ?? []).slice(0, 2000);

  return (
    <RankedBarCard<Bucket>
      title="Symbol Net PnL"
      description=""
      rows={rows}
      idKey="label"
      label={(r) => r.label}
      valueKey="total"
      valueFormat="usd"
      secondary={[]}
      barSizePx={18}
      fmtUsd={fmtUsd}
      initialTab="all"
      clampMode="none"
      maxChartHeightPx={520}
      itemsNoun="symbols"
      overlayMap={liveUpnlBySymbol}
    />
  );
}
