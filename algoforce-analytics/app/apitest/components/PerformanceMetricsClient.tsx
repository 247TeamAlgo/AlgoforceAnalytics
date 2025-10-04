"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAccountsPrefs } from "@/components/prefs/PrefsContext";
import LiveUpnlStrip from "./performance-metrics/LiveUpnlStrip";
import CombinedPerformanceMTDCard from "./performance-metrics/combined-performance-metrics/CombinedPerformanceMTDCard";
import ConsecutiveLosingDaysThresholdsCard from "./performance-metrics/ConsecutiveLosingDaysCard";

/* -------- local helper types -------- */
type Dict<T = unknown> = Record<string, T>;

export type PerformanceMetricsPayload = {
  meta: { asOfStartAnchor: string; initialBalancesDate: string };
  window: { startDay: string; endDay: string; mode: "MTD" };
  accounts: string[];
  initialBalances: Dict<number>;
  balances: {
    realized: Dict<Dict<number>>;
    margin: Dict<Dict<number>>;
  };
  mtdDrawdown: { realized: Dict<number>; margin: Dict<number> };
  mtdReturn: { realized: Dict<number>; margin: Dict<number> };
  losingDays: Dict<{ consecutive?: number; days?: Dict<number> }>;
  symbolRealizedPnl: {
    symbols: Dict<Dict<number>>;
    totalPerAccount: Dict<number>;
  };
  uPnl: { as_of: string; combined: number; perAccount: Dict<number> };
};

type Props = {
  accounts: string[];
  payload: PerformanceMetricsPayload | null;
  loading: boolean;
  error: string | null;
  asOf?: string;
  fetchedAt?: string;
};

type MetricsSlimCompat = { streaks?: { current?: number; max?: number } };
type AccountWithStrategy = {
  redisName: string;
  display?: string | null;
  monitored?: boolean;
  strategy?: string | null;
};

export default function PerformanceMetricClient({
  accounts,
  payload,
  loading,
  error,
  asOf,
  fetchedAt,
}: Props) {
  const { analyticsAccounts } = useAccountsPrefs();

  const accountsLabel = useMemo(
    () => (accounts?.length ? accounts : ["fund2", "fund3"]).join(", "),
    [accounts]
  );

  // uPnL filter for strip
  const { perFiltered, combinedFiltered } = useMemo(() => {
    const src = (payload?.uPnl?.perAccount ?? {}) as Record<string, unknown>;
    const filtered: Record<string, number> = {};
    for (const a of accounts ?? []) {
      const raw = src[a];
      const num =
        typeof raw === "number"
          ? Number.isFinite(raw)
            ? raw
            : 0
          : raw != null
            ? Number(raw) || 0
            : 0;
      filtered[a] = num;
    }
    const total = Object.values(filtered).reduce(
      (s, v) => s + (Number.isFinite(v) ? v : 0),
      0
    );
    return { perFiltered: filtered, combinedFiltered: total };
  }, [payload, accounts]);

  // Adapter for combined card
  const combinedBulk = useMemo(() => {
    if (!payload) return null;
    const balance = (payload.balances?.realized ?? {}) as Record<
      string,
      Record<string, number>
    >;
    return {
      window: payload.window,
      accounts: payload.accounts,
      balance,
      balancePreUpnl: balance,
      combinedLiveMonthlyReturn: {
        total: Number(payload.mtdReturn?.realized?.total ?? 0),
      },
      combinedLiveMonthlyDrawdown: {
        total: Number(payload.mtdDrawdown?.realized?.total ?? 0),
      },
      combinedLiveMonthlyReturnWithUpnl: {
        total: Number(payload.mtdReturn?.margin?.total ?? 0),
      },
      combinedLiveMonthlyDrawdownWithUpnl: {
        total: Number(payload.mtdDrawdown?.margin?.total ?? 0),
      },
    };
  }, [payload]);

  // Build per-account streaks for thresholds
  const losingPerAccounts = useMemo(() => {
    const out: Record<string, MetricsSlimCompat> = {};
    if (!payload) return out;
    const src = payload.losingDays as Record<string, { consecutive?: unknown }>;
    for (const acc of accounts ?? []) {
      const cur = Number(src?.[acc]?.consecutive ?? 0) || 0;
      out[acc] = { streaks: { current: cur, max: cur } };
    }
    return out;
  }, [payload, accounts]);

  const pretty = useMemo(() => {
    if (!payload) return '{\n  "status": "waiting for data..."\n}';
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }, [payload]);

  /* ---------------- 2× drawdown height → right panel ---------------- */
  const leftRef = useRef<HTMLDivElement | null>(null);
  const [rightHeight, setRightHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = leftRef.current;
    if (!el) return;

    function measure() {
      // Try to find the "Drawdown (MTD)" section box
      let ddHeight = 0;
      // Look for an element whose text includes 'Drawdown (MTD)' and take its closest section box.
      const headings = Array.from(el!.querySelectorAll("div,span,h1,h2,h3,h4"));
      for (const h of headings) {
        if (
          typeof h.textContent === "string" &&
          h.textContent.includes("Drawdown (MTD)")
        ) {
          // The chart wrapper is likely a few ancestors up; fallback to parent chain
          const section = h.closest("div");
          if (section) {
            // Find the next container with rounded/border (heuristic)
            let box: HTMLElement | null = section as HTMLElement;
            for (let i = 0; i < 4 && box; i += 1) {
              if (
                box.className &&
                typeof box.className === "string" &&
                box.className.includes("rounded-xl")
              ) {
                const r = box.getBoundingClientRect();
                if (r.height > 40) ddHeight = r.height;
                break;
              }
              box = box.parentElement;
            }
          }
          break;
        }
      }
      // Fallback: estimate from overall left card content area
      if (!ddHeight) {
        const r = el!.getBoundingClientRect();
        ddHeight = Math.max(160, Math.round(r.height / 4));
      }
      setRightHeight(Math.round(ddHeight * 2));
    }

    // Initial + resize observe
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [combinedBulk]);

  return (
    <div className="space-y-4">
      {/* UPNL strip */}
      <LiveUpnlStrip
        combined={combinedFiltered}
        perAccount={perFiltered}
        maxAccounts={12}
      />

      {/* Combined (85%) + Thresholds (15%) below the strip */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
        <div ref={leftRef} className="w-full xl:w-[85%]">
          {combinedBulk ? (
            <CombinedPerformanceMTDCard
              bulk={combinedBulk as unknown as Record<string, unknown>}
              selected={accounts}
              combinedUpnl={Number(payload?.uPnl?.combined ?? 0)}
            />
          ) : null}
        </div>

        <div className="w-full xl:w-[15%]">
          <ConsecutiveLosingDaysThresholdsCard
            perAccounts={losingPerAccounts}
            accounts={analyticsAccounts as unknown as AccountWithStrategy[]}
            fixedHeight={rightHeight}
          />
        </div>
      </div>

      {/* Status + raw JSON */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Performance Metrics (JSON)</h1>
          <p className="text-sm text-muted-foreground">
            Accounts: <span className="font-medium">{accountsLabel}</span>
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>
            <span className="font-medium">API as_of:</span> {asOf ?? "—"}
          </div>
          <div>
            <span className="font-medium">Fetched at:</span> {fetchedAt ?? "—"}
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <pre className="rounded-lg border bg-muted/30 p-3 text-sm font-mono overflow-auto">
        {pretty}
      </pre>

      {loading ? (
        <div className="text-xs text-muted-foreground">fetching…</div>
      ) : null}
    </div>
  );
}
