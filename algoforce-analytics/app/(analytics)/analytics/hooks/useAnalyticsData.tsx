// app/(analytics)/analytics/hooks/useAnalyticsData.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUpnl } from "./useUpnl";
import { Account } from "@/lib/jsonStore";
import type { MetricsSlim, LiveUpnl } from "../lib/performance_metric_types";

/* ---------------- bulk payload types (match Python backend) ---------------- */
type BulkWindow = { startDay: string; endDay: string; mode: "MTD" | string };
type BalanceRow = Record<string, number>; // includes "total"
type BalanceMap = Record<string, BalanceRow>;
type Triple = Record<string, number> & { total: number };

export type BulkMetricsResponse = {
  window: BulkWindow;
  accounts: string[]; // backend-echo of filtered accounts
  returns: Record<string, Record<string, number>>; // day -> {accs..., total}
  balance: BalanceMap; // day -> {accs..., total}
  combinedLiveMonthlyReturn: Triple; // {accs..., total}
  combinedLiveMonthlyDrawdown: Triple; // {accs..., total}
  losingStreak?: {
    perAccount?: Record<string, { currentStreak?: number; maxStreak?: number }>;
    combined?: { currentStreak?: number; maxStreak?: number };
    daily?: { combined?: Record<string, number> };
  };
  symbolPnL?: {
    symbols?: Record<string, Record<string, number> & { TOTAL?: number }>; // sym -> {accs..., TOTAL}
    totalPerAccount?: Record<string, number>;
  };
  // NOTE: uPnl is intentionally NOT included in bulk anymore.
};

export interface AnalyticsData {
  accounts: Account[];
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;

  loading: boolean;
  error: string | null;

  bulk: BulkMetricsResponse | null; // raw BULK (MTD) for selected

  // Shims for existing cards:
  mergedForSymbols: MetricsSlim | null; // only uses pnl_per_symbol[]
  perAccountsForStreaks?: Record<string, MetricsSlim>; // uses streaks.{current,max}

  onAutoFetch: () => Promise<void>;

  // Live overlays (polled independently; filtered by selected)
  upnlMap: Record<string, number>;
  combinedUpnl?: number;
  upnlAsOf?: string;
  upnlLoading: boolean;
  upnlError: string | null;
  refetchUpnl: () => Promise<void>;
  upnlSymbolMap?: Record<string, number>;

  // Kept for compatibility (not used by CombinedMonthlyDrawdownCard)
  upnlDeltaMapForDrawdown: Record<string, number>;
  combinedUpnlDeltaForDrawdown?: number;
}

function isAccountLike(v: unknown): v is Account {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as { redisName?: unknown }).redisName === "string"
  );
}
function normalizeAccounts(v: unknown): Account[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isAccountLike);
}

async function fetchAccountsSafe(): Promise<Account[]> {
  try {
    const res = await fetch("/api/accounts", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return normalizeAccounts(data);
  } catch {
    return [];
  }
}

/** Fetch bulk MTD from Next proxy: /api/metrics/bulk?accounts=fund2,fund3 */
async function fetchBulk(accounts: string[]): Promise<BulkMetricsResponse> {
  const params = new URLSearchParams();
  if (accounts.length > 0) params.set("accounts", accounts.join(","));
  const url = `/api/metrics/bulk?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Bulk fetch ${res.status} ${res.statusText}`);
  return (await res.json()) as BulkMetricsResponse;
}

/* ---------------- helpers to adapt bulk → component props ---------------- */

type Bucket = { label: string; total: number };

/** Build symbols list using ONLY selected accounts, ignoring any TOTAL provided. */
function buildMergedForSymbols(
  b: BulkMetricsResponse | null,
  selected: readonly string[]
): MetricsSlim | null {
  if (!b?.symbolPnL?.symbols) return null;

  const sel = new Set(selected.length ? selected : b.accounts ?? []);
  const rows: Bucket[] = [];

  for (const [sym, rec] of Object.entries(b.symbolPnL.symbols)) {
    let sum = 0;
    for (const [k, v] of Object.entries(rec)) {
      if (k === "TOTAL") continue;
      if (sel.has(k)) {
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(n)) sum += n;
      }
    }
    rows.push({ label: sym, total: Number(sum.toFixed(2)) });
  }

  return {
    initial_balance: 0,
    window_start: b.window?.startDay ?? "",
    window_end: b.window?.endDay ?? "",
    total_return_pct_over_window: null,
    drawdown_mag: 0,
    streaks: { current: 0, max: 0 },
    daily: [],
    pnl_per_symbol: rows,
    pnl_per_pair: [],
  };
}

