"use client";

import * as React from "react";
import {
  LiveStatus,
  PerformanceMetricsContextValue,
  PerformanceMetricsPayload,
} from "../types";
import { useAccountsPrefs } from "../AccountsContext";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ------------- utils ------------- */

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonRetry<T>(
  url: string,
  retries = 3,
  baseDelayMs = 250
): Promise<T> {
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

function statusFrom(asOf?: string, fetchedAt?: string): LiveStatus {
  if (!asOf || !fetchedAt) return "unknown";
  const a = Date.parse(asOf);
  const b = Date.parse(fetchedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "unknown";
  const diff = Math.max(0, b - a);
  if (diff <= 3000) return "green";
  if (diff <= 12000) return "yellow";
  return "red";
}

/* ------------- context ------------- */

const PerformanceMetricsContext = createContext<
  PerformanceMetricsContextValue | undefined
>(undefined);

const REFRESH_DELAY_MS = 4000;

export function PerformanceMetricsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { analyticsSelectedAccounts } = useAccountsPrefs();

  const [performanceMetrics, setPerformanceMetrics] =
    useState<PerformanceMetricsPayload | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState<boolean>(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceAsOf, setPerformanceAsOf] = useState<string | undefined>(
    undefined
  );
  const [performanceFetchedAt, setPerformanceFetchedAt] = useState<
    string | undefined
  >(undefined);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyRef = useRef<string>("");

  const accountsKey = useMemo(() => {
    const list = Array.from(new Set(analyticsSelectedAccounts.filter(Boolean)));
    list.sort();
    return list.join(",");
  }, [analyticsSelectedAccounts]);

  const refreshPerformance = useCallback(async () => {
    const list = accountsKey ? accountsKey.split(",").filter(Boolean) : [];
    if (list.length === 0) return;
    setPerformanceLoading(true);
    setPerformanceError(null);
    try {
      // IMPORTANT: send repeated `accounts` params for FastAPI list[str]
      const qs = new URLSearchParams();
      for (const a of list) qs.append("accounts", a);
      const url = `/api/v1/performance_metrics?${qs.toString()}`;

      const json = await fetchJsonRetry<PerformanceMetricsPayload>(url);
      setPerformanceMetrics(json);

      // uPnl.asOf is typed now
      const asOf = json?.uPnl?.asOf;
      setPerformanceAsOf(asOf);
      setPerformanceFetchedAt(new Date().toISOString());
    } catch (e) {
      setPerformanceError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setPerformanceLoading(false);
    }
  }, [accountsKey]);

  useEffect(() => {
    if (!accountsKey) {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (lastKeyRef.current === accountsKey && pollRef.current != null) return;
    lastKeyRef.current = accountsKey;

    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }

    let active = true;
    const loop = async () => {
      if (!active) return;
      await refreshPerformance();
      if (!active) return;
      pollRef.current = setTimeout(loop, REFRESH_DELAY_MS);
    };

    void loop();
    return () => {
      active = false;
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [accountsKey, refreshPerformance]);

  const performanceStatus = useMemo<LiveStatus>(
    () => statusFrom(performanceAsOf, performanceFetchedAt),
    [performanceAsOf, performanceFetchedAt]
  );

  const value = useMemo<PerformanceMetricsContextValue>(
    () => ({
      performanceMetrics,
      performanceLoading,
      performanceError,
      performanceAsOf,
      performanceFetchedAt,
      performanceStatus,
      refreshPerformance,
    }),
    [
      performanceMetrics,
      performanceLoading,
      performanceError,
      performanceAsOf,
      performanceFetchedAt,
      performanceStatus,
      refreshPerformance,
    ]
  );

  return (
    <PerformanceMetricsContext.Provider value={value}>
      {children}
    </PerformanceMetricsContext.Provider>
  );
}

export function usePerformanceMetrics(): PerformanceMetricsContextValue {
  const ctx = useContext(PerformanceMetricsContext);
  if (!ctx)
    throw new Error(
      "usePerformanceMetrics must be used within PerformanceMetricsProvider"
    );
  return ctx;
}
