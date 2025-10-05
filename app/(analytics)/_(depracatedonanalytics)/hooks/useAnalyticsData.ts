"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "@/lib/jsonStore";
import type { MetricsSlim } from "../lib/performance_metric_types";

/* ---------------- bulk payload types ---------------- */
type BulkWindow = { startDay: string; endDay: string; mode: "MTD" | string };
type BalanceRow = Record<string, number>;
type BalanceMap = Record<string, BalanceRow>;
type Triple = Record<string, number> & { total: number };

export type BulkMetricsResponse = {
  window: BulkWindow;
  accounts: string[];
  returns: Record<string, Record<string, number>>;
  balance: BalanceMap;

  // extra fields used by the UI
  balancePreUpnl?: BalanceMap;
  returnsWithUpnl?: Record<string, Record<string, number>>;
  combinedLiveMonthlyReturn?: Triple;
  combinedLiveMonthlyDrawdown?: Triple;
  combinedLiveMonthlyReturnWithUpnl?: Triple;
  combinedLiveMonthlyDrawdownWithUpnl?: Triple;
  mtd?: {
    preUpnl?: { pnl: Record<string, number>; return: Triple };
    withUpnl?: { pnl: Record<string, number>; return: Triple };
  };

  losingStreak?: {
    perAccount?: Record<string, { currentStreak?: number; maxStreak?: number }>;
    combined?: { currentStreak?: number; maxStreak?: number };
    daily?: { combined?: Record<string, number> };
  };
  symbolPnL?: {
    symbols?: Record<string, Record<string, number> & { TOTAL?: number }>;
    totalPerAccount?: Record<string, number>;
  };

  uPnl?: {
    as_of?: string;
    combined?: number;           // preferred
    total?: number;              // legacy
    perAccount?: Record<string, number>;
    perSymbol?: Record<string, number>;
  };

  hasUpdated?: boolean;
  version?: string;
};

export interface AnalyticsData {
  accounts: Account[];
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;

  loading: boolean;
  error: string | null;

  bulk: BulkMetricsResponse | null;

  mergedForSymbols: MetricsSlim | null;
  perAccountsForStreaks?: Record<string, MetricsSlim>;

  onAutoFetch: () => Promise<void>;

  upnlMap: Record<string, number>;
  combinedUpnl?: number;
  upnlAsOf?: string;
  upnlSymbolMap?: Record<string, number>;
}

/* ---------------- small utils ---------------- */
async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
async function fetchJsonRetry<T>(url: string, retries = 3, baseDelayMs = 250): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    } catch (e) {
      last = e;
      if (i < retries) await sleep(baseDelayMs * 2 ** i);
    }
  }
  throw last instanceof Error ? last : new Error("Request failed");
}

function isAccountLike(v: unknown): v is Account {
  return !!v && typeof v === "object" && typeof (v as { redisName?: unknown }).redisName === "string";
}
function normalizeAccounts(v: unknown): Account[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isAccountLike);
}

async function fetchAccountsSafe(): Promise<Account[]> {
  try {
    const data = await fetchJsonRetry<unknown>("/api/accounts");
    return normalizeAccounts(data);
  } catch {
    return [];
  }
}

async function fetchBulk(accounts: string[]): Promise<BulkMetricsResponse> {
  const list = Array.from(new Set(accounts.filter(Boolean)));
  const params = new URLSearchParams();
  if (list.length > 0) params.set("accounts", list.join(","));
  const url = `/api/metrics/bulk?${params.toString()}`;
  return await fetchJsonRetry<BulkMetricsResponse>(url, 3, 250);
}

type Bucket = { label: string; total: number };

