export type Iso = string;

// ---------- Redis (Tradesheet) ----------
export interface AccountsheetEntry {
  pair: string;              // e.g. "DOTUSDT_NEARUSDT"
  positions: number;
  tp_counter: number;
  entry_dt: Iso | null;
  pos_size: number;
  entry_price_0: number | null;
  entry_price_1: number | null;
  entry_order_0: string | number | null;
  entry_order_1: string | number | null;
  qty_0: number | null;
  qty_1: number | null;
  exit_price_0: number | null;
  exit_price_1: number | null;
  exit_order_0: string | number | 0 | null;
  exit_order_1: string | number | 0 | null;
  exit_dt: Iso | null;
  leverage: number | null;
  entry_type: number | null;
  dollar_pnl?: number | null;

  [k: string]: string | number | null | undefined;
}

export type AccountsheetObject = Record<string, AccountsheetEntry>;

export interface PairRow {
  id: string;               // e.g. "pair_42"
  pair: string;             // e.g. "ADAUSDT_AVAXUSDT"
  entry: AccountsheetEntry; // original row
}

export interface ExposureRow {
  symbol: string;
  gross: number;   // absolute exposure in USD
  net: number;     // signed exposure in USD
}

export interface PairExposureRow {
  pair: string;
  gross: number;
  net: number;
}

export interface ConcentrationRisk {
  largest_pair_pct: number | null;
}

export interface CorrelationMatrix {
  [pairA: string]: {
    [pairB: string]: number | null; // correlation coefficient
  };
}