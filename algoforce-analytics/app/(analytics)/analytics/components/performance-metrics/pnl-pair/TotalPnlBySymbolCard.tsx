"use client";

import { Bucket, MetricsSlim } from "../../../lib/performance_metric_types";
import RankedBarCard from "./RankedBarCard";

function normalizeOverlayMap(
  map?: Record<string, number>
): Record<string, number> | undefined {
  if (!map) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k.toUpperCase()] = n;
  }
  return out;
}

export default function TotalPnlBySymbolCard({
  metrics,
  liveUpnlBySymbol,
  fmtUsd,
}: {
  metrics: MetricsSlim; // realized
  liveUpnlBySymbol?: Record<string, number>; // overlay
  fmtUsd?: (x: number) => string;
}) {
  const rows: Bucket[] = (metrics.pnl_per_symbol ?? []).slice(0, 2000);
  const overlayMap = normalizeOverlayMap(liveUpnlBySymbol);

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
      overlayMap={overlayMap}
    />
  );
}
