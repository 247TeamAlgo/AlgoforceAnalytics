// components/performance-metrics/symbol-pnl/NetPnlList.tsx
"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { Bucket, PercentMap } from "./types";

/** --- colors --- */
const POS = "#23ba7d";
const NEG = "#f6465d";
const TRAIL_POS = "rgba(35, 186, 125, 0.14)";
const TRAIL_NEG = "rgba(246, 70, 93, 0.14)";

/** --- helpers --- */
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function usd(v: number): string {
  const n = isNum(v) ? v : 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function pct(v: number): string {
  const n = isNum(v) ? v : 0;
  return `${n.toFixed(2)}%`;
}
function toneCls(v: number): string {
  if (!isNum(v) || v === 0) return "text-muted-foreground";
  return v > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}

type Props = {
  /** List of rows like: { label: "BTCUSDT", total: 123.45 } */
  rows: Bucket[];
  /** Optional per-symbol percentage. If omitted, a relative % (vs. max abs) is shown. */
  percentMap?: PercentMap;
  title?: string;
  description?: string;
};

export default function NetPnlList({
  rows,
  percentMap,
  title = "Symbol Net PnL",
  description = "Realized net per symbol",
}: Props) {
  /** sort by absolute pnl (desc) */
  const data = useMemo(() => {
    const r = (rows ?? []).slice();
    r.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    return r;
  }, [rows]);

  const stats = useMemo(() => {
    if (data.length === 0) {
      return { sum: 0, max: null as Bucket | null, min: null as Bucket | null };
    }
    let sum = 0;
    let max: Bucket = data[0]!;
    let min: Bucket = data[0]!;
    for (const d of data) {
      sum += d.total;
      if (d.total > max.total) max = d;
      if (d.total < min.total) min = d;
    }
    return { sum, max, min };
  }, [data]);

  /** symmetric scale: center (0) with 50% left / 50% right */
  const absMax = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, Math.abs(d.total));
    return Math.max(1, m);
  }, [data]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle>{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-0.5">
                {description}
              </CardDescription>
            ) : null}

            {/* Summary badges */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: "var(--muted-foreground)" }}
                />
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold text-foreground">
                  {usd(stats.sum)}
                </span>
              </span>

              {stats.max ? (
                <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{ backgroundColor: POS }}
                  />
                  <TrendingUp className="h-3.5 w-3.5" style={{ color: POS }} />
                  <span className="text-muted-foreground">
                    Highest {stats.max.label}
                  </span>
                  <span className="font-semibold text-foreground">
                    {usd(stats.max.total)}
                  </span>
                </span>
              ) : null}

              {stats.min ? (
                <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{ backgroundColor: NEG }}
                  />
                  <TrendingDown
                    className="h-3.5 w-3.5"
                    style={{ color: NEG }}
                  />
                  <span className="text-muted-foreground">
                    Lowest {stats.min.label}
                  </span>
                  <span className="font-semibold text-foreground">
                    {usd(stats.min.total)}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-4">
        {data.length === 0 ? (
          <div className="text-sm text-muted-foreground px-4 py-8">
            No data.
          </div>
        ) : (
          <div className="w-full">
            {/* list — scalable (no row cap); scroll comes from parent if constrained */}
            <div className="grid gap-2">
              {data.map((d) => {
                const v = d.total;
                const posPct = v > 0 ? (v / absMax) * 50 : 0; // 0..50
                const negPct = v < 0 ? (Math.abs(v) / absMax) * 50 : 0; // 0..50

                const shownPct = isNum(percentMap?.[d.label])
                  ? percentMap![d.label]!
                  : (v / absMax) * 100; // relative %

                return (
                  <div
                    key={d.label}
                    className="flex items-center gap-3 rounded-lg border bg-card/40 px-2.5 py-2"
                    title={d.label}
                  >
                    {/* label */}
                    <div className="w-[140px] shrink-0 truncate text-sm font-medium">
                      {d.label}
                    </div>

                    {/* micro bar (center zero) */}
                    <div className="relative h-3 w-full rounded-md">
                      {/* backdrop split */}
                      <div
                        className="absolute inset-0 rounded-md"
                        style={{
                          background: `linear-gradient(90deg, ${TRAIL_NEG} 0%, ${TRAIL_NEG} 50%, ${TRAIL_POS} 50%, ${TRAIL_POS} 100%)`,
                        }}
                      />
                      {/* dashed midline */}
                      <div
                        className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2"
                        style={{
                          width: 1,
                          background:
                            "repeating-linear-gradient(to bottom, var(--muted-foreground) 0 2px, transparent 2px 5px)",
                          opacity: 0.6,
                        }}
                      />
                      {/* negative fill (extends left from center) */}
                      {negPct > 0 ? (
                        <div
                          className="absolute top-0 bottom-0 right-1/2 rounded-l-md"
                          style={{
                            width: `${negPct}%`,
                            backgroundColor: NEG,
                            opacity: 0.9,
                          }}
                        />
                      ) : null}
                      {/* positive fill (extends right from center) */}
                      {posPct > 0 ? (
                        <div
                          className="absolute top-0 bottom-0 left-1/2 rounded-r-md"
                          style={{
                            width: `${posPct}%`,
                            backgroundColor: POS,
                            opacity: 0.9,
                          }}
                        />
                      ) : null}
                    </div>

                    {/* right numbers */}
                    <div className="ml-auto flex min-w-[160px] justify-end gap-3">
                      <span
                        className={`w-[70px] text-right tabular-nums font-semibold ${toneCls(
                          shownPct
                        )}`}
                        title="Percent (provided or relative)"
                      >
                        {pct(shownPct)}
                      </span>
                      <span
                        className={`w-[110px] text-right tabular-nums font-semibold ${toneCls(
                          v
                        )}`}
                        title="USD"
                      >
                        {usd(v)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
