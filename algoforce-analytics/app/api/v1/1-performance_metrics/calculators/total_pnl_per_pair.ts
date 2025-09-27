// app/api/v1/1-performance_metrics/calculators/total_pnl_per_pair.ts
import type { Bucket } from "../performance_metric_types";

export function totalPnlPerPair(
  items: Array<{ pair: string; net: number }>
): Bucket[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const p = (it.pair || "").toUpperCase();
    if (!p) continue;
    map.set(p, (map.get(p) ?? 0) + it.net);
  }
  return Array.from(map.entries()).map(([label, total]) => ({
    label,
    total: Number(total.toFixed(2)),
  }));
}
