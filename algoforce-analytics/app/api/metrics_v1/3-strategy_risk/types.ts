// FILE: app/analytics_adem_3_josh/types.ts

// ---------- Shared ----------
export type Iso = string;

// ---------- Redis (Tradesheet) ----------
export interface AccountsheetEntry {
  pair: string;              // e.g. "DOTUSDT_NEARUSDT"
  positions: number;
  tp_counter: number;
  entry_dt: Iso | null;
  pos_size: number;
  entry_price_0: number;
  entry_price_1: number;
  entry_order_0: string | number | null;
  entry_order_1: string | number | null;
  qty_0: number;
  qty_1: number;
  exit_price_0: number;
  exit_price_1: number;
  exit_order_0: string | number | 0;
  exit_order_1: string | number | 0;
  exit_dt: Iso | null;
  leverage: number;
  entry_type: number;
  dollar_pnl?: number;

  // allow unknown extras without using `any`
  [k: string]: string | number | null | undefined;
}

export type AccountsheetObject = Record<string, AccountsheetEntry>;

export interface PairRow {
  id: string;       // e.g. "pair_45"
  pair: string;     // e.g. "DOTUSDT_NEARUSDT"
  entry: AccountsheetEntry;
}

// ---------- SQL OHLC ----------
export interface OhlcRow {
  datetime: Iso;    // stored as string (UTC from SQL)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export type OhlcSeries = OhlcRow[];

// ---------- Derived Analytics ----------
export interface SpreadPoint {
  datetime: Iso;
  spread: number;       // raw spread
  zscore: number;       // standardized spread
}

export interface HalfLifeResult {
  halfLife: number | null; // in bars, null if regression fails
  regressionBeta?: number;
}

export interface StationarityTestResult {
  adf_p: number | null;
  kpss_p: number | null;
  johansen_stat?: number | null;
  stationary: boolean | null; // aggregated conclusion
}

export interface CorrelationWindow {
  start: Iso;
  end: Iso;
  pearson: number | null;
  spearman: number | null;
  kendall: number | null;
}

export interface BreakdownProbability {
  window: string;     // e.g. "30d", "90d"
  failPct: number;    // % of windows failing stationarity
}
