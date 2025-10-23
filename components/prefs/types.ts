import { Dispatch, SetStateAction } from "react";

/* ---------------- Accounts ---------------- */

export type AccountMeta = {
  redisName: string;
  display?: string | null;
  monitored?: boolean;
};

export type AnalyticsRange = {
  start?: string;
  end?: string;
};

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

/* ---------------- Metrics payloads ---------------- */

export type Numeric = number;

/** A row keyed by account names and "total", each a dollar value. */
export type RegularReturnsRow = Record<string, Numeric>;

/** Regular Returns payload keyed by session date ("YYYY-MM-DD"). */
export type RegularReturnsPayload = Record<string, RegularReturnsRow>;

export type EquitySeries = Record<string, Record<string, number>>;

export interface PerformanceMetricsWindow {
  mode: "MTD" | "WTD" | "Custom";
  startDay: string; // "YYYY-MM-DD"
  endDay: string;   // "YYYY-MM-DD"
}

export interface PerformanceMetricsMeta {
  asOf: string;
  window: PerformanceMetricsWindow;
  flags?: {
    missingInitialBalanceAccounts?: string[];
    zeroInitialBalanceAccounts?: string[];
  };
}

export interface AllTimeDDWindow {
  startDay: string; // "YYYY-MM-DD"
  endDay: string;   // "YYYY-MM-DD"
}

export interface AllTimeDD {
  window: AllTimeDDWindow;
  realized: {
    current: Record<string, number>; // { fund2: -0.0312, ..., total: -0.045 }
    max: Record<string, number>;     // same shape
  };
}

/** Per-strategy performance entry (backend: performanceByStrategy[strategy]) */
export type StrategyPerfEntry = {
  accounts: string[];
  drawdown: { realized: number; margin: number };
  return: { realized: number; margin: number };
};

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

  /** Live UPNL block */
  uPnl?: {
    combined?: number;
    perAccount?: Record<string, number>;
    /** Backend timestamp for uPnl payload; used for liveliness status */
    asOf?: string;
  };

  /** Dynamic JSON-driven strategy map (replaces any combined_coint_strategy usage). */
  performanceByStrategy?: Record<string, StrategyPerfEntry>;

  regular_returns?: RegularReturnsPayload;
  all_time_max_current_dd?: AllTimeDD;
}

/* ---------------- Performance Metrics Context typing ---------------- */

/** Liveness indicator for polling freshness */
export type LiveStatus = "unknown" | "green" | "yellow" | "red";

/** Back-compat alias if older code imported PerformanceStatus */
export type PerformanceStatus = LiveStatus;

export type PerformanceMetricsContextValue = {
  performanceMetrics: PerformanceMetricsPayload | null;
  performanceLoading: boolean;
  performanceError: string | null;
  performanceAsOf?: string;
  performanceFetchedAt?: string;
  performanceStatus: LiveStatus;
  /** Manual refetch trigger exposed by the provider */
  refreshPerformance: () => Promise<void>;
};
