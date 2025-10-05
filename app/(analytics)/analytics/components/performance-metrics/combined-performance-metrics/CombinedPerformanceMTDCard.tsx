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
import { BulkMetricsResponse } from "./types";
import { computeSeriesOverWindow } from "./helpers";

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

  const { eq: realizedEq } = useMemo(() => {
    const realizedBalance: Record<string, Record<string, number>> | undefined =
      (bulk.balancePreUpnl as
        | Record<string, Record<string, number>>
        | undefined) ??
      (bulk.balance as Record<string, Record<string, number>> | undefined) ??
      (bulk.balances?.realized as
        | Record<string, Record<string, number>>
        | undefined);

    const series =
      realizedBalance ?? ({} as Record<string, Record<string, number>>);

    return computeSeriesOverWindow(series, accs, startDay, endDay);
  }, [
    bulk.balancePreUpnl,
    bulk.balance,
    bulk.balances,
    accs,
    startDay,
    endDay,
  ]);

  const startBal = realizedEq.length ? realizedEq[0]! : 0;
  const latestRealized = realizedEq.length
    ? realizedEq[realizedEq.length - 1]!
    : 0;
  const marginLatest =
    latestRealized + (Number.isFinite(combinedUpnl) ? combinedUpnl : 0);

  const totalBal = marginLatest;
  const deltaBal = totalBal - startBal;

  // Metrics — prefer combined* keys, fall back to mtd*
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

  // uPnL component (margin return already includes it)
  const upnlReturn = marginReturn - realizedReturn;

  // responsive container width for shared sizing
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
              Combined Performance — MTD
            </CardTitle>
            <CardDescription className="text-sm leading-snug">
              {windowLabel}
            </CardDescription>

            <div className="flex flex-wrap items-center gap-2">
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
          barHeight={barHeight}
          rowGap={rowGap}
          barColumnPadX={barColumnPadX}
        />
        <ReturnChart
          realizedReturn={realizedReturn}
          marginReturn={marginReturn}
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
