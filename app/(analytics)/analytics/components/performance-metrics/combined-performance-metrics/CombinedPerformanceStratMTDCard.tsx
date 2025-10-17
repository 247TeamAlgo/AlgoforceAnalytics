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

  // header balances
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

  // ---- Read strategy rollups from API payload ----
  const cs = bulk.combinedCointStrategy;
  // Fallback to zeros if the API block is missing
  const janus = {
    accounts: ["fund2"],
    realizedDD: Number(cs?.drawdown?.realized?.janus_coint ?? 0),
    marginDD: Number(cs?.drawdown?.margin?.janus_coint ?? 0),
    realizedRet: Number(cs?.return?.realized?.janus_coint ?? 0),
    marginRet: Number(cs?.return?.margin?.janus_coint ?? 0),
  };
  const charm = {
    accounts: ["fund3"],
    realizedDD: Number(cs?.drawdown?.realized?.charm_coint ?? 0),
    marginDD: Number(cs?.drawdown?.margin?.charm_coint ?? 0),
    realizedRet: Number(cs?.return?.realized?.charm_coint ?? 0),
    marginRet: Number(cs?.return?.margin?.charm_coint ?? 0),
  };

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
          {/* Left label column — tighter */}
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

          {/* Janus */}
          <div>
            <div className="text-center text-sm font-medium mb-1">
              Janus Coint
            </div>
            <DrawdownChart
              title={null}
              realizedLabel={false}
              marginLabel={false}
              realizedDD={janus.realizedDD}
              marginDD={janus.marginDD}
              selectedAccounts={janus.accounts}
              barHeight={barHeight}
              rowGap={rowGap}
              barColumnPadX={barColumnPadX}
            />
          </div>

          {/* Charm */}
          <div>
            <div className="text-center text-sm font-medium mb-1">
              Charm Coint
            </div>
            <DrawdownChart
              title={null}
              realizedLabel={false}
              marginLabel={false}
              realizedDD={charm.realizedDD}
              marginDD={charm.marginDD}
              selectedAccounts={charm.accounts}
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
          {/* Left label column — tighter */}
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

          {/* Janus */}
          <div>
            <div className="text-center text-sm font-medium mb-1">
              Janus Coint
            </div>
            <ReturnChart
              title={null}
              realizedLabel={false}
              marginLabel={false}
              realizedReturn={janus.realizedRet}
              marginReturn={janus.marginRet}
              selectedAccounts={janus.accounts}
              containerWidth={wrapW}
              upnlReturn={janus.marginRet - janus.realizedRet}
              barHeight={barHeight}
              rowGap={rowGap}
              barColumnPadX={barColumnPadX}
            />
          </div>

          {/* Charm */}
          <div>
            <div className="text-center text-sm font-medium mb-1">
              Charm Coint
            </div>
            <ReturnChart
              title={null}
              realizedLabel={false}
              marginLabel={false}
              realizedReturn={charm.realizedRet}
              marginReturn={charm.marginRet}
              selectedAccounts={charm.accounts}
              containerWidth={wrapW}
              upnlReturn={charm.marginRet - charm.realizedRet}
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
