"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import CombinedPerformanceMTDCard from "./performance-metrics/combined-performance-metrics/CombinedPerformanceMTDCard";
import type { BulkMetricsResponse, DateToRow } from "./performance-metrics/combined-performance-metrics/types";
import LiveUpnlStrip from "./performance-metrics/LiveUpnlStrip";
import NetPnlList from "./performance-metrics/symbol-pnl/NetPnlList";
import type { Bucket } from "./performance-metrics/symbol-pnl/types";

import LosingDaysCard from "./performance-metrics/losing-days/ConsecutiveLosingDaysCard";
import type { AccountMini } from "./performance-metrics/losing-days/types";
import type { PerformanceMetricsPayload } from "@/components/prefs/types";

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
        style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 10%)", alignItems: "start" }}
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

// Pivot (date -> row) => (account -> day)
function reshapeRealizedToAccountSeries(
  byDate: DateToRow | undefined,
  accounts: string[]
): Record<string, Record<string, number>> | undefined {
  if (!byDate) return undefined;
  const out: Record<string, Record<string, number>> = {};
  for (const acc of accounts) out[acc] = {};
  for (const [rawKey, row] of Object.entries(byDate)) {
    const day = rawKey.includes(" ") ? rawKey.split(" ")[0] : rawKey; // "YYYY-MM-DD"
    for (const acc of accounts) {
      const v = row[acc];
      if (typeof v === "number" && Number.isFinite(v)) out[acc][day] = v;
    }
  }
  return out;
}

