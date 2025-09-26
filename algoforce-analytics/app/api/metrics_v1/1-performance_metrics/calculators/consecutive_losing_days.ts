// algoforce-analytics\app\api\metrics_v1\1-performance_metrics\calculators\consecutive_losing_days.ts
import { DailyRow, Streaks } from "../metrics/types";

export function consecutiveLosingDays(daily: DailyRow[], threshold = 4): Streaks {
  let maxStreak = 0;
  let cur = 0;
  for (const r of daily ?? []) {
    if (r.net_pnl < 0) {
      cur++;
      if (cur > maxStreak) maxStreak = cur;
    } else cur = 0;
  }
  let currentStreak = 0;
  for (let i = (daily?.length ?? 0) - 1; i >= 0; i--) {
    if (daily![i].net_pnl < 0) currentStreak++;
    else break;
  }
  return {
    consecutive_losing_days: {
      max_streak: maxStreak,
      meets_threshold: maxStreak >= threshold,
      current_streak: currentStreak,
    },
  };
}