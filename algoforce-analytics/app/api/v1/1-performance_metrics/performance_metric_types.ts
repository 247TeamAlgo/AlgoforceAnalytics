// app/api/v1/1-performance_metrics/performance_metric_types.ts

/* ---------- Core scalar types ---------- */
export type ISODate = `${number}-${number}-${number}`;

/* ---------- Buckets (aggregations) ---------- */
export interface Bucket {
  label: string; // symbol, pair, etc.
  total: number; // summed net PnL (USD)
}

/* ---------- Daily rows (calendarized, UTC) ---------- */
export interface DailySlim {
  day: ISODate; // YYYY-MM-DD (UTC)
  gross_pnl: number; // realized before fees
  fees: number; // commissions/fees
  net_pnl: number; // gross - fees (+ upnl on end date)
}

/* ---------- Streaks ---------- */
export interface StreaksSlim {
  current: number; // current consecutive losing days
  max: number; // maximum consecutive losing days in window
}

/* ---------- Metrics payload (per-account or merged) ---------- */
export interface MetricsSlim {
  initial_balance: number; // baseline USD
  window_start: ISODate; // inclusive (UTC)
  window_end: ISODate; // inclusive (UTC)
  total_return_pct_over_window: number | null; // ((endEq - initial)/initial)*100
  drawdown_mag: number; // positive magnitude (e.g., 0.1083 for -10.83%)
  streaks: StreaksSlim;
  daily: DailySlim[]; // full calendarized series
  pnl_per_symbol: Bucket[]; // summed by base symbol
  pnl_per_pair: Bucket[]; // summed by pair (from tradesheet map)
}

/* ---------- Multi-account response ---------- */
export interface MultiMetricsResponseSlim {
  selected: string[]; // redisNames
  window: { start: ISODate; end: ISODate; earliest: boolean };
  merged: MetricsSlim;
  per_account: Record<string, MetricsSlim>;
  ignored?: string[]; // unknown account keys requested
  meta?: {
    server_time_utc: string; // ISO timestamp (UTC)
    run_date_used: ISODate; // equals window.end
  };
}