export default function PerformanceMetricClient({
  accounts,
  payload,
  loading,
  error,
  asOf,
  fetchedAt,
}: Props) {
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(Boolean(payload) || Boolean(error));
  useEffect(() => {
    if (payload || error) setHasLoadedOnce(true);
  }, [payload, error]);
  const initialLoading = loading && !hasLoadedOnce;

  // UPNL (filtered)
  const { perFiltered, combinedFiltered } = useMemo(() => {
    const src = payload?.uPnl?.perAccount ?? {};
    const filtered: Record<string, number> = {};
    for (const a of accounts ?? []) {
      const v = src[a as keyof typeof src];
      if (typeof v === "number" && Number.isFinite(v)) filtered[a] = v;
      else if (v != null) filtered[a] = Number(v) || 0;
    }
    const total = Object.values(filtered).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    return { perFiltered: filtered, combinedFiltered: Number.isFinite(total) ? total : 0 };
  }, [payload, accounts]);

  // Symbol PnL rows
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

  // Build realized series for charts from SQL realized
  const realizedSeriesFromSql = useMemo(
    () => reshapeRealizedToAccountSeries(payload?.sql_historical_balances?.realized as DateToRow | undefined, accounts),
    [payload?.sql_historical_balances?.realized, accounts]
  );

  // Compose the bulk payload for the card
  const combinedBulk: BulkMetricsResponse = useMemo(() => {
    const realized: Record<string, Record<string, number>> | undefined =
      realizedSeriesFromSql ??
      (payload?.balances as unknown as { realized?: Record<string, Record<string, number>> })?.realized ??
      payload?.balance ??
      undefined;

    const realizedRetTotal =
      payload?.combinedLiveMonthlyReturn?.total ?? payload?.mtdReturn?.realized?.total;
    const realizedDdTotal =
      payload?.combinedLiveMonthlyDrawdown?.total ?? payload?.mtdDrawdown?.realized?.total;
    const marginRetTotal =
      payload?.combinedLiveMonthlyReturnWithUpnl?.total ?? payload?.mtdReturn?.margin?.total;
    const marginDdTotal =
      payload?.combinedLiveMonthlyDrawdownWithUpnl?.total ?? payload?.mtdDrawdown?.margin?.total;

    return {
      window: payload?.window,
      accounts: payload?.accounts ?? accounts,

      balance: realized,
      balancePreUpnl: undefined, // deprecated for this card path

      combinedLiveMonthlyReturn: realizedRetTotal == null ? undefined : { total: Number(realizedRetTotal) },
      combinedLiveMonthlyDrawdown: realizedDdTotal == null ? undefined : { total: Number(realizedDdTotal) },
      combinedLiveMonthlyReturnWithUpnl: marginRetTotal == null ? undefined : { total: Number(marginRetTotal) },
      combinedLiveMonthlyDrawdownWithUpnl: marginDdTotal == null ? undefined : { total: Number(marginDdTotal) },

      mtdReturn: {
        realized: payload?.mtdReturn?.realized ?? {},
        margin: payload?.mtdReturn?.margin ?? {},
      },
      mtdDrawdown: {
        realized: payload?.mtdDrawdown?.realized ?? {},
        margin: payload?.mtdDrawdown?.margin ?? {},
      },

      // Pass raw SQL sources for the header (snake_case preserved)
      sql_historical_balances: {
        realized: payload?.sql_historical_balances?.realized as DateToRow | undefined,
        margin: payload?.sql_historical_balances?.margin as DateToRow | undefined,
      },
      initial_balances: payload?.initial_balances,
    };
  }, [
    realizedSeriesFromSql,
    payload?.balances,
    payload?.balance,
    payload?.window,
    payload?.accounts,
    payload?.combinedLiveMonthlyReturn?.total,
    payload?.combinedLiveMonthlyDrawdown?.total,
    payload?.combinedLiveMonthlyReturnWithUpnl?.total,
    payload?.combinedLiveMonthlyDrawdownWithUpnl?.total,
    payload?.mtdReturn?.realized,
    payload?.mtdReturn?.margin,
    payload?.mtdDrawdown?.realized,
    payload?.mtdDrawdown?.margin,
    payload?.sql_historical_balances?.realized,
    payload?.sql_historical_balances?.margin,
    payload?.initial_balances,
    accounts,
  ]);

  const [devOpen, setDevOpen] = useState<boolean>(false);

  if (initialLoading) return <InitialLoadSkeleton />;

  return (
    <div className="space-y-4">
      <LiveUpnlStrip combined={combinedFiltered} perAccount={perFiltered} maxAccounts={12} />

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 10%)", alignItems: "start" }}
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

          {/* Developer’s Tool */}
          <div className="rounded-lg border bg-card text-card-foreground">
            <button
              type="button"
              onClick={() => setDevOpen((v) => !v)}
              aria-expanded={devOpen}
              className="w-full flex items-center justify-between px-3 py-2 sm:px-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Developer’s Tool</span>
                <span className="text-xs text-muted-foreground">{devOpen ? "Hide" : "Show"}</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${devOpen ? "rotate-0" : "-rotate-90"}`} />
            </button>

            <div className="h-px w-full bg-border" />

            <div className={`transition-[max-height,opacity] duration-200 ease-out overflow-hidden ${devOpen ? "opacity-100 max-h-[600px]" : "opacity-0 max-h-0"}`}>
              <div className="p-3 sm:p-4 text-sm font-mono bg-muted/30">
                <div className="mb-2 text-xs text-muted-foreground">
                  Accounts: <span className="font-medium">{accountsLabel}</span>
                </div>
                <div className="mb-2 text-xs text-muted-foreground">
                  API as_of: <span className="font-medium">{asOf ?? "—"}</span> • Fetched:{" "}
                  <span className="font-medium">{fetchedAt ?? "—"}</span>
                </div>

                {error ? (
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <div className="mt-2 max-h-[400px] overflow-y-auto rounded border bg-background px-3 py-2">
                  <pre className="text-xs whitespace-pre-wrap break-all">{pretty}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="row-span-2">
          <LosingDaysCard losingDays={payload?.losingDays} accounts={accountList} variant="list" />
        </div>
      </div>
    </div>
  );
}
