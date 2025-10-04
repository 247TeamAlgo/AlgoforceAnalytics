/* minimal bulk metrics shape we need here */
export type SeriesRow = Record<string, number>; // per-day row: { fund2: 123, fund3: 456, total?: 579 }

export type BulkMetricsResponse = {
  window?: { startDay?: string; endDay?: string; mode?: string };
  accounts?: string[];

  /* balances (day-end) */
  balances?: {
    realized?: Record<string, SeriesRow>; // { "YYYY-MM-DD 00:00:00": { fund2: n, fund3: n, total: n } }
    margin?: Record<string, SeriesRow>;
  };

  /* some deployments alias balances.realized as "balance" and/or expose pre-upnl as "balancePreUpnl" */
  balance?: Record<string, SeriesRow>;
  balancePreUpnl?: Record<string, SeriesRow>;

  /* combined metrics; fallback to mtd ones if present */
  combinedLiveMonthlyReturn?: Record<string, number>; // { total: number, fund2?:..., ... }
  combinedLiveMonthlyDrawdown?: Record<string, number>;
  combinedLiveMonthlyReturnWithUpnl?: Record<string, number>;
  combinedLiveMonthlyDrawdownWithUpnl?: Record<string, number>;

  mtdReturn?: {
    realized?: Record<string, number>;
    margin?: Record<string, number>;
  };
  mtdDrawdown?: {
    realized?: Record<string, number>;
    margin?: Record<string, number>;
  };

  uPnl?: { combined?: number; perAccount?: Record<string, number> };
};
