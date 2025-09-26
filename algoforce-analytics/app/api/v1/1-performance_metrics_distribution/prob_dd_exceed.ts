// app/analytics_adem_1/prob_dd_exceed.ts
import {
  drawdownStats,
  equitySeries,
  rollBalances,
  fetchDailyRows,
  resolveAsOf,
  addDaysISO,
} from "../../../lib/metrics_core";
import { readBaselineUsd } from "@/lib/baseline";
import type { MetricConfig } from "@/lib/types";

function drawdownProbTable( // based on Adem's code named bootstrap_metrics.py
  maxDrawdownPct: number | null,
  // thresholds: number[] = Array.from({ length: 10 }, (_, i) => (i + 1) / 100) // 0.01..0.10
  thresholds: number[]
): Array<{ threshold: number; probability: number }> {
  if (maxDrawdownPct == null) {
    return thresholds.map((th) => ({ threshold: th, probability: 0 }));
  }
  const magnitudePct = Math.abs(maxDrawdownPct); // already in percent units
  return thresholds.map((th) => {
    const thPct = th * 100; // convert decimal to percent units
    const probability = magnitudePct >= thPct ? 1 : 0;
    return { threshold: th, probability };
  });
}

export async function probDDExceed(accountKey: string, cfg: MetricConfig){
  // Add a config for daily/weekly, got lazy and this was borrowed from metrics
  const tz = cfg.tz || "Asia/Manila";
  const lastNDays = Number(cfg.lastNDays ?? 10);
  const asOfLocal = resolveAsOf(cfg.runDate, tz);
  const endLocalISO = addDaysISO(asOfLocal, +1); // inclusive of run date
  const startLocalISO = addDaysISO(asOfLocal, -(lastNDays - 1));
  const initial_balance = readBaselineUsd(accountKey);
  const daily = await fetchDailyRows(accountKey, tz, startLocalISO, endLocalISO);
  const rolled = rollBalances(daily, initial_balance);
  const eq = equitySeries(rolled);
  const { block } = drawdownStats(eq);
  const max_drawdown_pct = block.max_drawdown_pct; // percent, negative or null
  const thresholds = cfg.X_list;
  const table = drawdownProbTable(max_drawdown_pct, thresholds ?? []);
  return table;
}

// Reference from bootstrap_metrics.py
// def drawdown_prob_table(simulated_drawdowns, thresholds=np.arange(-0.01, -0.11, -0.01)):
//     """
//     Compute probability of exceeding given drawdown thresholds.
    
//     Parameters
//     ----------
//     simulated_drawdowns : pd.Series
//         Series of simulated max drawdowns (negative values).
//     thresholds : array-like
//         Drawdown thresholds to check (e.g., -0.01 = -1%, -0.02 = -2%).
    
//     Returns
//     -------
//     pd.DataFrame
//         Table with thresholds and probabilities.
//     """
//     probs = []
//     for th in thresholds:
//         prob = (simulated_drawdowns <= th).mean()
//         probs.append(prob)
//     return pd.DataFrame({
//         "threshold": thresholds,
//         "probability": probs
//     })
// ...
// dd_table = drawdown_prob_table(results["simulated_max_drawdowns"], thresholds=np.arange(-0.01, -0.11, -0.01))