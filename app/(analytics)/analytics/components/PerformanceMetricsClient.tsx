"use client";

import { useEffect, useMemo, useState } from "react";

import CombinedPerformanceMTDCard from "./performance-metrics/combined-performance-metrics/CombinedPerformanceMTDCard";
import CombinedPerformanceStratMTDCard from "./performance-metrics/combine-performance-metrics-by-strat/CombinedPerformanceStratMTDCard";
import type {
  BulkMetricsResponse,
  DateToRow,
} from "./performance-metrics/combined-performance-metrics/types";
import LiveUpnlStrip from "./performance-metrics/LiveUpnlStrip";
import NetPnlList from "./performance-metrics/symbol-pnl/NetPnlList";
import type { Bucket } from "./performance-metrics/symbol-pnl/types";

import LosingDaysCard from "./performance-metrics/losing-days/ConsecutiveLosingDaysCard";
import type { AccountMini } from "./performance-metrics/losing-days/types";
import {
  EquitySeries,
  PerformanceMetricsPayload,
} from "@/components/prefs/types";
import RegularReturnsBarGraph from "./performance-metrics/regular-returns/RegularReturnsCard";
import { MaxDrawdownChart } from "./performance-metrics/max-drawdown/MaxDrawdownChart";

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

// Pivot (date -> row) => (account -> day)
function reshapeRealizedToAccountSeries(
  byDate: EquitySeries | undefined,
  accounts: string[]
): Record<string, Record<string, number>> | undefined {
  if (!byDate) return undefined;
  const out: Record<string, Record<string, number>> = {};
  for (const acc of accounts) out[acc] = {};
  for (const [rawKey, row] of Object.entries(byDate)) {
    const day = rawKey.includes(" ") ? rawKey.split(" ")[0] : rawKey;
    for (const acc of accounts) {
      const v = (row as Record<string, number>)[acc];
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
}: Props) {
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(
    Boolean(payload) || Boolean(error)
  );
  useEffect(() => {
    if (payload || error) setHasLoadedOnce(true);
  }, [payload, error]);
  const initialLoading = loading && !hasLoadedOnce;

  // UPNL (filtered)
  const { perFiltered, combinedFiltered } = useMemo(() => {
    const src = payload?.uPnl?.perAccount ?? {};
    const filtered: Record<string, number> = {};
    for (const a of accounts ?? []) {
      const v = (src as Record<string, number | string | null | undefined>)[a];
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

  // Symbol PnL rows
  const symbolRows: Bucket[] = useMemo((): Bucket[] => {
    const symMap = payload?.symbolPnlMTD?.symbols ?? {};
    const out: Bucket[] = [];
    for (const [sym, vals] of Object.entries(symMap)) {
      const total = Number((vals as Record<string, unknown>).TOTAL ?? 0);
      if (Number.isFinite(total)) out.push({ label: sym, total });
    }
    out.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    return out;
  }, [payload]);

  const accountList: AccountMini[] = useMemo(
    () => accounts.map((r) => ({ redisName: r, strategy: null })),
    [accounts]
  );

  // Build realized series for charts from API
  const realizedSeriesFromApi = useMemo(
    () =>
      reshapeRealizedToAccountSeries(
        payload?.equity?.realized?.series,
        accounts
      ),
    [payload?.equity?.realized?.series, accounts]
  );

  const combinedBulk: BulkMetricsResponse = useMemo(() => {
    const realized: Record<string, Record<string, number>> | undefined =
      realizedSeriesFromApi;

    const realizedRetTotal = payload?.returns?.realized?.percent?.total;
    const realizedDdTotal = payload?.drawdown?.realized?.max?.total;
    const marginRetTotal = payload?.returns?.margin?.percent?.total;
    const marginDdTotal = payload?.drawdown?.margin?.max?.total;

    const realizedByDate: DateToRow | undefined =
      payload?.equity?.realized?.series;
    const marginByDate: DateToRow | undefined = payload?.equity?.margin?.series;

    return {
      window: payload?.meta?.window,
      accounts: payload?.accounts ?? accounts,

      balance: realized,
      balancePreUpnl: undefined,

      combinedLiveMonthlyReturn:
        realizedRetTotal == null
          ? undefined
          : { total: Number(realizedRetTotal) },
      combinedLiveMonthlyDrawdown:
        realizedDdTotal == null
          ? undefined
          : { total: Number(realizedDdTotal) },
      combinedLiveMonthlyReturnWithUpnl:
        marginRetTotal == null ? undefined : { total: Number(marginRetTotal) },
      combinedLiveMonthlyDrawdownWithUpnl:
        marginDdTotal == null ? undefined : { total: Number(marginDdTotal) },

      mtdReturn: {
        realized: payload?.returns?.realized?.percent ?? {},
        margin: payload?.returns?.margin?.percent ?? {},
      },
      mtdDrawdown: {
        realized: payload?.drawdown?.realized?.max ?? {},
        margin: payload?.drawdown?.margin?.max ?? {},
      },

      sql_historical_balances: {
        realized: realizedByDate,
        margin: marginByDate,
      },
      initial_balances: payload?.initialBalances,

      // Dynamic strategy aggregation
      performanceByStrategy: payload?.performanceByStrategy ?? {},
    };
  }, [
    realizedSeriesFromApi,
    payload?.meta?.window,
    payload?.accounts,
    payload?.returns?.realized?.percent,
    payload?.returns?.margin?.percent,
    payload?.drawdown?.realized?.max,
    payload?.drawdown?.margin?.max,
    payload?.equity?.realized?.series,
    payload?.equity?.margin?.series,
    payload?.initialBalances,
    payload?.performanceByStrategy,
    accounts,
  ]);

  // All-time realized drawdown values
  const currentDdAllTimeRealizedMap: Record<string, number> | undefined =
    payload?.all_time_max_current_dd?.realized?.current ?? undefined;

  const currentDdAllTimeRealizedTotal: number = (() => {
    const v = payload?.all_time_max_current_dd?.realized?.current?.total;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    return Number(payload?.drawdown?.margin?.current?.total ?? 0);
  })();

  const maxDdAllTimeRealizedAbs: number = (() => {
    const v = payload?.all_time_max_current_dd?.realized?.max?.total;
    const n = Number(v);
    if (Number.isFinite(n)) return Math.abs(n);
    return Math.abs(Number(payload?.drawdown?.margin?.max?.total ?? 0));
  })();

  if (initialLoading) return <InitialLoadSkeleton />;

  return (
    <div className="gap-4 flex flex-col">
      <LiveUpnlStrip
        combined={combinedFiltered}
        perAccount={perFiltered}
        maxAccounts={12}
        window={payload?.meta?.window}
      />
      <div
        className="grid"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 10%)",
          alignItems: "start",
        }}
      >
        <div>
          {/* Ensure independent heights for these two cards */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 items-start">
            <CombinedPerformanceMTDCard
              bulk={combinedBulk}
              selected={accounts}
              combinedUpnl={payload?.uPnl?.combined ?? 0}
            />
            <div className="self-start">
              <RegularReturnsBarGraph
                accounts={accounts}
                data={payload?.regular_returns ?? {}}
              />
            </div>
          </div>
        </div>
        {/* RIGHT COLUMN */}
        <div className="row-span-2 grid gap-4 ml-4">
          <LosingDaysCard
            losingDays={payload?.losingDays}
            accounts={accountList}
            variant="list"
          />

          {/* All-time realized drawdown widget */}
          <MaxDrawdownChart
            value={currentDdAllTimeRealizedTotal}
            breakdown={currentDdAllTimeRealizedMap}
            selectedAccounts={accounts}
            maxRefAbs={maxDdAllTimeRealizedAbs}
            maxRefLabel="All-time max"
            window={payload?.meta?.window}
          />
        </div>
      </div>

      <div className="space-y-4">
        {/* Ensure independent heights for these two cards */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 items-start">
          <CombinedPerformanceStratMTDCard
            bulk={combinedBulk}
            selected={accounts}
          />
          <div className="self-start">
            <NetPnlList
              rows={symbolRows}
              selectedAccounts={accounts}
              symbolBreakdownMap={payload?.symbolPnlMTD?.symbols}
              window={payload?.meta?.window}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