/** Build a per-account MetricsSlim map containing only streaks (selected only). */
function buildPerAccountsForStreaks(
  b: BulkMetricsResponse | null,
  selected: readonly string[]
): Record<string, MetricsSlim> | undefined {
  const src = b?.losingStreak?.perAccount;
  if (!src) return undefined;

  const sel = new Set(selected.length ? selected : b?.accounts ?? []);
  const out: Record<string, MetricsSlim> = {};

  for (const [acc, s] of Object.entries(src)) {
    if (!sel.has(acc)) continue;
    out[acc] = {
      initial_balance: 0,
      window_start: b?.window?.startDay ?? "",
      window_end: b?.window?.endDay ?? "",
      total_return_pct_over_window: null,
      drawdown_mag: 0,
      streaks: {
        current: Number(s?.currentStreak ?? 0),
        max: Number(s?.maxStreak ?? 0),
      },
      daily: [],
      pnl_per_symbol: [],
      pnl_per_pair: [],
    };
  }
  return out;
}

/* -------------------------------- main hook -------------------------------- */

export function useAnalyticsData(): AnalyticsData {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkMetricsResponse | null>(null);

  // bootstrap: accounts + default selection (from backend!)
  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await fetchAccountsSafe();
      if (!alive) return;
      setAccounts(all);

      const monitored = all
        .filter((a) => Boolean(a?.monitored))
        .map((a) => a.redisName);
      setSelected(
        monitored.length > 0 ? monitored : all.map((a) => a.redisName)
      );
    })().catch((e) => {
      if (!alive) return;
      setError(e instanceof Error ? e.message : "Failed to initialize");
    });
    return () => {
      alive = false;
    };
  }, []);

  const [selectionReady, setSelectionReady] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && selected.length > 0) {
      setSelectionReady(true);
    }
  }, [accounts.length, selected.length]);

  const onAutoFetch = useCallback(async (): Promise<void> => {
    if (!selectionReady || selected.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const data = await fetchBulk(selected);
      setBulk(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to build metrics";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectionReady, selected]);

  // initial + periodic refresh (30 mins)
  useEffect(() => {
    const run = (): void => {
      void onAutoFetch();
    };
    if (selected.length > 0) run();
    const id = window.setInterval(run, 30 * 60 * 1000);
    // const id = window.setInterval(run, 60 * 1000); // TEST
    return () => window.clearInterval(id);
  }, [onAutoFetch, selected.length]);

  // Live UPNL polling (independent, filtered by selected)
  const {
    data: upnlData,
    loading: upnlLoading,
    error: upnlError,
    refetch: refetchUpnl,
  } = useUpnl(selected, {
    pollMs: 10_000,
    jitterMs: 200,
    errorBackoffMs: 2_000,
  });

  const liveSource: LiveUpnl | undefined = upnlData;

  // absolute overlays
  const upnlMap = useMemo<Record<string, number>>(() => {
    const src = liveSource?.per_account_upnl ?? {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(src)) {
      const n = typeof v === "number" ? v : Number(v);
      out[k] = Number.isFinite(n) ? n : 0;
    }
    return out;
  }, [liveSource?.per_account_upnl]);

  const combinedUpnl = useMemo<number | undefined>(() => {
    const v = liveSource?.combined_upnl;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, [liveSource?.combined_upnl]);

  const upnlAsOf = liveSource?.as_of ?? undefined; // no bulk fallback by design

  const upnlSymbolMap = useMemo<Record<string, number> | undefined>(() => {
    if (!liveSource?.combined_symbol_upnl) return undefined;
    const out: Record<string, number> = {};
    for (const [sym, v] of Object.entries(liveSource.combined_symbol_upnl)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) out[sym] = n;
    }
    return out;
  }, [liveSource?.combined_symbol_upnl]);

  // Deltas for legacy drawdown usage (not needed by new card, but kept)
  const upnlDeltaMapForDrawdown = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(upnlMap)) out[k] = v ?? 0;
    return out;
  }, [upnlMap]);

  const combinedUpnlDeltaForDrawdown = useMemo<number | undefined>(() => {
    return typeof combinedUpnl === "number" ? combinedUpnl : 0;
  }, [combinedUpnl]);

  /* ---------------- shims from bulk (respect SELECTED accounts) ---------------- */
  const mergedForSymbols = useMemo<MetricsSlim | null>(
    () => buildMergedForSymbols(bulk, selected),
    [bulk, selected]
  );

  const perAccountsForStreaks = useMemo<
    Record<string, MetricsSlim> | undefined
  >(() => buildPerAccountsForStreaks(bulk, selected), [bulk, selected]);

  return {
    accounts,
    selected,
    setSelected,

    loading,
    error,

    bulk,
    mergedForSymbols,
    perAccountsForStreaks,

    onAutoFetch,

    // live
    upnlMap,
    combinedUpnl,
    upnlAsOf,
    upnlLoading,
    upnlError,
    refetchUpnl,
    upnlSymbolMap,

    // deltas (compat)
    upnlDeltaMapForDrawdown,
    combinedUpnlDeltaForDrawdown,
  };
}

export default useAnalyticsData;
