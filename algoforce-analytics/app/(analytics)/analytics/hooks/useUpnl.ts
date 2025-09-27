"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UpnlSnapshot = {
  as_of: string; // ISO instant UTC
  combined_upnl: number;
  per_account_upnl: Record<string, number>;
  base_snapshot_id?: string;
  accounts?: string[];
};

export interface UseUpnlOptions {
  pollMs?: number; // base poll interval (default 60s)
  baseSnapshotId?: string; // optional echo for server parity
  jitterMs?: number; // add 0..jitter Ms to each tick (default 120ms)
  errorBackoffMs?: number; // temporary delay after a failed attempt (default 2s)
}

export function useUpnl(
  selected: string[],
  {
    pollMs = 60_000,
    baseSnapshotId,
    jitterMs = 120,
    errorBackoffMs = 2_000,
  }: UseUpnlOptions = {}
): {
  data: UpnlSnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<UpnlSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const backoffUntilRef = useRef<number>(0); // epoch ms

  const buildUrl = useCallback((): string => {
    const qs = new URLSearchParams();
    if (selected.length > 0) qs.set("accounts", selected.join(","));
    if (baseSnapshotId) qs.set("base_snapshot_id", baseSnapshotId);
    const q = qs.toString();
    return q ? `/api/v1/upnl?${q}` : "/api/v1/upnl";
  }, [selected, baseSnapshotId]);

  const schedule = useCallback(
    (delayMs: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void fetchOnce();
      }, delayMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const fetchOnce = useCallback(async (): Promise<void> => {
    const url = buildUrl();

    // Skip work when hidden/offline, but keep polling later
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      schedule(pollMs);
      return;
    }
    if (
      typeof navigator !== "undefined" &&
      "onLine" in navigator &&
      !navigator.onLine
    ) {
      schedule(pollMs);
      return;
    }

    const now = Date.now();
    if (backoffUntilRef.current > now) {
      schedule(Math.max(0, backoffUntilRef.current - now));
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error(`UPNL ${res.status} ${res.statusText}`);
      const json = (await res.json()) as UpnlSnapshot;
      setData(json);
      backoffUntilRef.current = 0;
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
      schedule(pollMs + jitter);
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "UPNL fetch failed";
      setError(msg);
      backoffUntilRef.current = Date.now() + errorBackoffMs;
      schedule(errorBackoffMs);
    } finally {
      setLoading(false);
    }
  }, [buildUrl, pollMs, jitterMs, errorBackoffMs, schedule]);

  const refetch = useCallback(async () => {
    await fetchOnce();
  }, [fetchOnce]);

  useEffect(() => {
    void fetchOnce();

    const onVis = (): void => {
      if (document.visibilityState === "visible") void fetchOnce();
    };
    const onOnline = (): void => {
      void fetchOnce();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, [fetchOnce]);

  return { data, loading, error, refetch };
}
