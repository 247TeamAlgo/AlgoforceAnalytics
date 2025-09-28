/* Core scalar types */
export type ISODate = string; // "YYYY-MM-DD"

/* Buckets for per-symbol / per-pair */
// "@/lib/performance_metric_types"

export interface Bucket {
  label: string;
  total: number;
  /** Allow generic access so Bucket is compatible with Record<string, unknown> */
  [k: string]: unknown;
}

/* Daily row (server output) */
export interface DailySlim {
  day: ISODate; // ISO YYYY-MM-DD (naive, boundary already applied server-side)
  gross_pnl: number; // summed realized before fees
  fees: number; // summed fees
  net_pnl: number; // gross - fees (+ upnl on end if requested)
}

/* Streaks structure */
export interface StreaksSlim {
  current: number; // current consecutive losses (strict negative only)
  max: number; // max consecutive losses over the window
}

/* Per-account metrics (slim) */
export interface MetricsSlim {
  initial_balance: number;
  window_start: ISODate;
  window_end: ISODate;
  total_return_pct_over_window: number | null; // percent, 2dp
  drawdown_mag: number; // magnitude in [0..1], not percent
  streaks: StreaksSlim;
  daily: DailySlim[];

  // Realized-only leaderboards (current behavior)
  pnl_per_symbol: Bucket[];
  pnl_per_pair: Bucket[];

  // OPTIONAL live UPNL breakdowns (included when requested by the client)
  /** Live UPNL per symbol from Redis (if available). */
  upnl_per_symbol?: Bucket[];

  /** Realized + live UPNL combined per symbol. */
  pnl_per_symbol_incl_upnl?: Bucket[];

  /** Placeholder for future pair-inclusive totals (requires positions→pair mapping for open legs). */
  pnl_per_pair_incl_upnl?: Bucket[];
}

/* Account metadata returned by /api/accounts (lightly typed here for convenience) */
export interface AccountInfoLite {
  redisName: string;
  display?: string;
  monitored?: boolean;
}

/* Response meta; extended to include the applied day boundary */
export interface ResponseMeta {
  server_time_utc: string;
  run_date_used: ISODate;
  day_start_hour?: number; // 0..23; included when server wants to echo boundary used
  /** Optional echo of client timezone for display only (no implicit boundary changes). */
  tz_resolved?: string;
}

/* Optional debug payload to verify streak inputs */
export interface DebugTailItem {
  day: ISODate;
  net: number;
}
export interface DebugInfo {
  day_start_hour: number;
  window: { start: ISODate; end: ISODate };
  tails: Record<string, DebugTailItem[]>;
}

/* Heavy response (slim) */
export interface MultiMetricsResponseSlim {
  selected: string[]; // redisNames included
  window: { start: ISODate; end: ISODate; earliest: boolean };
  merged: MetricsSlim; // merged across selected
  per_account: Record<string, MetricsSlim>; // keyed by redisName
  ignored?: string[]; // invalid ids in request
  meta: ResponseMeta; // includes boundary and optional tz echo
  debug?: DebugInfo; // optional, behind ?debug=1
}

/* Re-export used in other files */
export type { Bucket as BucketType };
