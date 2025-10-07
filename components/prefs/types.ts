/* Shared types */

import { Dispatch, SetStateAction } from "react";

export type Dict<T = unknown> = Record<string, T>;

export type AccountMeta = {
  redisName: string;
  display?: string | null;
  monitored?: boolean;
};

export type AnalyticsRange = {
  start?: string;
  end?: string;
};

/** Mirrors the new API payload (snake_case) */
export type PerformanceMetricsPayload = {
  meta?: { asOfStartAnchor?: string; initialBalancesDate?: string };
  window?: { startDay?: string; endDay?: string; mode?: "MTD" };
  accounts?: string[];

  /** Point-in-time per-account balances (start-of-window reference) */
  initial_balances?: Dict<number>;

  /** Daily equity series keyed by timestamp strings */
  sql_historical_balances?: {
    realized?: Dict<Dict<number>>; // { "YYYY-MM-DD HH:mm:ss": { fund2, fund3, total } }
    margin?: Dict<Dict<number>>;
  };

  /** Optional JSON conveniences coming from the API (not required by UI) */
  json_balances?: Dict<number>;
  json_unrealized_balances?: Dict<number>;
  json_initial_balances?: Dict<number>;

  /** Monthly stats for charts/tooltips */
  mtdDrawdown?: { realized?: Dict<number>; margin?: Dict<number> };
  mtdReturn?: { realized?: Dict<number>; margin?: Dict<number> };

  /** Symbol breakdowns */
  symbolRealizedPnl?: { symbols?: Dict<Dict<number>>; totalPerAccount?: Dict<number> };

  /** Live uPnL snapshot */
  uPnl?: { as_of?: string; combined?: number; perAccount?: Dict<number> };

  /** Losing days block */
  losingDays?: Dict<{ consecutive?: number; days?: Dict<number> }>;

  /** Optional legacy compatibility (not required going forward) */
  balance?: Dict<Dict<number>>;
  balances?: { realized?: Dict<Dict<number>>; margin?: Dict<Dict<number>> };

  /** Optional combined totals (server-side precomputed) */
  combinedLiveMonthlyReturn?: { total?: number };
  combinedLiveMonthlyDrawdown?: { total?: number };
  combinedLiveMonthlyReturnWithUpnl?: { total?: number };
  combinedLiveMonthlyDrawdownWithUpnl?: { total?: number };
};

export type LiveStatus = "green" | "yellow" | "red" | "unknown";

/* Accounts slice */
export type AccountsContextValue = {
  navbarVisible: boolean;

  analyticsAccounts: AccountMeta[];
  analyticsSelectedAccounts: string[];
  setAnalyticsSelectedAccounts: Dispatch<SetStateAction<string[]>>;
  analyticsLoading: boolean;
  reloadAccounts: () => Promise<void>;

  analyticsRange: AnalyticsRange;
  setAnalyticsRange: Dispatch<SetStateAction<AnalyticsRange>>;
  analyticsEarliest: boolean;
  setAnalyticsEarliest: Dispatch<SetStateAction<boolean>>;
};

/* Performance metrics slice */
export type PerformanceMetricsContextValue = {
  performanceMetrics: PerformanceMetricsPayload | null;
  performanceLoading: boolean;
  performanceError: string | null;
  performanceAsOf?: string;       // server timestamp from API
  performanceFetchedAt?: string;  // client timestamp of last successful fetch
  performanceStatus: LiveStatus;  // derived from asOf vs fetchedAt
  refreshPerformance: () => Promise<void>;
};
