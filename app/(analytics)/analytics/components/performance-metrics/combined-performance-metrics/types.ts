// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/types.ts
export type DateRow = Record<string, number>;
export type DateToRow = Record<string, DateRow>;

export type CombinedCointStrategy = {
  drawdown: {
    realized: Record<string, number>; // keys: "janus_coint", "charm_coint", ...
    margin: Record<string, number>;
  };
  return: {
    realized: Record<string, number>;
    margin: Record<string, number>;
  };
};

export type BulkMetricsResponse = {
  window?: { startDay?: string; endDay?: string; mode?: string };
  accounts?: string[];

  balance?: Record<string, Record<string, number>>;
  balancePreUpnl?: Record<string, Record<string, number>>;

  combinedLiveMonthlyReturn?: { total?: number };
  combinedLiveMonthlyDrawdown?: { total?: number };
  combinedLiveMonthlyReturnWithUpnl?: { total?: number };
  combinedLiveMonthlyDrawdownWithUpnl?: { total?: number };

  mtdReturn?: {
    realized?: Record<string, number>;
    margin?: Record<string, number>;
  };
  mtdDrawdown?: {
    realized?: Record<string, number>;
    margin?: Record<string, number>;
  };

  sql_historical_balances?: { realized?: DateToRow; margin?: DateToRow };
  initial_balances?: Record<string, number>;

  combinedCointStrategy?: CombinedCointStrategy;
};
