"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Account,
  HeavyResponse,
  MetricsSlim,
} from "@/app/(analytics)/analytics/lib/types";

/* ----------------------------- local types ----------------------------- */

export interface DateRange {
  start?: string; // "YYYY-MM-DD" (UTC)
  end?: string; // "YYYY-MM-DD" (UTC)
}

export interface AnalyticsData {
  accounts: Account[]; // always an array
  selected: string[]; // redisName[]
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
}

/* ----------------------------- safe helpers ---------------------------- */

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

/** Robust fetch that never throws; always returns an array. */
async function fetchAccountsSafe(): Promise<Account[]> {
  try {
    const res = await fetch("/api/accounts", { cache: "no-store" });
    if (!res.ok) {
      console.error("[accounts] HTTP", res.status);
      return [];
    }
    const data = (await res.json()) as unknown;
    return normalizeAccounts(data);
  } catch (e) {
    console.error("[accounts] fetch failed:", e);
    return [];
  }
}

/** Heavy endpoint fetch. Throws on non-2xx. */
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

  params.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  const url = `/api/v1/1-performance_metrics?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Heavy fetch ${res.status} ${res.statusText}`);
  return (await res.json()) as HeavyResponse;
}

/* ----------------------------- main hook ------------------------------- */

export function useAnalyticsData(): AnalyticsData {
  const [range, setRange] = useState<DateRange>({});
  const [earliest, setEarliest] = useState<boolean>(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState<HeavyResponse | null>(null);

  // bootstrap accounts + defaults (last 30d UTC)
  useEffect(() => {
    let alive = true;

    (async () => {
      const all = await fetchAccountsSafe();
      if (!alive) return;

      setAccounts(all);

      // Default selection = monitored accounts (if any)
      const monitored = all
        .filter((a) => Boolean(a?.monitored))
        .map((a) => a.redisName);
      setSelected(monitored);

      // Default range = last 30 days (UTC)
      const end = new Date();
      const start = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 30)
      );
      const toISO = (d: Date) => d.toISOString().slice(0, 10);
      setRange({ start: toISO(start), end: toISO(end) });
      setEarliest(false);
    })().catch((e) => {
      if (!alive) return;
      console.error("[bootstrap] failed:", e);
      setError(e instanceof Error ? e.message : "Failed to initialize");
    });

    return () => {
      alive = false;
    };
  }, []);

  const onAutoFetch = useCallback(async (): Promise<void> => {
    if (selected.length === 0) return;

    const hasExplicitRange = Boolean(range.start && range.end);
    if (!hasExplicitRange && !(earliest && range.end)) return;

    setLoading(true);
    setError(null);
    try {
      const data = await fetchHeavy(selected, range, earliest);
      setRawJson(data);

      // If backend supplies accounts, prefer that (keeps UI in sync)
      if (Array.isArray(data.accounts) && data.accounts.length > 0) {
        setAccounts(normalizeAccounts(data.accounts));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to build metrics";
      console.error("[heavy] error:", msg);
      setError(msg);
      setRawJson(null);
    } finally {
      setLoading(false);
    }
  }, [selected, range, earliest]);

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
  };
}

export default useAnalyticsData;
