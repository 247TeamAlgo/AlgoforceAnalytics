// app/(analytics)/analytics/components/performance-metrics/symbol-net/NetPnlList.tsx
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
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Bucket } from "./types";
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
  fillFrac: number; // kept for dynamic range softening if needed elsewhere
  totalPct: number; // signed % of basis
  sign: "pos" | "neg" | "zero";
  accounts?: Record<string, number>;
};

type Stats = { sum: number; max: RowDatum | null; min: RowDatum | null };

type Props = {
  rows: Bucket[]; // [{ label, total, accounts? }]
  /** Basis for Total % (e.g., startBal or live total). Falls back to sum(|PnL|) if absent. */
  totalBasis?: number;
};

/* ------------------------------ component ------------------------------ */

export default function NetPnlList({ rows, totalBasis }: Props) {
  const data = useMemo<RowDatum[]>(() => {
    const list = (rows ?? []).slice();

    // fallback denominators when no basis is provided
    let sumAbs = 0;
    let maxAbs = 0;
    for (let i = 0; i < list.length; i += 1) {
      const v = Math.abs(Number(list[i]!.total) || 0);
      sumAbs += v;
      if (v > maxAbs) maxAbs = v;
    }
    if (sumAbs <= 0) sumAbs = 1;
    if (maxAbs <= 0) maxAbs = 1;

    const basis =
      typeof totalBasis === "number" && totalBasis > 0 ? totalBasis : sumAbs;

    return list.map((r) => {
      const val = Number(r.total) || 0;
      const sign: RowDatum["sign"] = val > 0 ? "pos" : val < 0 ? "neg" : "zero";

      const totalPct = (val / basis) * 100;
      // keep sqrt softening available (not used for width anymore, only if needed later)
      const fillLinear = Math.min(Math.abs(totalPct) / 100, 1);
      const fillFrac = Math.sqrt(fillLinear);

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

  const sorted = useMemo<RowDatum[]>(() => {
    const pos = data
      .filter((d) => d.sign === "pos")
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const neg = data
      .filter((d) => d.sign === "neg")
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const zero = data.filter((d) => d.sign === "zero");
    return [...pos, ...neg, ...zero];
  }, [data]);

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

  // fixed right column (outside bars)
  const listRef = useRef<HTMLUListElement | null>(null);
  const [numsWidth, setNumsWidth] = useState<number>(132);

  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return;

    const measure = (): void => {
      const numNodes =
        root.querySelectorAll<HTMLDivElement>('[data-role="nums"]');
      let maxW = 0;
      numNodes.forEach((n) => {
        const w = n.getBoundingClientRect().width;
        if (w > maxW) maxW = w;
      });
      const fixed = Math.max(110, Math.min(220, Math.round(maxW)));
      setNumsWidth(fixed);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const onResize = (): void => measure();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [sorted]);

  /* ------------------------------- render ------------------------------- */

  const RAIL = METRICS_COLORS.railBg;
  const FILL_OPACITY = 0.9;

  const Badge = ({
    swatch,
    icon,
    label,
    value,
  }: {
    swatch: string;
    icon: React.ReactNode;
    label: string;
    value: string;
  }) => (
    <span className="inline-flex items-center gap-2 rounded-md border bg-card/60 px-2.5 py-1 text-xs">
      <span
        className="h-2.5 w-2.5 rounded-[1px]"
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
            <CardDescription className="text-sm leading-snug">
              Realized net per symbol
            </CardDescription>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                swatch="var(--muted-foreground)"
                icon={undefined}
                label="Total"
                value={usd(stats.sum)}
              />
              <Badge
                swatch="#22c55e" // emerald-500
                icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                label={`Highest${stats.max ? ` ${stats.max.label}` : ""}`}
                value={stats.max ? usd(stats.max.value) : "—"}
              />
              <Badge
                swatch="#ef4444" // red-500
                icon={<TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                label={`Lowest${stats.min ? ` ${stats.min.label}` : ""}`}
                value={stats.min ? usd(stats.min.value) : "—"}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <TooltipProvider delayDuration={100}>
        <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4">
          {sorted.length === 0 ? (
            <div className="text-sm text-muted-foreground px-4 py-8">
              No data.
            </div>
          ) : (
            <ul ref={listRef} className="divide-y divide-border/60">
              {sorted.map((d) => {
                const isPos = d.sign === "pos";
                const valueCls =
                  d.sign === "pos"
                    ? "text-emerald-500"
                    : d.sign === "neg"
                      ? "text-red-500"
                      : "text-muted-foreground";

                // HARD CAP at 100% of the whole track. This guarantees no overshoot.
                const widthPct = Math.min(Math.abs(d.totalPct), 100);

                const accounts = d.accounts ?? {};
                const acctEntries = Object.keys(accounts)
                  .sort()
                  .map((k) => ({ k, v: Number(accounts[k] || 0) }));

                return (
                  <Tooltip key={d.id}>
                    <TooltipTrigger asChild>
                      <li
                        data-role="row"
                        className="relative flex items-center gap-3 py-1.5"
                        style={{ paddingRight: numsWidth + 12 }}
                        aria-label={`${d.label} ${usd(d.value)} (${pct2(d.totalPct)})`}
                      >
                        {/* Label — right-aligned */}
                        <div className="w-[10.5ch] min-w-[7ch] truncate text-xs sm:text-sm font-medium text-right">
                          {d.label}
                        </div>

                        {/* Bar track (neutral rail) with clipping to enforce 100% max */}
                        <div
                          data-role="bartrack"
                          className="relative h-[20px] flex-1 rounded-[2px] overflow-hidden"
                          style={{ background: RAIL }}
                        >
                          {/* center seam */}
                          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/50" />

                          {/* Positive leg (right from center) */}
                          {isPos && (
                            <div
                              className={`absolute inset-y-0 left-1/2 bg-emerald-500 rounded-r-[2px]`}
                              style={{
                                width: `${widthPct}%`,
                                opacity: FILL_OPACITY,
                              }}
                            />
                          )}

                          {/* Negative leg (left from center) */}
                          {d.sign === "neg" && (
                            <div
                              className={`absolute inset-y-0 left-1/2 -translate-x-full bg-red-500 rounded-l-[2px]`}
                              style={{
                                width: `${widthPct}%`,
                                opacity: FILL_OPACITY,
                              }}
                            />
                          )}
                        </div>

                        {/* Numbers — fixed right column (outside bars), tinted green/red */}
                        <div
                          data-role="nums"
                          className="absolute top-1/2 right-2 -translate-y-1/2 flex items-center justify-end gap-2 tabular-nums text-[11px] sm:text-xs text-right"
                          style={{ width: numsWidth }}
                        >
                          <span className={valueCls}>{pct2(d.totalPct)}</span>
                          <span className={valueCls}>{usd(d.value)}</span>
                        </div>
                      </li>
                    </TooltipTrigger>

                    {/* Tooltip — shadcn surface, values tinted by sign */}
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

                        {acctEntries.map(({ k, v }) => (
                          <FragmentRow key={k} k={k} v={v} />
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
function FragmentRow({ k, v }: { k: string; v: number }) {
  const cls =
    v > 0
      ? "text-emerald-500"
      : v < 0
        ? "text-red-500"
        : "text-muted-foreground";
  return (
    <>
      <span className="text-muted-foreground">{k}</span>
      <span className={cls}>{usd(v)}</span>
    </>
  );
}
