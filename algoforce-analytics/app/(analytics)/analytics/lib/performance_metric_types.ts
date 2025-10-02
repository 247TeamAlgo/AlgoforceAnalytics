// app/(analytics)/analytics/lib/types.ts

/* ============================================================================
 * Shared types for Analytics (client + server parity)
 * ----------------------------------------------------------------------------
 * This file defines a single source of truth for payload shapes used by:
 * - Heavy metrics endpoint (calendarized realized PnL + optional live snapshot)
 * - Light /upnl endpoint (live-only)
 * - UI helpers and common structs
 *
 * IMPORTANT PARITY NOTES:
 * - MetricsSlim.daily rows are calendarized and carry net_pnl (and gross/fees),
 *   matching the server payload.
 * - MetricsSlim includes window_start/window_end to align with server types.
 * - LiveUpnl.accounts is optional because some endpoints omit it.
 * ========================================================================== */

export type ISODate = string; // "YYYY-MM-DD"

/* ----------------------------- buckets/common ----------------------------- */

export type Bucket = {
  label: string;
  total: number;
};

/** Calendarized daily row (realized-only; net = gross - fees). */
export type DailyRow = {
  day: ISODate;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
};

/* ---------- Live UPNL block (heavy snapshot + /upnl parity) -------------- */
export interface LiveUpnl {
  as_of: string; // ISO instant
  /** Some endpoints include this; keep optional for compatibility. */
  accounts?: string[];
  combined_upnl: number;
  per_account_upnl: Record<string, number>;

  /** Optional symbol-level aggregations (upper-cased symbol keys). */
  combined_symbol_upnl?: Record<string, number>;
  per_account_symbol_upnl?: Record<string, Record<string, number>>;

  /** Optional: matches HeavyResponse.meta.snapshot_id when present. */
  base_snapshot_id?: string;
}

/* ---------------------------- accounts (slim) ---------------------------- */

export type Account = {
  redisName: string;
  display?: string;
  monitored?: boolean;
  /** Optional identifiers used server-side; harmless on client. */
  binanceName?: string;
  dbName?: string | null;
};

/* ----------------------------- streaks (UI) ------------------------------ */

export type Streaks = {
  current: number;
  max: number;
};

/* -------------------- Metrics payload per account/merged ------------------ */

export type MetricsSlim = {
  initial_balance: number;

  /** Server-computed window attributes (required for parity). */
  window_start: ISODate;
  window_end: ISODate;

  total_return_pct_over_window: number | null;

  /** Magnitude in [0..), e.g., 0.1088 for -10.88%. */
  drawdown_mag: number;

  streaks: Streaks;

  /** Calendarized daily net PnL rows (realized-only). */
  daily: DailyRow[];

  /** Aggregated realized PnL buckets. */
  pnl_per_symbol: Bucket[];
  pnl_per_pair: Bucket[];

  /** Optional extras when requested on heavy API. */
  upnl_per_symbol?: Bucket[];
  pnl_per_symbol_incl_upnl?: Bucket[];
  pnl_per_pair_incl_upnl?: Bucket[];
  pair_breakdown?: PairAggregate[];
};

/* ---------------- Heavy endpoint response (analytics) -------------------- */

export type HeavyWindow = {
  start: ISODate;
  end: ISODate;
};

export type HeavyMeta = {
  server_time_utc: string;
  tz_resolved: string;
  window: HeavyWindow; // effective window the backend used
  snapshot_id?: string; // payload identity for UPNL parity + caching
  window_requested?: {
    start?: ISODate;
    end?: ISODate;
    earliest?: boolean;
  };
  schema?: string; // optional payload schema version
};

/** Legacy name kept for compatibility with some imports. */
export type MultiMetricsResponseSlim = {
  selected: string[];
  window: { start: ISODate; end: ISODate; earliest: boolean };
  merged: MetricsSlim;
  per_account: Record<string, MetricsSlim>;
  ignored?: string[];
  meta: {
    server_time_utc: string;
    run_date_used: ISODate;
    day_start_hour: number;
  };
  /** Baseline live snapshot used to compute client-side live deltas. */
  live_upnl?: LiveUpnl;
};

/** Canonical heavy response type (preferred). */
export interface HeavyResponse {
  selected: string[];
  window: { start: ISODate; end: ISODate; earliest: boolean };
  merged: MetricsSlim;
  per_account: Record<string, MetricsSlim>;
  accounts: Account[];
  ignored?: string[];
  meta: {
    server_time_utc: string;
    run_date_used: ISODate;
    day_start_hour: number;
  };

  /** Pandas-parity table (left unknown; specialized UIs can type it). */
  pivot_per_symbol?: unknown;

  /** Present when includeUpnl=1: baseline snapshot for live overlays. */
  live_upnl?: LiveUpnl;
}

/* ---------------------- /api/v1/upnl (light/live) ------------------------ */

export type UpnlResponse = {
  as_of: string; // ISO instant
  /** Accounts used in this snapshot. */
  accounts: string[];
  combined_upnl: number;
  per_account_upnl: Record<string, number>;

  /** Symbol-level (optional). */
  combined_symbol_upnl?: Record<string, number>;
  per_account_symbol_upnl?: Record<string, Record<string, number>>;

  /** Optional: matches HeavyResponse.meta.snapshot_id. */
  base_snapshot_id?: string;
};

/* --------------------------------- UI ------------------------------------ */

export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}${v.toFixed(2)}%`;
}

export function displayName(a: Account): string {
  return a.display ?? a.redisName;
}

/* ------------------------ optional aggregates ---------------------------- */

export type PairAggregate = {
  pair: string;
  trades: number;
  total_pnl: number;
  mtd_pnl: number;
  mtd_pos_size: number;
  mtd_return_proxy: number | null;
  wins: number;
  losses: number;
  win_rate_pct: number | null;
};

export type SymbolAggregate = {
  symbol: string;
  fills: number;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
  mtd_net_pnl: number;
  mtd_notional: number;
  mtd_return_proxy: number | null;
  wins: number;
  losses: number;
  win_rate_pct: number | null;
};
