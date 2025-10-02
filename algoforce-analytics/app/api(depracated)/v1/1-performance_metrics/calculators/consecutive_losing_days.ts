// app/api/v1/1-performance_metrics/calculators/consecutive_losing_days.ts
import type { DailySlim, StreaksSlim } from "../performance_metric_types";

/**
 * Consecutive losing streaks where only strictly negative days count.
 * (net_pnl < 0 extends the streak; 0 does not.)
 */
export function computeStreaks(daily: DailySlim[]): StreaksSlim {
  let current = 0;
  let max = 0;
  for (const r of daily) {
    const v = Number(r?.net_pnl ?? 0);
    if (v < 0) {
      current += 1;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return { current, max };
}

/**
 * Max consecutive losing days; optional Python parity with `includeZero`.
 * - includeZero=false → strictly negative only (default)
 * - includeZero=true  → non-positive (<= 0) counts towards the streak
 */
export function maxLosingStreak(
  daily: DailySlim[],
  includeZero: boolean = false
): number {
  let streak = 0;
  let max = 0;
  for (const r of daily) {
    const v = Number(r?.net_pnl ?? 0);
    const isNeg = includeZero ? v <= 0 : v < 0;
    if (isNeg) {
      streak += 1;
      if (streak > max) max = streak;
    } else {
      streak = 0;
    }
  }
  return max;
}
