// app/(analytics)/analytics/lib/types.ts

export type ISODate = string; // "YYYY-MM-DD"

// ---- Accounts (slim) ----
export type Account = {
  redisName: string;
  display?: string;
  monitored?: boolean;
};

// ---- Daily rows (calendarized, slim) ----
export type DailyRow = {
  day: ISODate;
  net_pnl: number;
  start_balance: number;
  end_balance: number;
};

// ---- Aggregated PnL buckets used by symbol/pair charts ----
export type PnlBucket = {
  label: string;
  total: number;
};

// ---- Streaks (what the UI actually uses) ----
export type Streaks = {
  current: number;
  max: number;
};

// ---- Metrics payload per account and merged (slim) ----
export type MetricsSlim = {
  initial_balance: number;
  total_return_pct_over_window: number | null;
  daily: DailyRow[]; // calendarized; net only
  drawdown_mag: number; // magnitude: 0.1088 for -10.88%
  pnl_per_symbol: PnlBucket[];
  pnl_per_pair: PnlBucket[];
  streaks: Streaks;
};

// ---- Heavy endpoint response ----
export type HeavyWindow = {
  start: ISODate;
  end: ISODate;
};

export type HeavyMeta = {
  server_time_utc: string;
  tz_resolved: string;
  window: HeavyWindow; // effective window the backend used
  snapshot_id?: string; // optional: payload identity for UPNL parity + caching
  window_requested?: {
    start?: ISODate;
    end?: ISODate;
    earliest?: boolean;
  };
  schema?: string; // optional payload schema version
};

export type HeavyResponse = {
  meta: HeavyMeta;
  accounts: Account[]; // supplies Controls; eliminates separate /api/accounts
  merged: MetricsSlim; // combined/portfolio view
  per_account: Record<string, MetricsSlim>;
};

// ---- UPNL endpoint response (light/live) ----
export type UpnlResponse = {
  as_of: string; // ISO instant
  combined_upnl: number;
  per_account_upnl: Record<string, number>;
  base_snapshot_id?: string; // optional: matches HeavyResponse.meta.snapshot_id
};

// ---- UI helpers ----
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
