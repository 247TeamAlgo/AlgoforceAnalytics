// app/analytics_adem_3_josh/metrics/stationarity.ts
export interface StationarityRow {
  t: string;
  adf_p: number | null;
  kpss_p: number | null;
  johansen_stat: number | null;
  pass: boolean | null; // your rule: e.g., ADF p<α AND KPSS p>α
}

export interface StationarityConfig {
  windowDays: number;
  alpha: number; // e.g. 0.05
}

export async function computeRollingStationarity(
  days: string[],
  spread: Array<number | null>,
  cfg: StationarityConfig
): Promise<StationarityRow[]> {
  // Placeholder: wire to Python microservice here and fill real values.
  const out: StationarityRow[] = days.map((t) => ({
    t, adf_p: null, kpss_p: null, johansen_stat: null, pass: null,
  }));
  return out;
}

export function breakdownProbabilityPct(rows: StationarityRow[]): number | null {
  const eligible = rows.filter(r => r.pass != null);
  if (!eligible.length) return null;
  const fails = eligible.filter(r => r.pass === false).length;
  return (fails / eligible.length) * 100;
}
