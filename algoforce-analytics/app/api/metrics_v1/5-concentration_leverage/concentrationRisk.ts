// app/analytics_adem_5/concentrationRisk.ts
import type { ConcentrationRisk, PairExposureRow } from "./types";

export function computeConcentrationRisk(
  exposures: PairExposureRow[],
  totalBalance: number
): ConcentrationRisk {
  if (!exposures.length || totalBalance <= 0) return { largest_pair_pct: null };
  const maxExp = Math.max(...exposures.map((e) => e.gross));
  return { largest_pair_pct: (maxExp / totalBalance) * 100 };
}