// app/(analytics)/analytics/components/PerformanceMetricsClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import LiveUpnlStrip from "./performance-metrics/LiveUpnlStrip";
import type { Bucket } from "./performance-metrics/symbol-pnl/types";
import ConsecutiveLosingDaysCard, {
  SlimAccountMetrics,
  AccountMini,
} from "./performance-metrics/losing-days/ConsecutiveLosingDaysCard";
import CombinedPerformanceMTDCard from "./performance-metrics/combined-performance-metrics/CombinedPerformanceMTDCard";
import NetPnlList from "./performance-metrics/symbol-pnl/NetPnlList";
import type { BulkMetricsResponse } from "./performance-metrics/combined-performance-metrics/types";

export type PerformanceMetricsPayload = {
  /** 👇 add this */
  accounts?: string[];

  window?: { startDay?: string; endDay?: string; mode?: string };
  balances?: { realized?: Record<string, Record<string, number>> };
  balance?: Record<string, Record<string, number>>;
  balancePreUpnl?: Record<string, Record<string, number>>;
  mtdReturn?: {
    realized?: Record<string, number>;
    margin?: Record<string, number>;
  };
  mtdDrawdown?: {
    realized?: Record<string, number>;
    margin?: Record<string, number>;
  };
  combinedLiveMonthlyReturn?: { total?: number };
  combinedLiveMonthlyDrawdown?: { total?: number };
  combinedLiveMonthlyReturnWithUpnl?: { total?: number };
  combinedLiveMonthlyDrawdownWithUpnl?: { total?: number };
  symbolRealizedPnl?: { symbols?: Record<string, Record<string, number>> };
  uPnl?: {
    as_of?: string;
    combined?: number;
    perAccount?: Record<string, number>;
  };
  losingDays?: Record<string, { consecutive?: number; max?: number }>;
};

type Props = {
  accounts: string[];
  payload: PerformanceMetricsPayload | null;
  loading: boolean;
  error: string | null;
  asOf?: string;
  fetchedAt?: string;
};

const InitialLoadSkeleton = () => {
  const Card = ({ h = 160 }: { h?: number }) => (
    <div className="rounded-lg border bg-card" style={{ height: `${h}px` }} />
  );

  const Dev = () => (
    <div className="rounded-lg border bg-card">
      <div className="h-9 px-3 sm:px-4 flex items-center justify-between" />
      <div className="h-px w-full bg-border" />
      <div className="p-3 sm:p-4">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="mt-2 h-4 w-64 rounded bg-muted" />
        <div className="mt-3 h-48 rounded border bg-background" />
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-pulse" aria-busy="true">
      <div className="h-10 rounded-lg border bg-card" />

      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 10%)",
          alignItems: "start",
        }}
      >
        <div className="space-y-4">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card />
            <Card />
          </div>
          <Dev />
        </div>

        <div className="row-span-2">
          <div className="rounded-lg border bg-card" style={{ height: 420 }} />
        </div>
      </div>
    </div>
  );
};

