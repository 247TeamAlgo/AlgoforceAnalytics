// app/analytics/(components)/PerformanceDistributionBlock/hooks/usePerformanceDistribution.ts
"use client";

import * as React from "react";
import type { DashboardData, Freq } from "../types";

type AnalyticsResponse = DashboardData | { error?: string };

export function usePerformanceDistribution({
  accounts,
  freq = "M",
  sims = 10_000,
  apiPath = "/api/sqlytics",
}: {
  accounts: string[];
  freq?: Freq;
  sims?: number;
  apiPath?: string;
}) {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [lastGood, setLastGood] = React.useState<DashboardData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  // one string dep for cheap deep-equality on accounts
  const accountsKey = React.useMemo(() => accounts.slice().sort().join(","), [accounts]);

  // request id to ignore late responses
  const reqIdRef = React.useRef(0);

  React.useEffect(() => {
    const myId = ++reqIdRef.current;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        if (!accounts.length) throw new Error("Select at least one account.");

        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ accounts, freq, sims }),
        });

        const text = await res.text();
        const json: AnalyticsResponse = text ? JSON.parse(text) : {};

        if (!res.ok || ("error" in json && json.error)) {
          const msg =
            ("error" in json && json.error) || `HTTP ${res.status} – ${text.slice(0, 200)}`;
          throw new Error(msg);
        }

        if (reqIdRef.current !== myId) return; // stale
        const payload = json as DashboardData;
        setData(payload);
        setLastGood(payload); // remember good state
      } catch (e) {
        if (reqIdRef.current !== myId) return; // stale
        setError(e instanceof Error ? e.message : "Failed");
        // Keep showing last good data if we have it
        if (lastGood) setData(lastGood);
      } finally {
        if (reqIdRef.current === myId) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsKey, freq, sims, apiPath]); // (accountsKey captures accounts)

  return { data, error, loading };
}
