// app/api/v1/1-performance_metrics/calculators/per_account_drawdown.ts
import { drawdownMagnitude } from "./z_math_helpers";

export function computeDrawdownMagnitude(equity: number[]): number {
  return drawdownMagnitude(equity);
}