function buildMergedForSymbols(
  b: BulkMetricsResponse | null,
  selected: readonly string[]
): MetricsSlim | null {
  const symbols = b?.symbolPnL?.symbols;
  if (!symbols) return null;

  const sel = new Set(selected.length ? selected : b?.accounts ?? []);
  const rows: Bucket[] = [];

  for (const [sym, rec] of Object.entries(symbols)) {
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
    window_start: b?.window?.startDay ?? "",
    window_end: b?.window?.endDay ?? "",
    total_return_pct_over_window: null,
    drawdown_mag: 0,
    streaks: { current: 0, max: 0 },
    daily: [],
    pnl_per_symbol: rows,
    pnl_per_pair: [],
  };
}

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

  // Bootstrap: accounts + default selection
  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await fetchAccountsSafe();
      if (!alive) return;
      setAccounts(all);

      // Default: fund2 & fund3 if both exist; else monitored; else all
      const ids = all.map((a) => a.redisName);
      const prefer = ["fund2", "fund3"].filter((id) => ids.includes(id));
      let def: string[] = [];
      if (prefer.length === 2) def = prefer;
      else {
        const monitored = all.filter((a) => Boolean(a?.monitored)).map((a) => a.redisName);
        def = monitored.length ? monitored : ids;
      }
      setSelected(def);
    })().catch((e) => {
      if (!alive) return;
      setError(e instanceof Error ? e.message : "Failed to initialize");
    });
    return () => { alive = false; };
  }, []);

  // Derived live overlays from bulk.uPnl
  const upnlMap = useMemo<Record<string, number>>(() => {
    const src = bulk?.uPnl?.perAccount ?? {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(src)) {
      const n = typeof v === "number" ? v : Number(v);
      out[k] = Number.isFinite(n) ? n : 0;
    }
    return out;
  }, [bulk?.uPnl?.perAccount]);

  const combinedUpnl = useMemo<number | undefined>(() => {
    const v = bulk?.uPnl?.combined ?? bulk?.uPnl?.total ?? undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, [bulk?.uPnl?.combined, bulk?.uPnl?.total]);

  const upnlAsOf = bulk?.uPnl?.as_of ?? undefined;

  const upnlSymbolMap = useMemo<Record<string, number> | undefined>(() => {
    const src = bulk?.uPnl?.perSymbol;
    if (!src) return undefined;
    const out: Record<string, number> = {};
    for (const [sym, v] of Object.entries(src)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) out[sym] = n;
    }
    return out;
  }, [bulk?.uPnl?.perSymbol]);

  // First-render sequence flag: show loading spinner only once
  const didFirstSequenceRef = useRef(false);

  const runBulkFetch = useCallback(
    async (sel: string[], showSpinner: boolean) => {
      if (sel.length === 0) return;
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const data = await fetchBulk(sel);       // fetch #1
        setBulk(data);
        if (data.hasUpdated) {
          const again = await fetchBulk(sel);    // fetch #2
          setBulk(again);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to build metrics");
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    []
  );

  // Auto fetch: first time (with spinner+possible second fetch), later silent
  const onAutoFetch = useCallback(async (): Promise<void> => {
    if (selected.length === 0) return;
    const first = !didFirstSequenceRef.current;
    await runBulkFetch(selected, first);
    if (first) didFirstSequenceRef.current = true;
  }, [runBulkFetch, selected]);

  // Initial & periodic silent refresh for BULK only (30 mins)
  useEffect(() => {
    const go = () => { void onAutoFetch(); };
    if (selected.length > 0) go();
    const id = window.setInterval(go, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [onAutoFetch, selected.length]);

  const mergedForSymbols = useMemo<MetricsSlim | null>(
    () => buildMergedForSymbols(bulk, selected),
    [bulk, selected]
  );
  const perAccountsForStreaks = useMemo<Record<string, MetricsSlim> | undefined>(
    () => buildPerAccountsForStreaks(bulk, selected),
    [bulk, selected]
  );

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

    upnlMap,
    combinedUpnl,
    upnlAsOf,
    upnlSymbolMap,
  };
}

export default useAnalyticsData;
