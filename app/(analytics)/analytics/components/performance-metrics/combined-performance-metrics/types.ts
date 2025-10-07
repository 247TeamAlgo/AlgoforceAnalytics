export type DateRow = Record<string, number>;           // e.g. { fund2: 123, fund3: 456, total: 579 }
export type DateToRow = Record<string, DateRow>;        // e.g. { "2025-10-07 00:00:00": DateRow }

export type BulkMetricsResponse = {
  window?: { startDay?: string; endDay?: string; mode?: string };
  accounts?: string[];

  // Charts expect account -> day -> value (realized equity series)
  balance?: Record<string, Record<string, number>>;
  balancePreUpnl?: Record<string, Record<string, number>>;

  combinedLiveMonthlyReturn?: { total?: number };
  combinedLiveMonthlyDrawdown?: { total?: number };
  combinedLiveMonthlyReturnWithUpnl?: { total?: number };
  combinedLiveMonthlyDrawdownWithUpnl?: { total?: number };

  mtdReturn?: {
    realized?: Record<string, number>;  // keys: accounts + "total"
    margin?: Record<string, number>;
  };
  mtdDrawdown?: {
    realized?: Record<string, number>;
    margin?: Record<string, number>;
  };

  // NEW: mirror API naming for header inputs
  sql_historical_balances?: { realized?: DateToRow; margin?: DateToRow };
  initial_balances?: Record<string, number>;
};
