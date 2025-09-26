// algoforce-analytics\app\api\metrics_v1\1-performance_metrics\metrics\types.ts

export type AccountKey = import("../../../../../lib/accounts").AccountKey;

/* Redis payloads */
export type LiveColumns = {
  symbol: Record<string, string>;
  unrealizedProfit: Record<string, string>;
};

export interface RawBalance {
  balance: number; // futures wallet
  avail_balance: number; // available in futures
  earn_balance: number;
  spot_balance: number;
}

export interface RawPrmEntry {
  entry_zscore: number;
  exit_zscore: number;
  tp: number; // unlevered base; server multiplies by leverage for UI
  sl: number; // unlevered base; server multiplies by leverage for UI
}

export interface RawZpnlEntry {
  pnl: number; // unlevered fractional pnl per notional
  z_score: number;
}

export interface RedisDbEntry {
  pair: string; // "BTCUSDT_ETHUSDT"
  positions: number; // 1=open, 0=closed, others=disabled
  qty_0: number;
  qty_1: number;
  leverage: number;
  entry_price_0?: number;
  entry_price_1?: number;
}

/* NEW: structured legs sent by server (no client regex) */
export type QtyLeg = {
  sign: 1 | -1;
  qty: number;
  sym: string; // "BTC", "ETH"
};

export interface FrontendRow {
  base: string;
  inlinePair: string;
  uniqueLabel: string; // used only for pinning/search
  positions: number; // 1 open, 0 closed, others disabled
  current_pos: number; // -1 / 0 / +1 (sign of qty_0)

  currentZ: number;
  entryZ: number;
  exitZ: number;

  color: "green" | "red" | "black";

  // structured (no regex)
  legs: QtyLeg[];
  leverage: number;
  posSize: number;

  // levered cutoffs for guides
  tpCutoff: number;
  slCutoff: number;

  // levered PnL
  netPnl: number; // fraction
  netPnlDollar: number; // $
}

export interface FrontendBalances {
  marginBalance: number;
  balanceUsedPct: number;
  availBalance: number;
  earnBalance: number;
  spotBalance: number;
  overallBalance: number;
  binanceBalance: number;
  returnPct: number;
}

export interface DashboardViewModel {
  account: AccountKey;
  rows: FrontendRow[];
  balances: FrontendBalances;
  maxAbsZ: number;
  maxTpCutoff: number;
  minSlCutoff: number;
}

export type Trade = {
  exit_dt?: string;
  qty_0?: number;
  entry_price_0?: number;
  exit_price_0?: number;
  qty_1?: number;
  entry_price_1?: number;
  exit_price_1?: number;
};


// lib/types.ts

export type ISODate = string; // "YYYY-MM-DD"

export type MetricsPayload = {
    config: {
        initial_balance: number;
        run_date: ISODate;
        last_n_days: number;
    };
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
    counts: { number_of_trades_total: number };
    streaks: Streaks;

    // duplicates / convenience
    daily_return_dollars: DailyReturnDollars[];
    mtd_return_dollars: number;
    mtd_total_fees_dollars: number;
    initial_balance: number;
};

export interface MetricConfig {
  tz?: string;

  /** Legacy (honored only if no startDate/endDate are provided) */
  lastNDays?: number;      // inclusive count of days
  runDate?: string;        // YYYY-MM-DD; inclusive end day

  /** Date picker */
  startDate?: string;      // YYYY-MM-DD inclusive
  endDate?: string;        // YYYY-MM-DD inclusive
  earliest?: boolean;      // if true and startDate is not provided, start from earliest available data

  /** Arbitrary yet optional number/s as input args */
  X_list?: number[];       // optional list of numbers for metrics e.g. prob of dd exceed X%
}

export interface DailyRow {
  day: ISODate;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
}

export interface RolledRow extends DailyRow {
  start_balance: number;
  end_balance: number;
  daily_return_pct: number | null;
}

export interface EquityPoint {
  day: ISODate;
  equity: number;
}

export interface DrawdownBlock {
  max_drawdown_pct: number | null;
  max_drawdown_peak_day: ISODate | null;
  current_drawdown_pct: number | null;
  current_drawdown_days: number;
}

export interface DrawdownPeriod {
  peak_day: ISODate | null;
  trough_day: ISODate | null;
  recovery_day: ISODate | null;
}

export interface ConsecutiveLosingDays {
  max_streak: number;
  meets_threshold: boolean;
  current_streak: number;
}

export interface Streaks {
  consecutive_losing_days: ConsecutiveLosingDays;
}

export interface DailyReturnDollars {
  day: ISODate;
  daily_profit_loss_usd: number;
}