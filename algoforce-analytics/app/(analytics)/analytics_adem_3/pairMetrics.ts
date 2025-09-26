// app/analytics_adem_3_josh/metrics/pairMetrics.ts
import type { OhlcBySymbol } from "./ohlc";
import { alignCloses } from "./ohlc";
import { computeSpreadZ } from "./spread";
import { computeReversion } from "./reversion";
import { computeRollingCorrelations } from "./correlation";
import { computeRollingStationarity, breakdownProbabilityPct } from "./stationarity";

export interface PairMetrics {
  id: string;
  x: string;
  y: string;
  spread: ReturnType<typeof computeSpreadZ>;
  reversion: ReturnType<typeof computeReversion>;
  correlation: ReturnType<typeof computeRollingCorrelations>;
  stationarity: Awaited<ReturnType<typeof computeRollingStationarity>>;
  breakdown_probability_pct: number | null;
}

export async function computePairMetrics(
  id: string,
  x: string,
  y: string,
  ohlc: OhlcBySymbol,
  windowDays: number,
  alpha: number
): Promise<PairMetrics> {
// ){
  const ax = ohlc[x] ?? [];
  const by = ohlc[y] ?? [];
  const { days, x: xClose, y: yClose } = alignCloses(ax, by);

  const spreadRows = computeSpreadZ(days, xClose, yClose, windowDays);
  const reversionRows = computeReversion(days, spreadRows.map(r => r.s), windowDays);
  const corrRows = computeRollingCorrelations(days, xClose, yClose, windowDays);
  const statRows = await computeRollingStationarity(days, spreadRows.map(r => r.s), { windowDays, alpha });

  return {
    id, x, y,
    spread: spreadRows,
    reversion: reversionRows,
    correlation: corrRows,
    stationarity: statRows,
    breakdown_probability_pct: breakdownProbabilityPct(statRows),
  };
}
