// Strict client-side types (no `any`)
// app/analytics/types.ts

// ---------- Common ----------
export type ISODate = string; // "YYYY-MM-DD"

export type Account = {
  redisName: string;
  binanceName?: string;
  display?: string;
  strategy?: string | null;
  leverage?: number | null;
  monitored?: boolean;
};

// ---------- Metrics payload (mirrors server shape you return to the UI) ----------
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
  pnl_pos: number; // positive dollars
  pnl_neg: number; // negative dollars (negative)
  winrate_pct?: number | null; // for winrate card
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

  // duplicates / convenience
  daily_return_dollars: DailyReturnDollars[];
  mtd_return_dollars: number;
  mtd_total_fees_dollars: number;
  initial_balance: number;

  symbolExposures?: SymbolExposure[];
  pairExposures?: PairExposure[];
  concentration?: ConcentrationRisk;
  corrMatrix?: CorrelationMatrix;
};

// ---------- /api/metrics (multi-selection) ----------
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

// Union: endpoints may return either a single MetricsPayload or the multi-selection wrapper
export type MultiMetricsResponse = MetricsPayload | MultiSelectionResponse;

// ---------- Type guards ----------
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

// ---------- Small UI helpers ----------
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

// app/analytics/types.ts (append at bottom or where you keep UI types)

// ── Live report overlay (parsed from /api/report & /api/report/combined)
export type ReportOverlay = {
  date_str: string; // "09/21/2025, 06:24"
  overall_trades?: number; // 24
  pct_return?: number; // -7  (not a percent string)
  profit?: number; // -4744.34
  overall_winrate_pct?: number; // 83.33
  wallet_balance?: number; // 63023.65
  earning_balance?: number; // 0
  spot_balance?: number; // 0
  current_unrealized_pnl?: number; // -1551.35
  initial_balance?: number; // present on combined
};

export interface StrategyRiskResult {
  id: string;
  x: string;
  y: string;
  spread: {
    t: string;
    beta: number | null;
    s: number | null;
    mu: number | null;
    sigma: number | null;
    z: number | null;
  }[];
  reversion: {
    t: string;
    phi: number | null;
    strength: number | null;
    half_life_days: number | null;
  }[];
  stationarity: {
    t: string;
    adf_p: number | null;
    kpss_p: number | null;
    johansen_stat: number | null;
    pass: boolean | null;
  }[];
  breakdown_probability_pct: number | null;
  correlation: {
    t: string;
    pearson: number | null;
    spearman: number | null;
    kendall: number | null;
  }[];
}
