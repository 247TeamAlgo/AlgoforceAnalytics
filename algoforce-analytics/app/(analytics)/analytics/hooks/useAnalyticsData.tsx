"use client";

import { Account } from "@/lib/jsonStore";
import { MetricsPayload } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MultiMetricsResponse, isMultiSelectionResponse } from "../lib/types";
import { generateDummyMetrics } from "../data/dummy";

export interface DateRange {
  start?: string;
  end?: string;
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
  rawJson: MultiMetricsResponse | null;
  merged: MetricsPayload | null;
  perAccounts?: Record<string, MetricsPayload>;
  onAutoFetch: () => Promise<void>;
}

/* ----------------------------- typed fetchers ----------------------------- */
async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch("/api/accounts", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Account[];
  return Array.isArray(data) ? data.filter((a) => !!a?.redisName) : [];
}

/* ----------------------------- headless logic ----------------------------- */
export function useAnalyticsData(): AnalyticsData {
  const [range, setRange] = useState<DateRange>({});
  const [earliest, setEarliest] = useState<boolean>(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState<MultiMetricsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await fetchAccounts();
        if (!alive) return;
        setAccounts(all);

        const monitored = all
          .filter((a) => a.monitored)
          .map((a) => a.redisName);
        setSelected(monitored);

        // default: last 30d
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        setRange({
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
        });
        setEarliest(false);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load accounts");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onAutoFetch = useCallback(async (): Promise<void> => {
    if (!selected.length) return;

    const hasExplicitRange = Boolean(range.start && range.end);
    if (!hasExplicitRange && !(earliest && range.end)) return;

    setLoading(true);
    setError(null);
    try {
      const data = generateDummyMetrics(selected, range, earliest);
      setRawJson(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to build metrics");
    } finally {
      setLoading(false);
    }
  }, [selected, range, earliest]);

  const merged = useMemo<MetricsPayload | null>(() => {
    if (!rawJson) return null;
    return isMultiSelectionResponse(rawJson) ? rawJson.merged : rawJson;
  }, [rawJson]);

  // normalize perAccounts even when a single payload is returned
  const perAccounts = useMemo<
    Record<string, MetricsPayload> | undefined
  >(() => {
    if (!rawJson) return undefined;
    if (isMultiSelectionResponse(rawJson)) return rawJson.per_account;
    // single
    if (merged && selected.length === 1) {
      return { [selected[0] as string]: merged };
    }
    return undefined;
  }, [rawJson, merged, selected]);

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
