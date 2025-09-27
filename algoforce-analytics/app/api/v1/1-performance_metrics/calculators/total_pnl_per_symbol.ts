// app/api/v1/1-performance_metrics/calculators/total_pnl_per_symbol.ts
import type { Bucket } from "../performance_metric_types";
import { baseFromSymbol } from "./z_math_helpers";

export function totalPnlPerSymbol(
  items: Array<{ symbol: string; net: number }>
): Bucket[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const base = baseFromSymbol((it.symbol || "").toUpperCase());
    if (!base) continue;
    map.set(base, (map.get(base) ?? 0) + it.net);
  }
  return Array.from(map.entries()).map(([label, total]) => ({
    label,
    total: Number(total.toFixed(2)),
  }));
}