export default function PerformanceMetricClient({
  accounts,
  payload,
  loading,
  error,
  asOf,
  fetchedAt,
}: Props) {
  // ----- One-time loading gate (only on first fetch) -----
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(
    Boolean(payload) || Boolean(error)
  );

  useEffect(() => {
    if (payload || error) setHasLoadedOnce(true);
  }, [payload, error]);

  const initialLoading = loading && !hasLoadedOnce;

  // ----- UPNL (filtered to selected accounts) -----
  const { perFiltered, combinedFiltered } = useMemo(() => {
    const src = payload?.uPnl?.perAccount ?? {};
    const filtered: Record<string, number> = {};
    for (const a of accounts ?? []) {
      const v = src[a as keyof typeof src];
      if (typeof v === "number" && Number.isFinite(v)) filtered[a] = v;
      else if (v != null) filtered[a] = Number(v) || 0;
    }
    const total = Object.values(filtered).reduce(
      (s, v) => s + (Number.isFinite(v) ? v : 0),
      0
    );
    return {
      perFiltered: filtered,
      combinedFiltered: Number.isFinite(total) ? total : 0,
    };
  }, [payload, accounts]);

  // ----- Symbol PnL rows -----
  const symbolRows: Bucket[] = useMemo(() => {
    const symMap = payload?.symbolRealizedPnl?.symbols ?? {};
    const out: Bucket[] = [];
    for (const [sym, vals] of Object.entries(symMap)) {
      const total = Number((vals as Record<string, unknown>)?.TOTAL ?? 0);
      if (Number.isFinite(total)) out.push({ label: sym, total });
    }
    out.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    return out;
  }, [payload]);

  // ----- Losing days → Slim shape -----
  const perAccounts: Record<string, SlimAccountMetrics> = useMemo(() => {
    const src = payload?.losingDays ?? {};
    const out: Record<string, SlimAccountMetrics> = {};
    for (const a of accounts) {
      const row = src[a as keyof typeof src] as
        | { consecutive?: number; max?: number }
        | undefined;
      const current = Number(row?.consecutive ?? 0);
      const max = Number(row?.max ?? 0);
      out[a] = { streaks: { current, max } };
    }
    return out;
  }, [payload, accounts]);

  const accountList: AccountMini[] = useMemo(
    () => accounts.map((r) => ({ redisName: r, strategy: null })),
    [accounts]
  );

  const accountsLabel = useMemo(
    () => (accounts?.length ? accounts : ["fund2", "fund3"]).join(", "),
    [accounts]
  );

  const pretty = useMemo(() => {
    if (!payload) return '{\n  "status": "waiting for data..."\n}';
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }, [payload]);

  // ----- Combined bulk -----
  const combinedBulk: BulkMetricsResponse = useMemo(() => {
    const realized =
      payload?.balances?.realized ?? payload?.balance ?? undefined;

    const realizedRetTotal =
      payload?.combinedLiveMonthlyReturn?.total ??
      payload?.mtdReturn?.realized?.total;
    const realizedDdTotal =
      payload?.combinedLiveMonthlyDrawdown?.total ??
      payload?.mtdDrawdown?.realized?.total;
    const marginRetTotal =
      payload?.combinedLiveMonthlyReturnWithUpnl?.total ??
      payload?.mtdReturn?.margin?.total;
    const marginDdTotal =
      payload?.combinedLiveMonthlyDrawdownWithUpnl?.total ??
      payload?.mtdDrawdown?.margin?.total;

    return {
      window: payload?.window,
      // pass account list so charts can order composition by “selected” or fallback present keys
      accounts: payload?.accounts ?? accounts,

      // balances used for header badges
      balance: realized,
      balancePreUpnl: payload?.balancePreUpnl,

      // totals (for the large numbers on the right)
      combinedLiveMonthlyReturn:
        realizedRetTotal == null ? undefined : { total: Number(realizedRetTotal) },
      combinedLiveMonthlyDrawdown:
        realizedDdTotal == null ? undefined : { total: Number(realizedDdTotal) },
      combinedLiveMonthlyReturnWithUpnl:
        marginRetTotal == null ? undefined : { total: Number(marginRetTotal) },
      combinedLiveMonthlyDrawdownWithUpnl:
        marginDdTotal == null ? undefined : { total: Number(marginDdTotal) },

      // >>> THIS WAS MISSING — per-account maps the tooltips need <<<
      mtdReturn: {
        realized: payload?.mtdReturn?.realized ?? {},
        margin:   payload?.mtdReturn?.margin   ?? {},
      },
      mtdDrawdown: {
        realized: payload?.mtdDrawdown?.realized ?? {},
        margin:   payload?.mtdDrawdown?.margin   ?? {},
      },
    };
  }, [payload, accounts]);

  // ----- Developer’s Tool Collapse -----
  const [devOpen, setDevOpen] = useState<boolean>(false);

  // ----- Render: show loader ONLY on initial fetch -----
  if (initialLoading) return <InitialLoadSkeleton />;

  return (
    <div className="space-y-4">
      <LiveUpnlStrip
        combined={combinedFiltered}
        perAccount={perFiltered}
        maxAccounts={12}
      />

      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 10%)",
          alignItems: "start",
        }}
      >
        <div className="space-y-4">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <CombinedPerformanceMTDCard
              bulk={combinedBulk}
              selected={accounts}
              combinedUpnl={payload?.uPnl?.combined ?? 0}
            />
            <NetPnlList
              rows={symbolRows}
              selectedAccounts={accounts}
              symbolBreakdownMap={payload?.symbolRealizedPnl?.symbols}
            />
          </div>

          {/* Developer’s Tool (collapsible) */}
          <div className="rounded-lg border bg-card text-card-foreground">
            <button
              type="button"
              onClick={() => setDevOpen((v) => !v)}
              aria-expanded={devOpen}
              className="w-full flex items-center justify-between px-3 py-2 sm:px-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Developer’s Tool</span>
                <span className="text-xs text-muted-foreground">
                  {devOpen ? "Hide" : "Show"}
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  devOpen ? "rotate-0" : "-rotate-90"
                }`}
              />
            </button>

            <div className="h-px w-full bg-border" />

            <div
              className={`transition-[max-height,opacity] duration-200 ease-out overflow-hidden ${
                devOpen ? "opacity-100 max-h-[600px]" : "opacity-0 max-h-0"
              }`}
            >
              <div className="p-3 sm:p-4 text-sm font-mono bg-muted/30">
                <div className="mb-2 text-xs text-muted-foreground">
                  Accounts: <span className="font-medium">{accountsLabel}</span>
                </div>
                <div className="mb-2 text-xs text-muted-foreground">
                  API as_of: <span className="font-medium">{asOf ?? "—"}</span>{" "}
                  • Fetched:{" "}
                  <span className="font-medium">{fetchedAt ?? "—"}</span>
                </div>

                {error ? (
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                {/* Scrollable JSON container */}
                <div className="mt-2 max-h-[400px] overflow-y-auto rounded border bg-background px-3 py-2">
                  <pre className="text-xs whitespace-pre-wrap break-all">
                    {pretty}
                  </pre>
                </div>

                {/* Intentionally no loading indicator here; we only show it on first render */}
              </div>
            </div>
          </div>
        </div>

        <div className="row-span-2">
          <ConsecutiveLosingDaysCard
            perAccounts={perAccounts}
            accounts={accountList}
            variant="list"
          />
        </div>
      </div>
    </div>
  );
}
