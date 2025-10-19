// "@/components/prefs/types.ts"

export type Numeric = number;

/**
 * A row keyed by account names and "total", each a dollar value.
 * Example: { fund2: 125.42, fund3: -12.03, total: 113.39 }
 */
export type RegularReturnsRow = Record<string, Numeric>;

/**
 * Regular Returns payload:
 * Keyed by session date label ("YYYY-MM-DD"), value is a RegularReturnsRow.
 * Matches the backend "regular_returns" object in performance_metrics.py.
 *
 * Example:
 * {
 *   "2025-10-18": { fund2: 12.3, fund3: -1.1, total: 11.2 },
 *   "2025-10-19": { fund2: 2.0,  fund3:  3.0, total:  5.0 }
 * }
 */
export type RegularReturnsPayload = Record<string, RegularReturnsRow>;

/* ---------------------------------------------------------------------- */
/* Existing types (abridged placeholders shown here for context)          */
/* Keep your current definitions; only ensure PerformanceMetricsPayload    */
/* is extended with the new field below.                                   */
/* ---------------------------------------------------------------------- */

export type EquitySeries = Record<string, Record<string, number>>;

export interface PerformanceMetricsWindow {
  mode: "MTD" | "WTD" | "Custom";
  startDay: string; // "YYYY-MM-DD"
  endDay: string; // "YYYY-MM-DD"
}

export interface PerformanceMetricsMeta {
  asOf: string;
  window: PerformanceMetricsWindow;
  flags?: {
    missingInitialBalanceAccounts?: string[];
    zeroInitialBalanceAccounts?: string[];
  };
}

export interface PerformanceMetricsPayload {
  meta: PerformanceMetricsMeta;
  accounts: string[];

  initialBalances?: Record<string, number>;
  unrealizedJson?: Record<string, number>;
  initialBalancesWithUnrealized?: Record<string, number>;

  equity?: {
    realized?: { series?: EquitySeries; live?: Record<string, number> };
    margin?: { series?: EquitySeries; live?: Record<string, number> };
  };

  returns?: {
    realized?: {
      percent?: Record<string, number>;
      percentPure?: Record<string, number>;
      dollars?: Record<string, number>;
    };
    margin?: {
      percent?: Record<string, number>;
      dollars?: Record<string, number>;
    };
  };

  drawdown?: {
    realized?: {
      current?: Record<string, number>;
      max?: Record<string, number>;
    };
    margin?: { current?: Record<string, number>; max?: Record<string, number> };
  };

  losingDays?: unknown;
  symbolPnlMTD?: {
    symbols?: Record<string, Record<string, number>>;
    totalPerAccount?: Record<string, number>;
  };
  uPnl?: {
    combined?: number;
    perAccount?: Record<string, number>;
  };
  combined_coint_strategy?: unknown;

  /**
   * NEW: regular session-based returns (08:00 → 07:59), per-day map.
   * Keys: "YYYY-MM-DD" (session label dates).
   * Values: per-account dollars plus "total".
   */
  regular_returns?: RegularReturnsPayload;
}
