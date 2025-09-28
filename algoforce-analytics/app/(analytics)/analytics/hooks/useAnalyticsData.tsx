// app/(analytics)/analytics/hooks/useAnalyticsData.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUpnl } from "./useUpnl";
import { Account } from "@/lib/jsonStore";
import {
  HeavyResponse,
  MetricsSlim,
  LiveUpnl,
} from "../lib/performance_metric_types";

export interface DateRange {
  start?: string; // "YYYY-MM-DD"
  end?: string; // "YYYY-MM-DD"
}

export interface AnalyticsData {
  accounts: Account[];
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  range: DateRange;
  setRange: React.Dispatch<React.SetStateAction<DateRange>>;
  earliest: boolean;
  setEarliest: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;
  error: string | null;
  rawJson: HeavyResponse | null;
  merged: MetricsSlim | null;
  perAccounts?: Record<string, MetricsSlim>;
  onAutoFetch: () => Promise<void>;

  // Legacy absolute live overlays (used by strips/tables etc.)
  upnlMap: Record<string, number>;
  combinedUpnl?: number;
  upnlAsOf?: string;
  upnlLoading: boolean;
  upnlError: string | null;
  refetchUpnl: () => Promise<void>;
  upnlSymbolMap?: Record<string, number>;
  upnlSymbolPerAccount?: Record<string, Record<string, number>>;

  // Delta (computed against heavy baseline) — used by drawdown card ONLY.
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
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function toISODateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

async function fetchHeavy(
  accounts: string[],
  range: { start?: string; end?: string },
  earliest: boolean
): Promise<HeavyResponse> {
  const params = new URLSearchParams();
  if (accounts.length > 0) params.set("accounts", accounts.join(","));

  const hasExplicitRange = Boolean(range.start && range.end);
  if (hasExplicitRange) {
    params.set("startDate", range.start as string);
    params.set("endDate", range.end as string);
  } else if (earliest && range.end) {
    params.set("earliest", "true");
    params.set("endDate", range.end);
  }
  // Align with backend boundary (your code uses 8)
  params.set("dayStartHour", "8");

  // Ask server to include baseline live snapshot (for delta computation)
  params.set("includeUpnl", "1");

  const url = `/api/v1/1-performance_metrics?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Heavy fetch ${res.status} ${res.statusText}`);
  return (await res.json()) as HeavyResponse;
}

export function useAnalyticsData(): AnalyticsData {
  const [range, setRange] = useState<DateRange>({});
  const [earliest, setEarliest] = useState<boolean>(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState<HeavyResponse | null>(null);

  // bootstrap
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

      const end = new Date();
      const start = new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate() - 30
      );
      setRange({ start: toISODateLocal(start), end: toISODateLocal(end) });
      setEarliest(false);
    })().catch((e) => {
      if (!alive) return;
      setError(e instanceof Error ? e.message : "Failed to initialize");
    });
    return () => {
      alive = false;
    };
  }, []);

  // ensure non-empty selection
  useEffect(() => {
    if (selected.length === 0 && accounts.length > 0) {
      const monitored = accounts
        .filter((a) => Boolean(a?.monitored))
        .map((a) => a.redisName);
      setSelected(
        monitored.length > 0 ? monitored : accounts.map((a) => a.redisName)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  const onAutoFetch = useCallback(async (): Promise<void> => {
    if (selected.length === 0) return;
    const hasExplicitRange = Boolean(range.start && range.end);
    if (!hasExplicitRange && !(earliest && range.end)) return;

    setLoading(true);
    setError(null);
    try {
      const data = await fetchHeavy(selected, range, earliest);
      setRawJson(data);

      if (Array.isArray(data.accounts) && data.accounts.length > 0) {
        setAccounts(normalizeAccounts(data.accounts));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to build metrics";
      setError(msg);
      setRawJson(null);
    } finally {
      setLoading(false);
    }
  }, [selected, range, earliest]);

  useEffect(() => {
    const run = (): void => {
      void onAutoFetch();
    };
    run();
    const id = window.setInterval(run, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [onAutoFetch]);

  // Legacy live UPNL polling: prefer polled, fallback to heavy snapshot
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

  const liveSource: LiveUpnl | undefined = upnlData ?? rawJson?.live_upnl;
  const baseline: LiveUpnl | undefined = rawJson?.live_upnl; // for drawdown delta

  /* -------- absolute overlays (legacy) -------- */
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

  const upnlAsOf = liveSource?.as_of ?? undefined;

  const upnlSymbolMap = useMemo<Record<string, number> | undefined>(() => {
    if (!liveSource?.combined_symbol_upnl) return undefined;
    const out: Record<string, number> = {};
    for (const [sym, v] of Object.entries(liveSource.combined_symbol_upnl)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) out[sym] = n;
    }
    return out;
  }, [liveSource?.combined_symbol_upnl]);

  const upnlSymbolPerAccount = useMemo<
    Record<string, Record<string, number>> | undefined
  >(() => {
    if (!liveSource?.per_account_symbol_upnl) return undefined;
    const norm: Record<string, Record<string, number>> = {};
    for (const [acc, m] of Object.entries(liveSource.per_account_symbol_upnl)) {
      const row: Record<string, number> = {};
      for (const [sym, v] of Object.entries(m)) {
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(n)) row[sym] = n;
      }
      norm[acc] = row;
    }
    return norm;
  }, [liveSource?.per_account_symbol_upnl]);

  /* -------- delta overlays for drawdown only (avoid double-count) -------- */
  const upnlDeltaMapForDrawdown = useMemo<Record<string, number>>(() => {
    if (!baseline || !liveSource) return {}; // inject zero if no baseline or no live
    const delta: Record<string, number> = {};
    const nowMap = liveSource.per_account_upnl ?? {};
    const baseMap = baseline.per_account_upnl ?? {};
    const keys = new Set<string>([
      ...Object.keys(nowMap),
      ...Object.keys(baseMap),
    ]);
    for (const k of keys) {
      const now = Number((nowMap as Record<string, unknown>)[k] ?? 0);
      const base = Number((baseMap as Record<string, unknown>)[k] ?? 0);
      const d = now - base;
      delta[k] = Number.isFinite(d) ? d : 0;
    }
    return delta;
  }, [baseline, liveSource]);

  const combinedUpnlDeltaForDrawdown = useMemo<number | undefined>(() => {
    if (!baseline || !liveSource) return 0;
    const now = Number(liveSource.combined_upnl ?? 0);
    const base = Number(baseline.combined_upnl ?? 0);
    const d = now - base;
    return Number.isFinite(d) ? d : 0;
  }, [baseline, liveSource]);

  /* ---------------- reduce heavy payloads ---------------- */
  const merged = useMemo<MetricsSlim | null>(
    () => (rawJson ? rawJson.merged : null),
    [rawJson]
  );
  const perAccounts = useMemo<Record<string, MetricsSlim> | undefined>(
    () => (rawJson ? rawJson.per_account : undefined),
    [rawJson]
  );

  return {
    accounts,
    selected,
    setSelected,
    range,
    setRange,
    earliest,
    setEarliest,
    loading,
    error,
    rawJson,
    merged,
    perAccounts,
    onAutoFetch,

    // legacy absolute overlays
    upnlMap,
    combinedUpnl,
    upnlAsOf,
    upnlLoading,
    upnlError,
    refetchUpnl,
    upnlSymbolMap,
    upnlSymbolPerAccount,

    // drawdown-safe deltas
    upnlDeltaMapForDrawdown,
    combinedUpnlDeltaForDrawdown,
  };
}

export default useAnalyticsData;
