// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/CombinedPerformanceStratMTDCard.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
import DrawdownChart from "../combined-performance-metrics/DrawdownChart";
import { ReturnChart } from "../combined-performance-metrics/ReturnChart";
import type { BulkMetricsResponse } from "../combined-performance-metrics/types";

/* ----------------------------- helpers ----------------------------- */

function humanize(k: string): string {
  return k.replace(/_/g, " ").trim();
}
function norm(k: string): string {
  return humanize(k).toLowerCase();
}

type StrategyRow = {
  key: string;
  name: string;
  accounts: string[];
  realizedDD: number;
  marginDD: number;
  realizedRet: number;
  marginRet: number;
};

/* Small colored square (kept for per-strategy cards) */
function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-[3px]"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}

/* Pill-style Strategies badge (tooltip lists accounts per strategy) */
function StrategiesBadge({ rows }: { rows: StrategyRow[] }) {
  const count = rows.length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-2 rounded-[6px] border bg-card/60 px-2.5 py-1 text-xs cursor-default"
          title="Strategies"
          aria-label="Strategies"
        >
          <span
            aria-hidden="true"
            className="inline-block rounded-[3px] bg-primary/85"
            style={{ width: 10, height: 10 }}
          />
          <span className="text-muted-foreground">Strategies</span>
          <span className="font-semibold text-foreground">({count} Strat/s)</span>
        </span>
      </TooltipTrigger>

      <TooltipContent
        align="start"
        side="top"
        className="p-2 rounded-[6px] border bg-popover text-popover-foreground text-xs"
      >
        <div className="max-w-[360px]">
          {count === 0 ? (
            <div className="text-muted-foreground">None</div>
          ) : (
            rows.map((r) => {
              const accounts = r.accounts.length ? r.accounts : ["—"];
              return (
                <div key={`tip-${r.key}`} className="mb-3 last:mb-0">
                  <div className="font-bold">{r.name}</div>
                  <div className="mt-1 text-xs space-y-0.5">
                    <div className="tracking-wide text-muted-foreground">
                      Accounts
                    </div>
                    <div className="break-words font-light text-accent-foreground">
                      {accounts.join(", ")}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/* ---------------------------------- Component ---------------------------------- */

export default function CombinedPerformanceStratMTDCard({
  bulk,
  selected,
}: {
  bulk: BulkMetricsResponse;
  selected: string[];
}) {
  // Width observer for consistent chart sizing
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

  // Selected accounts
  const selectedAccs = useMemo<string[]>(
    () => (selected.length ? selected : bulk.accounts ?? []),
    [selected, bulk.accounts]
  );

  // Build strategies (payload-driven)
  const strategies = useMemo<StrategyRow[]>(() => {
    const src = bulk.performanceByStrategy ?? {};
    const rows: StrategyRow[] = Object.entries(src).map(([raw, v]) => {
      const base = v.accounts ?? [];
      const accounts =
        selectedAccs.length === 0
          ? base
          : base.filter((a) => selectedAccs.includes(a));
      return {
        key: raw,
        name: humanize(raw),
        accounts,
        realizedDD: Number(v.drawdown?.realized ?? 0),
        marginDD: Number(v.drawdown?.margin ?? 0),
        realizedRet: Number(v.return?.realized ?? 0),
        marginRet: Number(v.return?.margin ?? 0),
      };
    });

    // Sort: Janus first, then Adem, then alpha
    const pri = new Set(["janus", "adem"]);
    rows.sort((a, b) => {
      const an = norm(a.key);
      const bn = norm(b.key);
      const ap = pri.has(an) ? 0 : 1;
      const bp = pri.has(bn) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return rows;
  }, [bulk.performanceByStrategy, selectedAccs]);

  // Stable color per strategy key for card headers
  const colorMap = useMemo<Record<string, string>>(() => {
    const palette = [
      "#16a34a", // green-600
      "#2563eb", // blue-600
      "#dc2626", // red-600
      "#9333ea", // purple-600
      "#ea580c", // orange-600
      "#0891b2", // cyan-600
      "#ca8a04", // yellow-600
      "#db2777", // pink-600
      "#0d9488", // teal-600
      "#4b5563", // gray-600
    ];
    const map: Record<string, string> = {};
    strategies.forEach((s, i) => {
      map[s.key] = palette[i % palette.length];
    });
    return map;
  }, [strategies]);

  // Short, one-line description (fits without wrapping)
  const desc =
    "Strategy returns & drawdowns for selected accounts — hover Strategies to see accounts.";

  return (
    <Card ref={wrapRef} className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-2 sm:py-3 grid grid-rows-[auto_auto_auto] gap-2">
            <CardTitle className="leading-tight">
              Month-to-Date Performance by Strategy
            </CardTitle>

            <CardDescription
              className="text-sm leading-snug truncate whitespace-nowrap"
              title={desc}
            >
              {desc}
            </CardDescription>

            <TooltipProvider delayDuration={150}>
              <div className="flex flex-wrap items-center gap-2">
                <StrategiesBadge rows={strategies} />
              </div>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 space-y-2 p-5">
        {/* ======= Section: Return (title outside), then per-strategy cards ======= */}
        <div className="text-sm sm:text-base font-medium text-foreground">
          Return
        </div>

        <div className="grid gap-4 mb-6">
          {strategies.map((s) => (
            <div
              key={`ret-card-${s.key}`}
              className="rounded-md border bg-card/60"
            >
              <div className="flex items-center gap-2 px-3 pt-3">
                <Dot color={colorMap[s.key] ?? "#4b5563"} size={10} />
                <div className="text-sm font-semibold">{s.name}</div>
              </div>
              <div className="px-2 sm:px-4 pb-4 pt-2">
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

        {/* ======= Section: Drawdown (title outside), then per-strategy cards ======= */}
        <div className="text-sm sm:text-base font-medium text-foreground">
          Drawdown
        </div>

        <div className="grid gap-4">
          {strategies.map((s) => (
            <div
              key={`dd-card-${s.key}`}
              className="rounded-xl border bg-card/60"
            >
              <div className="flex items-center gap-2 px-3 pt-3">
                <Dot color={colorMap[s.key] ?? "#4b5563"} size={10} />
                <div className="text-sm font-semibold">{s.name}</div>
              </div>
              <div className="px-2 sm:px-4 pb-4 pt-2">
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
      </CardContent>
    </Card>
  );
}
