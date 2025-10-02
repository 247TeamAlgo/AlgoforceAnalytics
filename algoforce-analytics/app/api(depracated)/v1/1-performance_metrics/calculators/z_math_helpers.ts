// app/api/v1/1-performance_metrics/calculators/z_math_helpers.ts
// (kept local to calculators; no dependency on client lib)

export interface DailySlim {
  day: string; // ISO YYYY-MM-DD
  net_pnl: number;
}
export interface StreaksSlim {
  current: number;
  max: number;
}

/** YYYY-MM-DD from a JS Date in UTC (used only for range generation). */
export function toISODateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build full calendar [start..end] as ISO dates (no tz semantics needed). */
export function dateRangeUTC(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d0 = new Date(`${startIso}T00:00:00.000Z`);
  const d1 = new Date(`${endIso}T00:00:00.000Z`);
  for (let d = d0; d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(toISODateUTC(d));
  }
  return out;
}

/** Consecutive losing streaks from daily net pnl where ONLY < 0 counts. */
export function losingStreaksFromDaily(daily: DailySlim[]): StreaksSlim {
  let cur = 0;
  let max = 0;
  for (const r of daily) {
    if ((r?.net_pnl ?? 0) < 0) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return { current: cur, max };
}

/** Max drawdown magnitude (positive) from equity series. */
export function drawdownMagnitude(equity: number[]): number {
  let peak = Number.NEGATIVE_INFINITY;
  let minDD = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < minDD) minDD = dd;
    }
  }
  return Math.abs(minDD);
}

/** Sum buckets by label. */
export function mergeBuckets(
  a: Array<{ label: string; total: number }>,
  b: Array<{ label: string; total: number }>
): Array<{ label: string; total: number }> {
  const map = new Map<string, number>();
  for (const it of a) map.set(it.label, (map.get(it.label) ?? 0) + it.total);
  for (const it of b) map.set(it.label, (map.get(it.label) ?? 0) + it.total);
  return Array.from(map.entries()).map(([label, total]) => ({ label, total }));
}

/** Base asset extractor: "BTCUSDT" -> "BTC" (also USD/BUSD). */
export function baseFromSymbol(sym: string): string {
  return sym.replace(/(USDT|USD|BUSD)$/i, "");
}

/** Safe numeric parse from possible string/number; returns 0 if NaN. */
export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
