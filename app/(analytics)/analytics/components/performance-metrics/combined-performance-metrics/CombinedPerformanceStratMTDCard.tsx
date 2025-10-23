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
import { ReturnChart } from "./ReturnChart";
import type { BulkMetricsResponse } from "./types";

/* ----------------------------- helpers ----------------------------- */

function joinList(xs: string[]): string {
  return xs.length ? xs.join(", ") : "—";
}

function Pill({ label, hint }: { label: string; hint: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-md border bg-card/60 px-2.5 py-1 text-xs"
      title={hint}
    >
      <span className="font-semibold text-foreground">{label}</span>
      <span className="text-muted-foreground">— {hint}</span>
    </span>
  );
}

/* ---------------------------------- Card ---------------------------------- */

export default function CombinedPerformanceStratMTDCard({
  bulk,
  selected,
}: {
  bulk: BulkMetricsResponse;
  selected: string[];
}) {
  // If user passed selected accounts, prefer those; otherwise use API accounts.
  const selectedAccs = useMemo<string[]>(
    () => (selected.length ? selected : (bulk.accounts ?? [])),
    [selected, bulk.accounts]
  );

  const windowLabel =
    bulk?.window?.startDay && bulk?.window?.endDay
      ? `${bulk.window.startDay} → ${bulk.window.endDay}`
      : "MTD";

  // ---- Read strategy rollups from API payload ----
  const cs = bulk.combinedCointStrategy;

  // Define which accounts belong to which strategy.
  // If `selected` is set, we still enumerate the intersection for transparency.
  const janusAccountsBase: string[] = ["fund2"];
  const ademAccountsBase: string[] = ["fund3"];
  const janusAccounts =
    selectedAccs.length === 0
      ? janusAccountsBase
      : janusAccountsBase.filter((a) => selectedAccs.includes(a));
  const ademAccounts =
    selectedAccs.length === 0
      ? ademAccountsBase
      : ademAccountsBase.filter((a) => selectedAccs.includes(a));

  const janus = {
    name: "Janus Coint",
    accounts: janusAccounts,
    realizedDD: Number(cs?.drawdown?.realized?.janus_coint ?? 0),
    marginDD: Number(cs?.drawdown?.margin?.janus_coint ?? 0),
    realizedRet: Number(cs?.return?.realized?.janus_coint ?? 0),
    marginRet: Number(cs?.return?.margin?.janus_coint ?? 0),
  };
  const adem = {
    name: "Adem Coint",
    accounts: ademAccounts,
    realizedDD: Number(cs?.drawdown?.realized?.adem_coint ?? 0),
    marginDD: Number(cs?.drawdown?.margin?.adem_coint ?? 0),
    realizedRet: Number(cs?.return?.realized?.adem_coint ?? 0),
    marginRet: Number(cs?.return?.margin?.adem_coint ?? 0),
  };
  const strategies = [janus, adem];

  // Responsive sizes (match the charts’ expectations)
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
  const DD_AXIS_BAND_PX = 40;
  const RETURN_AXIS_BAND_PX = 11;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-2 sm:py-3 grid grid-rows-[auto_auto_auto] gap-2">
            <CardTitle className="leading-tight">
              Month-to-Date Performance by Coint Strategy
            </CardTitle>
            <CardDescription className="text-sm leading-snug">
              {windowLabel}
            </CardDescription>

            {/* Strategy pills instead of balances */}
            <div className="flex flex-wrap items-center gap-2">
              <Pill label="Janus Coint" hint={joinList(janus.accounts)} />
              <Pill label="Adem Coint" hint={joinList(adem.accounts)} />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent ref={wrapRef} className="px-2 space-y-8 sm:p-6">
        {/* ===================== DRAWNDOWN — transposed ===================== */}
        <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
          Drawdown
        </div>

        <div
          className="grid gap-y-6 gap-x-4"
          style={{ gridTemplateColumns: "160px 1fr" }}
        >
          {strategies.map((s) => (
            <div key={`dd-row-${s.name}`} className="contents">
              <div className="text-sm font-medium self-center">{s.name}</div>
              <div>
                <DrawdownChart
                  title={null}
                  realizedLabel
                  marginLabel
                  realizedDD={s.realizedDD}
                  marginDD={s.marginDD}
                  selectedAccounts={s.accounts}
                  barHeight={barHeight}
                  rowGap={rowGap}
                  barColumnPadX={barColumnPadX}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ===================== RETURN — transposed ===================== */}
        <div className="mt-4 mb-2 text-sm sm:text-base font-medium text-foreground">
          Return
        </div>

        <div
          className="grid gap-y-6 gap-x-4"
          style={{ gridTemplateColumns: "160px 1fr" }}
        >
          {strategies.map((s) => (
            <div key={`ret-row-${s.name}`} className="contents">
              <div className="text-sm font-medium self-center">{s.name}</div>
              <div>
                <ReturnChart
                  title={null}
                  realizedLabel
                  marginLabel
                  realizedReturn={s.realizedRet}
                  marginReturn={s.marginRet}
                  selectedAccounts={s.accounts}
                  containerWidth={wrapW}
                  upnlReturn={s.marginRet - s.realizedRet}
                  barHeight={barHeight}
                  rowGap={rowGap}
                  barColumnPadX={barColumnPadX}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Axis band offsets kept to preserve prior vertical alignment */}
        <style>{`
          /* fine alignment nudges for axis/title spacing */
          [data-drawdown-axis-band] { margin-top: ${DD_AXIS_BAND_PX}px; }
          [data-return-axis-band]   { margin-top: ${RETURN_AXIS_BAND_PX}px; }
        `}</style>
      </CardContent>
    </Card>
  );
}
