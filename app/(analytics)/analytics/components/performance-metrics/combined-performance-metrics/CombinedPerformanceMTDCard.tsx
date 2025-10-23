// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/CombinedPerformanceMTDCard.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffect, useMemo, useRef, useState } from "react";
import DrawdownChart from "./DrawdownChart";
import { HeaderBadges } from "./HeaderBadges";
import { ReturnChart } from "./ReturnChart";
import { BulkMetricsResponse, DateToRow } from "./types";
import { computeSeriesOverWindow } from "./helpers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function sumSelected(
  row: Record<string, number> | undefined,
  accs: string[]
): number {
  if (!row) return 0;
  let s = 0;
  for (const a of accs) {
    const v = row[a];
    if (typeof v === "number" && Number.isFinite(v)) s += v;
  }
  return s;
}

function pickDateKey(
  byDate: DateToRow | undefined,
  preferDay?: string | null
): string | null {
  if (!byDate) return null;
  const keys = Object.keys(byDate);
  if (!keys.length) return null;

  if (preferDay) {
    if (Object.prototype.hasOwnProperty.call(byDate, preferDay))
      return preferDay;
    const k2 = keys.find((k) => k.startsWith(preferDay)); // match "YYYY-MM-DD 00:00:00"
    if (k2) return k2;
  }
  keys.sort();
  return keys[keys.length - 1] ?? null;
}

/** Round to 2 decimals without changing non-finite values. */
function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
}

// Simple “Accounts (N)” badge with tooltip of account names
function AccountsBadge({ accounts }: { accounts: string[] }) {
  const count = accounts?.length ?? 0;
  if (!count) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-2 rounded-md border bg-card/60 px-1.5 py-1 text-xs cursor-default">
            <span className="text-muted-foreground">Accounts</span>
            <span className="font-semibold text-foreground">({count})</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          align="start"
          side="top"
          className="p-2 rounded-md border bg-popover text-popover-foreground text-xs"
        >
          <div className="max-w-[220px]">
            {accounts.map((a) => (
              <div key={a}>{a}</div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function CombinedPerformanceMTDCard({
  bulk,
  selected,
  combinedUpnl = 0,
}: {
  bulk: BulkMetricsResponse;
  selected: string[];
  combinedUpnl?: number;
}) {
  const accs = useMemo<string[]>(
    () => (selected.length ? selected : (bulk.accounts ?? [])),
    [selected, bulk.accounts]
  );

  const windowLabel =
    bulk?.window?.startDay && bulk?.window?.endDay
      ? `${bulk.window.startDay} → ${bulk.window.endDay}`
      : "MTD";

  const { startDay = "", endDay = "" } = bulk.window ?? {};

  // Charts (realized series already pivoted to account->day)
  const { eq: realizedEq } = useMemo(() => {
    const realizedSeries: Record<string, Record<string, number>> | undefined =
      bulk.balance ?? bulk.balancePreUpnl;
    const series = realizedSeries ?? {};
    return computeSeriesOverWindow(series, accs, startDay, endDay);
  }, [bulk.balance, bulk.balancePreUpnl, accs, startDay, endDay]);

  // Header from SQL sources — raw values first
  const startBalRaw = useMemo(() => {
    const init = bulk.initial_balances ?? {};
    let s = 0;
    for (const a of accs) {
      const v = init[a];
      if (typeof v === "number" && Number.isFinite(v)) s += v;
    }
    return s;
  }, [bulk.initial_balances, accs]);

  const totalBalRaw = useMemo(() => {
    const byDate = bulk.sql_historical_balances?.margin;
    if (byDate) {
      const key = pickDateKey(byDate, endDay);
      if (key) {
        const row = byDate[key];
        const sum = sumSelected(row, accs);
        if (Number.isFinite(sum)) return sum;
      }
    }
    // Fallback only if SQL margin is missing
    const latestRealized = realizedEq.length
      ? realizedEq[realizedEq.length - 1]
      : 0;
    return latestRealized + (Number.isFinite(combinedUpnl) ? combinedUpnl : 0);
  }, [
    bulk.sql_historical_balances?.margin,
    endDay,
    accs,
    realizedEq,
    combinedUpnl,
  ]);

  const deltaBalRaw = totalBalRaw - startBalRaw;

  // Strictly rounded values (2 decimals) — used ONLY for display in HeaderBadges
  const startBal = useMemo(() => round2(startBalRaw), [startBalRaw]);
  const totalBal = useMemo(() => round2(totalBalRaw), [totalBalRaw]);
  const deltaBal = useMemo(() => round2(deltaBalRaw), [deltaBalRaw]);

  // Totals (unchanged)
  const realizedReturn =
    bulk?.combinedLiveMonthlyReturn?.total ??
    bulk?.mtdReturn?.realized?.total ??
    0;
  const realizedDD =
    bulk?.combinedLiveMonthlyDrawdown?.total ??
    bulk?.mtdDrawdown?.realized?.total ??
    0;

  const marginReturn =
    bulk?.combinedLiveMonthlyReturnWithUpnl?.total ??
    bulk?.mtdReturn?.margin?.total ??
    0;
  const marginDD =
    bulk?.combinedLiveMonthlyDrawdownWithUpnl?.total ??
    bulk?.mtdDrawdown?.margin?.total ??
    0;

  const realizedReturnMap = bulk?.mtdReturn?.realized ?? undefined;
  const marginReturnMap = bulk?.mtdReturn?.margin ?? undefined;
  const realizedDDMap = bulk?.mtdDrawdown?.realized ?? undefined;
  const marginDDMap = bulk?.mtdDrawdown?.margin ?? undefined;

  const upnlReturn = marginReturn - realizedReturn;

  // Responsive sizing
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState<number>(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setWrapW(r.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const barHeight = Math.round(Math.min(38, Math.max(24, wrapW * 0.03)));
  const rowGap = Math.round(barHeight * 0.55);
  const barColumnPadX = 10;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-2 sm:py-3 grid grid-rows-[auto_auto_auto] gap-2">
            <CardTitle className="leading-tight">
              Month-to-Date Performance
            </CardTitle>
            <CardDescription className="text-sm leading-snug">
              {windowLabel}
            </CardDescription>

            <div className="flex flex-wrap items-center gap-2">
              {/* NEW: Accounts (N) badge before balance badges */}
              <AccountsBadge accounts={accs} />
              <HeaderBadges
                totalBal={totalBal}
                startBal={startBal}
                deltaBal={deltaBal}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent ref={wrapRef} className="px-2 space-y-8 sm:p-6">
        <DrawdownChart
          realizedDD={realizedDD}
          marginDD={marginDD}
          realizedBreakdown={realizedDDMap}
          marginBreakdown={marginDDMap}
          selectedAccounts={accs}
          barHeight={barHeight}
          rowGap={rowGap}
          barColumnPadX={barColumnPadX}
        />
        <ReturnChart
          realizedReturn={realizedReturn}
          marginReturn={marginReturn}
          realizedBreakdown={realizedReturnMap}
          marginBreakdown={marginReturnMap}
          selectedAccounts={accs}
          upnlReturn={upnlReturn}
          containerWidth={wrapW}
          barHeight={barHeight}
          rowGap={rowGap}
          barColumnPadX={barColumnPadX}
        />
      </CardContent>
    </Card>
  );
}
