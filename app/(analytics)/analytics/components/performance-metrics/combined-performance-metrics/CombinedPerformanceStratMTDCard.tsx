// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/CombinedPerformanceStratMTDCard.tsx
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
import type { BulkMetricsResponse } from "./types";

function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
}

export default function CombinedPerformanceStratMTDCard({
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

  // header balances (unchanged)
  const startBal = round2(
    (bulk.initial_balances
      ? accs.reduce(
          (s, a) => s + (Number(bulk.initial_balances?.[a] ?? 0) || 0),
          0
        )
      : 0) as number
  );
  const totalBal = startBal + round2(combinedUpnl);
  const deltaBal = round2(totalBal - startBal);

  // --- STRATEGY DEFINITIONS (DUMMY VALUES FOR NOW) ---
  const strategies: Array<{
    title: string;
    accounts: string[];
    realizedDD: number;
    marginDD: number;
    realizedRet: number;
    marginRet: number;
  }> = [
    {
      title: "Janus Coint",
      accounts: ["fund2"],
      realizedDD: -0.019314,
      marginDD: -0.019413,
      realizedRet: -0.014717,
      marginRet: -0.012618,
    },
    {
      title: "Charm Coint",
      accounts: ["fund3"],
      realizedDD: -0.019314,
      marginDD: -0.019413,
      realizedRet: -0.014717,
      marginRet: -0.012618,
    },
  ];

  // responsive sizes (match charts)
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
  const stackH = barHeight * 2 + rowGap;
  const barColumnPadX = 10;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-2 sm:py-3 grid grid-rows-[auto_auto_auto] gap-2">
            <CardTitle className="leading-tight">
              Combined Performance by Coint Strategy
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
        {/* ---- DRAWNDOWN ROW ---- */}
        <div
          className="grid gap-x-2"
          style={{ gridTemplateColumns: "96px 1fr 1fr" }}
        >
          {/* Left label column */}
          <div className="pt-1">
            <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
              Drawdown
            </div>
            <div
              className="flex flex-col justify-between"
              style={{ height: stackH }}
            >
              <div className="text-sm text-foreground">Realized</div>
              <div className="text-sm text-foreground">Margin</div>
            </div>
          </div>

          {/* Strategy: Janus */}
          <div>
            <div className="text-center text-sm font-medium mb-1">
              Janus Coint
            </div>
            <DrawdownChart
              title={null}
              realizedLabel={false}
              marginLabel={false}
              realizedDD={strategies[0]!.realizedDD}
              marginDD={strategies[0]!.marginDD}
              selectedAccounts={strategies[0]!.accounts}
              barHeight={barHeight}
              rowGap={rowGap}
              barColumnPadX={barColumnPadX}
            />
          </div>

          {/* Strategy: Charm */}
          <div>
            <div className="text-center text-sm font-medium mb-1">
              Charm Coint
            </div>
            <DrawdownChart
              title={null}
              realizedLabel={false}
              marginLabel={false}
              realizedDD={strategies[1]!.realizedDD}
              marginDD={strategies[1]!.marginDD}
              selectedAccounts={strategies[1]!.accounts}
              barHeight={barHeight}
              rowGap={rowGap}
              barColumnPadX={barColumnPadX}
            />
          </div>
        </div>

        {/* ---- RETURN ROW ---- */}
        <div
          className="grid gap-x-2"
          style={{ gridTemplateColumns: "96px 1fr 1fr" }}
        >
          {/* Left label column */}
          <div className="pt-1">
            <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
              Return
            </div>
            <div
              className="flex flex-col justify-between"
              style={{ height: stackH }}
            >
              <div className="text-sm text-foreground">Realized</div>
              <div className="text-sm text-foreground">Margin</div>
            </div>
          </div>

          {/* Strategy: Janus */}
          <div>
            <div className="text-center text-sm font-medium mb-1">
              Janus Coint
            </div>
            <ReturnChart
              title={null}
              realizedLabel={false}
              marginLabel={false}
              realizedReturn={strategies[0]!.realizedRet}
              marginReturn={strategies[0]!.marginRet}
              selectedAccounts={strategies[0]!.accounts}
              containerWidth={wrapW}
              upnlReturn={strategies[0]!.marginRet - strategies[0]!.realizedRet}
              barHeight={barHeight}
              rowGap={rowGap}
              barColumnPadX={barColumnPadX}
            />
          </div>

          {/* Strategy: Charm */}
          <div>
            <div className="text-center text-sm font-medium mb-1">
              Charm Coint
            </div>
            <ReturnChart
              title={null}
              realizedLabel={false}
              marginLabel={false}
              realizedReturn={strategies[1]!.realizedRet}
              marginReturn={strategies[1]!.marginRet}
              selectedAccounts={strategies[1]!.accounts}
              containerWidth={wrapW}
              upnlReturn={strategies[1]!.marginRet - strategies[1]!.realizedRet}
              barHeight={barHeight}
              rowGap={rowGap}
              barColumnPadX={barColumnPadX}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
