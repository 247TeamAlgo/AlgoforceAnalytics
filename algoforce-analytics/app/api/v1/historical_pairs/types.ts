// app/api/historical_pairs/types.ts

export type TradeRow = {
  pair: string;                    // "APTUSDT_AVAXUSDT"
  entry_dt?: string | null;
  exit_dt?: string | null;

  // per-leg fills (avg is fine; use your best available)
  avg_price_0?: number | null;
  avg_price_1?: number | null;
  exit_price_0?: number | null;
  exit_price_1?: number | null;
  qty_0?: number | null;           // signed (+ long / - short)
  qty_1?: number | null;
  leverage?: number | string | null; // not used for $PnL below
};

export type BucketRow = {
  label: string;           // pair like "APTUSDT_AVAXUSDT" or symbol "APTUSDT"
  count: number;           // # of closed trades contributing
  pnl_pos: number;         // sum of positive PnL (USD)
  pnl_neg: number;         // sum of negative PnL (USD) (negative value)
  winrate_pct: number | null; // 0..100
};

export type HistoricalResponse = {
  perPair: BucketRow[];
  perSymbol: BucketRow[];
};
