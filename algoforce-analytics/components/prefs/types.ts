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

export type PerformanceMetricsPayload = {
  meta: { asOfStartAnchor: string; initialBalancesDate: string };
  window: { startDay: string; endDay: string; mode: "MTD" };
  accounts: string[];
  initialBalances: Dict<number>;
  balances: {
    realized: Dict<Dict<number>>;
    margin: Dict<Dict<number>>;
  };
  mtdDrawdown: { realized: Dict<number>; margin: Dict<number> };
  mtdReturn:   { realized: Dict<number>; margin: Dict<number> };
  losingDays: Dict<{ consecutive?: number; days?: Dict<number> }>;
  symbolRealizedPnl: { symbols: Dict<Dict<number>>; totalPerAccount: Dict<number> };
  uPnl: { as_of: string; combined: number; perAccount: Dict<number> };
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
