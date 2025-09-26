import type { CorrelationMatrix } from "./types";

/**
 * Simple pair-vs-pair correlation on aligned series.
 * If either variance is ~0 or length < 2, returns null.
 */
export function computePairCorrelationMatrix(
  pairs: string[],
  pairSeries: Record<string, number[]> // map: pair → spread (or return) series
): CorrelationMatrix {
  const out: CorrelationMatrix = {};
  for (let i = 0; i < pairs.length; i++) {
    const a = pairs[i];
    out[a] = {};
    for (let j = 0; j < pairs.length; j++) {
      const b = pairs[j];
      if (i === j) {
        out[a][b] = 1;
        continue;
      }
      const ax = pairSeries[a] ?? [];
      const bx = pairSeries[b] ?? [];
      const n = Math.min(ax.length, bx.length);
      if (n < 2) {
        out[a][b] = null;
        continue;
      }
      const meanA = ax.reduce((s, v) => s + v, 0) / n;
      const meanB = bx.reduce((s, v) => s + v, 0) / n;

      let cov = 0, varA = 0, varB = 0;
      for (let k = 0; k < n; k++) {
        const da = ax[k] - meanA;
        const db = bx[k] - meanB;
        cov += da * db;
        varA += da * da;
        varB += db * db;
      }
      if (varA <= 1e-12 || varB <= 1e-12) {
        out[a][b] = null;
      } else {
        out[a][b] = cov / Math.sqrt(varA * varB);
      }
    }
  }
  return out;
}