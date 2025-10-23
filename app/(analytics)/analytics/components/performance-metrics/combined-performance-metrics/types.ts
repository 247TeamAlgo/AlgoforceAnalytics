export type DateToRow = Record<string, Record<string, number>>;

export type StrategyPerf = {
  accounts: string[];
  drawdown: { realized: number; margin: number };
  return: { realized: number; margin: number };
};

export type BulkMetricsResponse = {
  window?: { startDay?: string; endDay?: string; mode?: string };
  accounts?: string[];

  // Account-level time series (reshaped)
  balance?: Record<string, Record<string, number>> | undefined;
  balancePreUpnl?: Record<string, Record<string, number>> | undefined;

  // Combined totals
  combinedLiveMonthlyReturn?: { total: number } | undefined;
  combinedLiveMonthlyDrawdown?: { total: number } | undefined;
  combinedLiveMonthlyReturnWithUpnl?: { total: number } | undefined;
  combinedLiveMonthlyDrawdownWithUpnl?: { total: number } | undefined;

  // MTD aggregates keyed by account/total
  mtdReturn?: { realized: Record<string, number>; margin: Record<string, number> };
  mtdDrawdown?: { realized: Record<string, number>; margin: Record<string, number> };

  // Raw series (date -> row)
  sql_historical_balances?: {
    realized?: DateToRow;
    margin?: DateToRow;
  };

  // Initial balances (account -> dollars)
  initial_balances?: Record<string, number> | undefined;

  // New dynamic strategy map from backend
  performanceByStrategy?: Record<string, StrategyPerf> | undefined;
};
