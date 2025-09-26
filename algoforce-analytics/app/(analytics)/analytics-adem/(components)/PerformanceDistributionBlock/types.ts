// Frequency-aware, scalable types. Today we only feed monthly, but
// daily/weekly can be added later with the same shapes.

export type Freq = "D" | "W" | "M";

export type DatedPoint = {
  date: string; // ISO date string
  value: number;
};

export type MetricsCore = {
  annual_return: number | null; // CAGR from full series
  annual_volatility: number | null; // annualized vol
  sharpe_ratio: number | null; // main display window (freq-aware)
  sortino_ratio: number | null; // main display window (freq-aware)
  calmar_ratio: number | null; // main display window (freq-aware)
  max_drawdown: number; // negative number
  n_periods: number; // length of primary series
  freq: Freq; // primary frequency used for metrics
};

export type RollingRow = {
  windowLabel: string; // e.g. "30D", "90D", "3M", "6M"
  periods: number; // number of steps in the window at that freq
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  annReturn: number | null; // annualized CAGR over the window
};

export type RollingTable = {
  rows: RollingRow[];
};

export type YTDRow = {
  year: number;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
};

export type PnLBreakdownRow = {
  freq: "Daily" | "Weekly" | "Monthly";
  observations: number;
  totalReturn: number; // compounded
  mean: number; // arithmetic
  std: number; // sample std
  hitRatio: number; // fraction > 0
};

export type PnLBreakdown = {
  rows: PnLBreakdownRow[];
};

export type AvgReturnRow = {
  horizonLabel: string; // e.g. "3m", "6m", "12m"
  mean: number;
  p5: number;
  p50: number;
  p95: number;
};

export type DDProbPoint = {
  thresholdPct: number; // X%
  horizonLabel: string; // e.g. "3m", "6m", "12m"
  probability: number; // 0..1
};

export type RunLenRow = {
  horizonLabel: string; // "6m", "12m", "24m"
  k: number; // streak length
  probability: number; // 0..1 of losing > k in horizon
};

export type StreakSummary = {
  // Losing streaks on the *primary* series (today: monthly overall)
  currentOverall: number;
  maxOverall: number;
  // Top accounts by current losing streak (same freq)
  byAccountCurrent: Array<{ account: string; run: number }>;
};

export type DashboardData = {
  metrics: MetricsCore;
  equity: DatedPoint[];
  drawdown: DatedPoint[];
  rolling: { table: RollingTable; ytd: YTDRow[] };
  pnlBreakdown: PnLBreakdown;
  avgSummary: AvgReturnRow[];
  drawdownExceed: DDProbPoint[];
  runlen: RunLenRow[];
  streaks: StreakSummary;
};

// --- JSON schema for current data source (monthly totals per month) ---
export type MonthlyJson = {
  months: Array<{
    month: string; // "YYYY-MM"
    accounts: Array<{
      name: string;
      strategy: string;
      initial_balance: number;
      final_balance: number;
      leverages: Record<string, { return_pct: number; profit: number }>;
    }>;
    totals: {
      group1?: {
        initial_balance: number;
        final_balance: number;
        leverages: Record<string, { return_pct: number; profit: number }>;
      };
      group2?: {
        initial_balance: number;
        final_balance: number;
        leverages: Record<string, { return_pct: number; profit: number }>;
      };
      overall: {
        initial_balance: number;
        final_balance: number;
        leverages: Record<string, { return_pct: number; profit: number }>;
      };
    };
  }>;
};
