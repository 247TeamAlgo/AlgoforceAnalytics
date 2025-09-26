import type { PairRow, ExposureRow, PairExposureRow, ConcentrationRisk } from "./types";

/**
 * Per-symbol exposures by summing USD notionals per leg.
 * Assumes qty is signed (short < 0, long > 0). If your qty is always positive
 * with a separate side flag, apply sign before calling this.
 */
export function computeSymbolExposures(rows: PairRow[]): ExposureRow[] {
  const map = new Map<string, { gross: number; net: number }>();

  for (const r of rows) {
    const [sym0, sym1] = r.pair.split("_"); // e.g. "ADAUSDT_AVAXUSDT"
    const q0 = r.entry.qty_0 ?? 0;
    const q1 = r.entry.qty_1 ?? 0;
    const p0 = r.entry.entry_price_0 ?? 0;
    const p1 = r.entry.entry_price_1 ?? 0;

    const legs = [
      { symbol: sym0, notional: q0 * p0 },
      { symbol: sym1, notional: q1 * p1 },
    ];

    for (const leg of legs) {
      const cur = map.get(leg.symbol) ?? { gross: 0, net: 0 };
      cur.gross += Math.abs(leg.notional);
      cur.net += leg.notional;
      map.set(leg.symbol, cur);
    }
  }

  return Array.from(map.entries()).map(([symbol, { gross, net }]) => ({
    symbol,
    gross,
    net,
  }));
}

/**
 * Per-pair exposures, aggregated across rows/accounts.
 */
export function computePairExposures(rows: PairRow[]): PairExposureRow[] {
  const map = new Map<string, { gross: number; net: number }>();

  for (const r of rows) {
    const q0 = r.entry.qty_0 ?? 0;
    const q1 = r.entry.qty_1 ?? 0;
    const p0 = r.entry.entry_price_0 ?? 0;
    const p1 = r.entry.entry_price_1 ?? 0;

    const notional0 = q0 * p0;
    const notional1 = q1 * p1;

    const cur = map.get(r.pair) ?? { gross: 0, net: 0 };
    cur.gross += Math.abs(notional0) + Math.abs(notional1);
    cur.net += notional0 + notional1;
    map.set(r.pair, cur);
  }

  return Array.from(map.entries()).map(([pair, { gross, net }]) => ({
    pair,
    gross,
    net,
  }));
}

export function computeConcentrationRisk(
  exposures: PairExposureRow[],
  totalBalance: number
): ConcentrationRisk {
  if (!exposures.length || totalBalance <= 0) return { largest_pair_pct: null };
  const maxExp = Math.max(...exposures.map((e) => e.gross));
  return { largest_pair_pct: (maxExp / totalBalance) * 100 };
}