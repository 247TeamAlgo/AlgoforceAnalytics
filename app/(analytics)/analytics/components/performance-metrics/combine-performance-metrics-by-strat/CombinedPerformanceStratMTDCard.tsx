// app/(analytics)/analytics/components/performance-metrics/combine-performance-metrics-by-strat/CombinedPerformanceStratMTDCard.tsx
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
import { SiBinance } from "react-icons/si";
import DrawdownChart from "../combined-performance-metrics/DrawdownChart";
import { ReturnChart } from "../combined-performance-metrics/ReturnChart";
import type { BulkMetricsResponse } from "../combined-performance-metrics/types";

/* ----------------------------- helpers ----------------------------- */

type StrategyRow = {
  key: string;
  name: string;
  accounts: string[];
  realizedDD: number;
  marginDD: number;
  realizedRet: number;
  marginRet: number;
};

function humanize(k: string): string {
  return k.replace(/_/g, " ").trim();
}

/* Stable-ish palette for chips */
const PALETTE = [
  "#16a34a", // emerald-600
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

/* A compact, consistent metric pill (dot • icon • label • bold value) */
function MetricPill({
  dot,
  icon,
  label,
  value,
  valueTone, // "pos" | "neg" | "muted"
}: {
  dot: string;
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueTone?: "pos" | "neg" | "muted";
}) {
  const toneCls =
    valueTone === "pos"
      ? "text-emerald-500"
      : valueTone === "neg"
        ? "text-red-500"
        : "text-foreground";
  return (
    <span className="inline-flex items-center gap-2 rounded-[10px] border bg-card/60 px-3 py-1 text-xs shadow-sm">
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-[3px]"
        style={{ backgroundColor: dot }}
      />
      {icon ? (
        <span aria-hidden className="mr-0.5">
          {icon}
        </span>
      ) : null}
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${toneCls}`}>{value}</span>
    </span>
  );
}

/* A tiny chip used inside the Strategies pill; responsive tooltip layout */
function StrategyChip({
  name,
  color,
  accounts,
}: {
  name: string;
  color: string;
  accounts: string[];
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-2 rounded-[8px] border bg-background/40 px-2 py-[2px] text-xs shrink-0 max-w-[140px]"
          title={name}
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: color }}
          />
          <span className="truncate">{name}</span>
        </span>
      </TooltipTrigger>

      {/* Responsive tooltip (no tab/indent; flex row that wraps) */}
      <TooltipContent
        side="top"
        align="start"
        className="p-3 rounded-[8px] border bg-popover text-popover-foreground text-xs w-[min(56vw,420px)] max-w-[420px]"
      >
        {/* Title: colored dot + strategy name */}
        <div className="mb-1.5 flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: color }}
          />
          <span className="font-semibold text-sm">{name}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <SiBinance className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-medium">Accounts</span>
            {accounts.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              accounts.map((a) => (
                <span
                  key={`${name}-acc-${a}`}
                  className="inline-flex items-center gap-1.5 rounded-[999px] border bg-background/40 px-2 py-[2px] text-xs"
                  style={{ boxShadow: `inset 0 0 0 1px ${color}55` }}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-[3px]"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-medium">{a}</span>
                </span>
              ))
            )}
          </div>
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
    () => (selected.length ? selected : (bulk.accounts ?? [])),
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

    return rows;
  }, [bulk.performanceByStrategy, selectedAccs]);

  // Color map
  const colorMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    strategies.forEach((s, i) => {
      map[s.key] = PALETTE[i % PALETTE.length];
    });
    return map;
  }, [strategies]);

  const desc =
    "Strategy returns & drawdowns for each strategy. Hover badge to see accounts.";

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-4 sm:px-6 pt-2 pb-2 sm:pt-3 sm:pb-3">
          <CardTitle className="leading-tight mb-2">
            Month-to-Date Performance by Strategy
          </CardTitle>
          <CardDescription>{desc}</CardDescription>

          <TooltipProvider delayDuration={100}>
            <div className="mt-1 flex items-center gap-2 overflow-x-auto flex-nowrap">
              <span className="inline-flex items-center gap-2 rounded-[10px] border bg-card/60 px-2.5 py-1 text-xs">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/60"
                />
                <span className="text-muted-foreground">Strategies</span>

                {/* chips (each with the updated tooltip) */}
                <div className="flex items-center gap-2 flex-nowrap">
                  {strategies.map((s, i) => (
                    <StrategyChip
                      key={`chip-${s.key}`}
                      name={s.name}
                      color={colorMap[s.key] ?? PALETTE[i % PALETTE.length]}
                      accounts={s.accounts}
                    />
                  ))}
                </div>
              </span>
            </div>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="px-2 space-y-2 p-5">
        {/* ======= Return per-strategy ======= */}
        <div className="text-sm sm:text-base font-medium text-foreground">
          Return
        </div>

        <div className="grid gap-4 mb-6">
          {strategies.map((s, i) => (
            <div
              key={`ret-card-${s.key}`}
              className="rounded-md border bg-card/60"
            >
              <div className="flex items-center gap-2 px-3 pt-3">
                <span
                  aria-hidden
                  className="inline-block rounded-[3px] h-2.5 w-2.5"
                  style={{
                    backgroundColor:
                      colorMap[s.key] ?? PALETTE[i % PALETTE.length],
                  }}
                />
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

        {/* ======= Drawdown per-strategy ======= */}
        <div className="text-sm sm:text-base font-medium text-foreground">
          Drawdown
        </div>

        <div className="grid gap-4">
          {strategies.map((s, i) => (
            <div
              key={`dd-card-${s.key}`}
              className="rounded-xl border bg-card/60"
            >
              <div className="flex items-center gap-2 px-3 pt-3">
                <span
                  aria-hidden
                  className="inline-block rounded-[3px] h-2.5 w-2.5"
                  style={{
                    backgroundColor:
                      colorMap[s.key] ?? PALETTE[i % PALETTE.length],
                  }}
                />
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
