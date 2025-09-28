"use client";

import { Bucket, MetricsSlim } from "../../../lib/performance_metric_types";
import RankedBarCard from "./RankedBarCard";
import { fmtUsd } from "../../../lib/performance_metric_types";

export default function TotalPnlByPairCard({
  metrics,
}: {
  metrics: MetricsSlim;
}) {
  const rows: Bucket[] = (metrics.pnl_per_pair ?? []).slice(0, 2000);

  return (
    <RankedBarCard<Bucket>
      title="Total PnL — Pairs"
      description="Realized net per pair from heavy aggregate."
      rows={rows}
      idKey="label"
      label={(r) => r.label}
      valueKey="total"
      valueFormat="usd"
      secondary={[]}
      defaultTopN={15}
      fmtUsd={fmtUsd}
      initialTab="all"
      itemsNoun="pairs"
    />
  );
}
