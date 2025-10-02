import { Bucket } from "../performance_metric_types";

/**
 * Python-parity:
 * Sum REALIZED net (realizedPnl - commission), grouped by the FULL symbol (e.g., "BTCUSDT").
 * No base-asset collapsing and NO UPNL overlay.
 */
export function totalPnlPerSymbol(
  items: Array<{ symbol: string; net: number }>
): Bucket[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const sym = (it.symbol || "").toUpperCase().trim();
    if (!sym) continue;
    map.set(sym, (map.get(sym) ?? 0) + (Number.isFinite(it.net) ? it.net : 0));
  }
  return Array.from(map.entries()).map(([label, total]) => ({
    label,
    total: Number(total.toFixed(2)),
  }));
}
