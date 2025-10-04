"use client";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { useEffect, useMemo, useRef, useState } from "react";
import { DrawdownChart } from "./DrawdownChart";
import { HeaderBadges } from "./HeaderBadges";
import {
    computeSeriesOverWindow
} from "./helpers";
import { ReturnChart } from "./ReturnChart";
import { BulkMetricsResponse } from "./types";

export default function CombinedPerformanceMTDCard({
  bulk,
  selected,
  combinedUpnl = 0,
}: {
  bulk: BulkMetricsResponse;
  selected: string[];
  combinedUpnl?: number;
}) {
  const accs = useMemo(
    () => (selected.length ? selected : (bulk.accounts ?? [])),
    [selected, bulk.accounts]
  );

  const windowLabel =
    bulk?.window?.startDay && bulk?.window?.endDay
      ? `${bulk.window.startDay} → ${bulk.window.endDay}`
      : "MTD";

  // balances: use pre-upnl if exposed, else realized (or balance alias)
  const realizedBalance =
    bulk.balancePreUpnl ??
    bulk.balance ??
    (bulk.balances?.realized as
      | Record<string, Record<string, number>>
      | undefined) ??
    {};

  const { eq: realizedEq } = useMemo(
    () =>
      computeSeriesOverWindow(
        realizedBalance,
        accs,
        bulk?.window?.startDay ?? "",
        bulk?.window?.endDay ?? ""
      ),
    [realizedBalance, accs, bulk?.window?.startDay, bulk?.window?.endDay]
  );

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

  // responsive container width for label positioning
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

  return (
    <Card className="w-full">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle>Combined Performance — MTD</CardTitle>
            <CardDescription className="mt-0.5">{windowLabel}</CardDescription>

            <HeaderBadges
              totalBal={totalBal}
              startBal={startBal}
              deltaBal={deltaBal}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent ref={wrapRef} className="px-2 sm:p-6">
        <DrawdownChart
          realizedDD={realizedDD}
          marginDD={marginDD}
          containerWidth={wrapW}
        />
        <ReturnChart
          realizedReturn={realizedReturn}
          marginReturn={marginReturn}
          containerWidth={wrapW}
        />
      </CardContent>
    </Card>
  );
}
