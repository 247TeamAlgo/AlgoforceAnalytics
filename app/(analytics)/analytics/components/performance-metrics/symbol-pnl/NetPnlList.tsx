// app/(analytics)/analytics/components/performance-metrics/symbol-pnl/NetPnlList.tsx
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
import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { Bucket, SymbolBreakdownMap } from "./types";
import { METRICS_COLORS } from "../combined-performance-metrics/helpers";

/* ---------------------------- formatters ---------------------------- */

function usd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function pct2(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toFixed(2)}%`;
}

/* ------------------------------- types ------------------------------- */

type RowDatum = {
  id: string;
  label: string;
  value: number; // USD PnL
  fillFrac: number; // reserved (non-visual)
  totalPct: number; // signed % of basis used for the bar width
  sign: "pos" | "neg" | "zero";
  accounts?: Record<string, number>;
};

type Stats = { sum: number; max: RowDatum | null; min: RowDatum | null };

type PerformanceWindow = {
  mode: "MTD" | "WTD" | "Custom";
  startDay: string;
  endDay: string;
};

type Props = {
  rows: Bucket[];
  totalBasis?: number;
  selectedAccounts?: string[];
  symbolBreakdownMap?: SymbolBreakdownMap;
  /** Kept for API compatibility; not displayed in the subtitle anymore */
  window?: PerformanceWindow;
};

/* --------------------------- sizing constants --------------------------- */

const LABEL_CH = 10.5; // fixed-width columns for left label and right value
const BAR_MIN_PCT = 3; // minimum visible bar when non-zero
const RAIL_HEIGHT_PX = 20;

/* --------------------------------- ui --------------------------------- */

export default function NetPnlList({
  rows,
  totalBasis,
  selectedAccounts = [],
  symbolBreakdownMap,
  window: _window, // preserved to avoid upstream API churn
}: Props) {
  // Simple, human subtitle (replaces date-range display)
  const subtitle = "Net profit/loss by symbol across selected accounts.";

  // Normalize incoming rows and compute percentages against a sane basis
  const data = useMemo<RowDatum[]>(() => {
    const list = (rows ?? []).slice();

    // Default basis is “sum of absolute contributions” to avoid cancellation.
    let sumAbs = 0;
    for (let i = 0; i < list.length; i += 1) {
      sumAbs += Math.abs(Number(list[i]!.total) || 0);
    }
    if (sumAbs <= 0) sumAbs = 1;

    const basis =
      typeof totalBasis === "number" && totalBasis > 0 ? totalBasis : sumAbs;

    return list.map((r) => {
      const val = Number(r.total) || 0;
      const sign: RowDatum["sign"] = val > 0 ? "pos" : val < 0 ? "neg" : "zero";
      const totalPct = (val / basis) * 100;
      const fillFrac = Math.sqrt(Math.min(Math.abs(totalPct) / 100, 1)); // reserved

      return {
        id: r.label,
        label: r.label,
        value: val,
        fillFrac,
        totalPct,
        sign,
        accounts: r.accounts,
      };
    });
  }, [rows, totalBasis]);

  // Winners first (by absolute), then losers (most negative), zeros last
  const sorted = useMemo<RowDatum[]>(() => {
    const pos = data
      .filter((d) => d.sign === "pos")
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const neg = data
      .filter((d) => d.sign === "neg")
      .sort((a, b) => b.value - a.value);
    const zero = data.filter((d) => d.sign === "zero");
    return [...pos, ...neg, ...zero];
  }, [data]);

  // Totals + extremes
  const stats = useMemo<Stats>(() => {
    if (!sorted.length) return { sum: 0, max: null, min: null };
    let sum = 0;
    let max = sorted[0]!;
    let min = sorted[0]!;
    for (let i = 0; i < sorted.length; i += 1) {
      const d = sorted[i]!;
      sum += d.value;
      if (d.value > max.value) max = d;
      if (d.value < min.value) min = d;
    }
    return { sum, max, min };
  }, [sorted]);

  /* ------------------------------- helpers ------------------------------- */

  const safeNum = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? 0) || 0;

  type Entry = { k: string; v: number };

  function deriveEntriesForRow(d: RowDatum): Entry[] {
    if (d.accounts && Object.keys(d.accounts).length > 0) {
      if (selectedAccounts && selectedAccounts.length > 0) {
        return selectedAccounts.map((a) => ({
          k: a,
          v: safeNum(d.accounts![a]),
        }));
      }
      return Object.keys(d.accounts)
        .sort()
        .map((k) => ({ k, v: safeNum(d.accounts![k]) }));
    }
    const raw = symbolBreakdownMap?.[d.label];
    if (raw) {
      if (selectedAccounts && selectedAccounts.length > 0) {
        return selectedAccounts.map((a) => ({ k: a, v: safeNum(raw[a]) }));
      }
      return Object.keys(raw)
        .filter((k) => k.toLowerCase() !== "total")
        .sort()
        .map((k) => ({ k, v: safeNum(raw[k]) }));
    }
    return [];
  }

  function compositionBasis(d: RowDatum, entries: Entry[]): number {
    const sumSelected = entries.reduce((s, x) => s + x.v, 0);
    if (sumSelected !== 0) return sumSelected;
    const raw = symbolBreakdownMap?.[d.label];
    if (raw) {
      const totalLike = raw["TOTAL"] ?? raw["total"];
      const maybe = safeNum(totalLike);
      if (maybe !== 0) return maybe;
    }
    if (d.value !== 0) return d.value;
    return 1;
  }

  /* -------------------------------- render -------------------------------- */

  const RAIL = METRICS_COLORS.railBg;
  const FILL_OPACITY = 0.9;

  const Badge = ({
    swatch,
    icon,
    label,
    value,
  }: {
    swatch: string;
    icon: ReactNode;
    label: string;
    value: string;
  }) => (
    <span className="inline-flex items-center gap-2 rounded-[6px] border bg-card/60 px-2.5 py-1 text-xs">
      <span
        className="h-2.5 w-2.5 rounded-[3px]"
        style={{ backgroundColor: swatch }}
      />
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-2 sm:py-3 grid grid-rows-[auto_auto_auto] gap-2">
            <CardTitle className="leading-tight">Symbol Net PnL</CardTitle>
            {/* Replaced date range with a simple description */}
            <CardDescription className="text-sm leading-snug">
              {subtitle}
            </CardDescription>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                swatch="var(--muted-foreground)"
                icon={null}
                label="Total"
                value={usd(stats.sum)}
              />
              <Badge
                swatch="#22c55e"
                icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                label={`Highest • ${stats.max ? ` ${stats.max.label}` : ""}`}
                value={stats.max ? usd(stats.max.value) : "—"}
              />
              <Badge
                swatch="#ef4444"
                icon={<TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                label={`Lowest • ${stats.min ? ` ${stats.min.label}` : ""}`}
                value={stats.min ? usd(stats.min.value) : "—"}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <TooltipProvider delayDuration={100}>
        <CardContent className="pl-3 sm:pl-4 pr-3 sm:pr-4 pb-3 sm:pb-4">
          {sorted.length === 0 ? (
            <div className="text-sm text-muted-foreground px-4 py-8">
              No data.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {sorted.map((d) => {
                const isPos = d.sign === "pos";
                const valueCls =
                  d.sign === "pos"
                    ? "text-emerald-500"
                    : d.sign === "neg"
                      ? "text-red-500"
                      : "text-muted-foreground";

                // bar width uses share-of-activity basis
                const widthPct = Math.max(
                  Math.min(Math.abs(d.totalPct), 100),
                  d.value !== 0 ? BAR_MIN_PCT : 0
                );

                const entries = deriveEntriesForRow(d);
                const basis = compositionBasis(d, entries);

                return (
                  <Tooltip key={d.id}>
                    <TooltipTrigger asChild>
                      <li
                        data-role="row"
                        className="grid items-center gap-3 py-1.5"
                        style={{
                          gridTemplateColumns: `${LABEL_CH}ch minmax(0,1fr) ${LABEL_CH}ch`,
                        }}
                        aria-label={`${d.label} ${usd(d.value)} (${pct2(d.totalPct)})`}
                      >
                        {/* Left label — right-aligned */}
                        <div className="truncate text-xs sm:text-sm font-medium text-right">
                          {d.label}
                        </div>

                        {/* Bar track */}
                        <div
                          data-role="bartrack"
                          className="relative rounded-[2px] overflow-hidden"
                          style={{
                            background: RAIL,
                            height: `${RAIL_HEIGHT_PX}px`,
                          }}
                        >
                          {/* Zero line */}
                          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/50" />
                          {/* Positive fill */}
                          {isPos && (
                            <div
                              className="absolute inset-y-0 left-1/2 bg-emerald-500 rounded-r-[2px]"
                              style={{
                                width: `${widthPct}%`,
                                opacity: FILL_OPACITY,
                              }}
                            />
                          )}
                          {/* Negative fill */}
                          {d.sign === "neg" && (
                            <div
                              className="absolute inset-y-0 left-1/2 -translate-x-full bg-red-500 rounded-l-[2px]"
                              style={{
                                width: `${widthPct}%`,
                                opacity: FILL_OPACITY,
                              }}
                            />
                          )}
                        </div>

                        {/* Right value — left-aligned, fixed column width */}
                        <div
                          data-role="nums"
                          className="tabular-nums text-[11px] sm:text-xs text-left truncate"
                        >
                          <span className={valueCls}>{usd(d.value)}</span>
                        </div>
                      </li>
                    </TooltipTrigger>

                    {/* Tooltip shows exact numbers + composition split */}
                    <TooltipContent
                      align="end"
                      side="top"
                      className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
                    >
                      <div className="mb-1 font-semibold">{d.label}</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-muted-foreground">Value</span>
                        <span className={valueCls}>{usd(d.value)}</span>

                        <span className="text-muted-foreground">Total %</span>
                        <span className={valueCls}>{pct2(d.totalPct)}</span>

                        {entries.map(({ k, v }) => (
                          <AccountRow
                            key={k}
                            label={k}
                            value={v}
                            pct={(v / basis) * 100}
                          />
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </ul>
          )}
        </CardContent>
      </TooltipProvider>
    </Card>
  );
}

/* Split out for functional style & typing */
function AccountRow({
  label,
  value,
  pct,
}: {
  label: string;
  value: number;
  pct: number;
}) {
  const vCls =
    value > 0
      ? "text-emerald-500"
      : value < 0
        ? "text-red-500"
        : "text-muted-foreground";
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={vCls}>
        {usd(value)}{" "}
        <span className="text-muted-foreground">({pct2(pct)})</span>
      </span>
    </>
  );
}
