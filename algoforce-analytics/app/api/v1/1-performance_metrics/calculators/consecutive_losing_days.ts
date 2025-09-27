// app/api/v1/1-performance_metrics/calculators/consecutive_losing_days.ts
import type { DailySlim, StreaksSlim } from "../performance_metric_types";
import { losingStreaksFromDaily } from "./z_math_helpers";

export function computeStreaks(daily: DailySlim[]): StreaksSlim {
  return losingStreaksFromDaily(daily);
}
