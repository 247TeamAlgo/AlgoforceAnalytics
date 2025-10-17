// app/types.ts
/* Shared types */

import { Dispatch, SetStateAction } from "react";

export type Dict<T> = Record<string, T>;

export type AccountMeta = {
  redisName: string;
  display?: string | null;
  monitored?: boolean;
};

export type AnalyticsRange = {
  start?: string;
  end?: string;
};

/* ---------- Performance metrics payload (matches new backend) ---------- */

export type MetaWindow = {
  mode: "MTD";
  startDay: string;
  endDay: string;
};

export type MetaFlags = {
  missingInitialBalanceAccounts?: string[];
  zeroInitialBalanceAccounts?: string[];
};

export type MetaBlock = {
  asOf: string;
  window: MetaWindow;
  flags?: MetaFlags;
};

export type EquityRow = Dict<number>; // { fund2: 123, fund3: 456, total: 579 }
export type EquitySeries = Dict<EquityRow>; // { "YYYY-MM-DD": EquityRow }

export type EquityBlock = {
  realized: { series: EquitySeries };
  margin: {
    series: EquitySeries;
    /** last timestamp only with UPnL injected */
    live: EquitySeries;
  };
};

export type ReturnBlock = {
  /** fractional returns, e.g. 0.0123 for +1.23% */
  percent: Dict<number>; // per account + total
  /** absolute dollar P/L since month-open */
  dollars: Dict<number>; // per account + total
};

export type ReturnsBlock = {
  realized: ReturnBlock;
  margin: ReturnBlock;
};

export type DrawdownSide = {
  /** current drawdown vs MTD peak (fractional) per account + total */
  current: Dict<number>;
  /** max drawdown over MTD (fractional) per account + total */
  max: Dict<number>;
};

export type DrawdownBlock = {
  realized: DrawdownSide;
  margin: DrawdownSide;
};

export type LosingStreak = {
  consecutive: number;
  /** { "YYYY-MM-DD": dailyPnL } for the tail of the streak */
  days: Dict<number>;
};

export type LosingDaysBlock = {
  perAccount: Dict<LosingStreak>;
  combined: LosingStreak; // computed from summed daily PnL across accounts
};

export type SymbolRow = Dict<number> & { TOTAL: number }; // { fund2, fund3, TOTAL }
export type SymbolTable = Dict<SymbolRow>;

export type SymbolPnlBlock = {
  symbols: SymbolTable;
  totalPerAccount: Dict<number>;
};

export type UPnLBlock = {
  asOf: string;
  perAccount: Dict<number>;
  combined: number;
};

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

export type PerformanceMetricsPayload = {
  meta: MetaBlock;
  accounts: string[];

  /** SQL month-open anchors (per account + total) */
  initialBalances: Dict<number>;

  /** per-account unrealized shift from baseline file (used for margin view) */
  unrealizedJson: Dict<number>;

  /** convenience: initialBalances + unrealizedJson (per account + total) */
  initialBalancesWithUnrealized: Dict<number>;

  /** equity time series */
  equity: EquityBlock;

  /** MTD returns (fraction + dollars) */
  returns: ReturnsBlock;

  /** MTD drawdowns */
  drawdown: DrawdownBlock;

  /** losing streaks (exclude today) */
  losingDays: LosingDaysBlock;

  /** MTD realized PnL by symbol */
  symbolPnlMTD: SymbolPnlBlock;

  /** live unrealized snapshot */
  uPnl: UPnLBlock;

  combined_coint_strategy: CombinedCointStrategy;
};

/* ---------- Live status & contexts ---------- */

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
  /** server timestamp from API (derived from payload) */
  performanceAsOf?: string;
  /** client timestamp of last successful fetch */
  performanceFetchedAt?: string;
  /** derived from asOf vs fetchedAt */
  performanceStatus: LiveStatus;
  refreshPerformance: () => Promise<void>;
};
