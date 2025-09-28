"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ----------------------------- response types ----------------------------- */
export interface UpnlResponse {
  as_of: string; // ISO instant
  accounts: string[];
  combined_upnl: number;
  per_account_upnl: Record<string, number>;
  combined_symbol_upnl?: Record<string, number>;
  per_account_symbol_upnl?: Record<string, Record<string, number>>;
  base_snapshot_id?: string;
}

export interface UseUpnlOptions {
  pollMs?: number; // default 10_000
  jitterMs?: number; // default 200
  errorBackoffMs?: number; // default 2_000
}

/* ------------------------------ main hook --------------------------------- */
export function useUpnl(
  selectedAccounts: readonly string[],
  opts?: UseUpnlOptions
): {
  data?: UpnlResponse;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const pollMs = Math.max(1000, opts?.pollMs ?? 10_000);
  const jitterMs = Math.max(0, opts?.jitterMs ?? 200);
  const errorBackoffMs = Math.max(250, opts?.errorBackoffMs ?? 2_000);

  const [data, setData] = useState<UpnlResponse | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  const accountsParam = useMemo<string>(
    () => selectedAccounts.join(","),
    [selectedAccounts]
  );

  const doFetch = useCallback(async (): Promise<void> => {
    if (!accountsParam) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    setLoading(true);
    setError(null);
    try {
      const url = `/api/v1/upnl?accounts=${encodeURIComponent(accountsParam)}`;
      const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
      if (!res.ok) throw new Error(`UPNL HTTP ${res.status} ${res.statusText}`);
      const payload = (await res.json()) as UpnlResponse;
      setData(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "UPNL fetch failed");
    } finally {
      setLoading(false);
    }
  }, [accountsParam]);

  const refetch = useCallback(async (): Promise<void> => {
    await doFetch();
  }, [doFetch]);

  useEffect(() => {
    let alive = true;

    const schedule = (delay: number): void => {
      if (!alive) return;
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
      const id = window.setTimeout(() => {
        void doFetch().catch(() => {
          if (alive) schedule(errorBackoffMs);
        });
      }, delay + jitter);
      timerRef.current = id;
    };

    schedule(50);

    const intervalId = window.setInterval(() => {
      void doFetch().catch(() => {});
    }, pollMs);

    return () => {
      alive = false;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      window.clearInterval(intervalId);
      abortRef.current?.abort();
    };
  }, [doFetch, errorBackoffMs, jitterMs, pollMs]);

  return { data, loading, error, refetch };
}
