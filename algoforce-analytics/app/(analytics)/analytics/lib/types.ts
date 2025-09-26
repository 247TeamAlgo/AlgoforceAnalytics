// Strict client-side types (no `any`)
// app/(analytics)/analytics/lib/types.ts

export type ISODate = string; // "YYYY-MM-DD"

export type Account = {
  redisName: string;
  binanceName?: string;
  display?: string;
  strategy?: string | null;
  leverage?: number | null;
  monitored?: boolean;
};

export type DailyRow = {
  day: ISODate;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
};

export type RolledRow = DailyRow & {
  start_balance: number;
  end_balance: number;
  daily_return_pct: number | null;
};

export type DrawdownBlock = {
  max_drawdown_pct: number | null;
  max_drawdown_peak_day: ISODate | null;
  current_drawdown_pct: number | null;
  current_drawdown_days: number;
};

export type DrawdownPeriod = {
  peak_day: ISODate | null;
  trough_day: ISODate | null;
  recovery_day: ISODate | null;
};

export type DailyReturnDollars = {
  day: ISODate;
  daily_profit_loss_usd: number;
};

export type ConsecutiveLosingDays = {
  max_streak: number;
  meets_threshold: boolean;
  current_streak: number;
};

export type Streaks = {
  consecutive_losing_days: ConsecutiveLosingDays;
};

export interface SymbolExposure {
  symbol: string;
  gross: number;
  net: number;
}

export interface PairExposure {
  pair: string;
  gross: number;
  net: number;
}

export interface ConcentrationRisk {
  largest_pair_pct: number | null;
}

export interface CorrelationMatrix {
  [pairA: string]: {
    [pairB: string]: number | null;
  };
}

export type HistoricalBucket = {
  label: string;
  count: number;
  pnl_pos: number;
  pnl_neg: number;
  winrate_pct?: number | null;
};

export type HistoricalSummary = {
  perPair: HistoricalBucket[];
  perSymbol: HistoricalBucket[];
};

export type MetricsPayload = {
  config: {
    initial_balance: number;
    run_date: ISODate;
    last_n_days: number;
  };
  historical?: HistoricalSummary;
  daily_return_last_n_days: {
    window_start: ISODate;
    window_end: ISODate;
    daily_rows: RolledRow[];
    total_return_pct_over_window: number | null;
  };
  month_to_date: {
    mtd_return_pct: number | null;
    mtd_return_usd: number;
    mtd_total_fees_usd: number;
    mtd_drawdown_pct: number | null;
  };
  drawdowns: DrawdownBlock;
  drawdown_period: DrawdownPeriod;
  
  win_rates: {
    rolling_30d_win_rate_pct: number | null;
    win_rate_from_run_start_pct: number | null;
  };
  counts: { number_of_trades_total: number };
  streaks: Streaks;

  daily_return_dollars: DailyReturnDollars[];
  mtd_return_dollars: number;
  mtd_total_fees_dollars: number;
  initial_balance: number;
};

export type MetricsMultiMeta = {
  server_time_utc: string;
  server_time_in_tz: string;
  tz_resolved: string;
  run_date_used: ISODate;
};

export type MultiSelectionResponse = {
  selected: string[];
  merged: MetricsPayload;
  per_account: Record<string, MetricsPayload>;
  meta?: MetricsMultiMeta;
};

export type MultiMetricsResponse = MetricsPayload | MultiSelectionResponse;

export function isMetricsPayload(v: unknown): v is MetricsPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return "config" in o && "daily_return_last_n_days" in o;
}

export function isMultiSelectionResponse(
  v: unknown
): v is MultiSelectionResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return "merged" in o && "per_account" in o;
}

export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}${v.toFixed(2)}%`;
}

export function displayName(a: Account): string {
  return a.display ?? a.redisName;
}
