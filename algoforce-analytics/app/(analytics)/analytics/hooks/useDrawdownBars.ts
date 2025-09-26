"use client";

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "./useAnalyticsData";

export type DDBarsRow = {
  account: string;
  dd_mag: number; // decimal magnitude, e.g. 0.1088 for -10.88%
  max_drawdown_pct: number | null; // negative percent
  peak_day: string | null;
  trough_day: string | null;
};

export type DDBarsPayload = {
  window_start: string;
  window_end: string;
  per_account: DDBarsRow[];
  combined: DDBarsRow;
};

export function useDrawdownBars(
  accounts: string[],
  range: DateRange,
  earliest: boolean,
  tz: string = "Asia/Manila"
) {
  const [data, setData] = useState<DDBarsPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => {
    if (!accounts.length) return null;
    const qs = new URLSearchParams();
    qs.set("tz", tz);
    qs.set("accounts", accounts.join(","));
    if (range.start) qs.set("startDate", range.start);
    if (range.end) qs.set("endDate", range.end);
    if (earliest && !range.start) qs.set("earliest", "true");
    return `/api/metrics_v1/1-performance_metrics/metrics/drawdown?${qs.toString()}`;
  }, [accounts, tz, range.start, range.end, earliest]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!url) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DDBarsPayload;
        if (alive) setData(json);
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  return { data, loading, error };
}
