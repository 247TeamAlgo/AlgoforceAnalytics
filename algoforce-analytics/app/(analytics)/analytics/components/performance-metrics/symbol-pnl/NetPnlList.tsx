"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { Bucket } from "./types";

/* ---------- colors & formatters ---------- */
const POS = "#23ba7d";
const NEG = "#f6465d";

function usd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type RowDatum = {
  id: string;
  label: string;
  value: number;
  /** 0..100 relative to max abs across rows */
  fillPct: number;
  sign: "pos" | "neg" | "zero";
};

type Stats = { sum: number; max: RowDatum | null; min: RowDatum | null };

type Props = {
  rows: Bucket[]; // [{ label: string; total: number }]
};

export default function NetPnlList({ rows }: Props) {
  /* normalize + relative percentages */
  const data = useMemo<RowDatum[]>(() => {
    const list = (rows ?? []).slice();
    const maxAbs =
      list.reduce((m, r) => Math.max(m, Math.abs(Number(r.total) || 0)), 0) ||
      1;

    return list.map((r) => {
      const val = Number(r.total) || 0;
      const rel = Math.min(100, Math.max(0, (Math.abs(val) / maxAbs) * 100));
      return {
        id: r.label,
        label: r.label,
        value: val,
        fillPct: rel,
        sign: val > 0 ? "pos" : val < 0 ? "neg" : "zero",
      };
    });
  }, [rows]);

  /* sort: positives first (by % desc), then negatives/zeros (by % desc) */
  const sorted = useMemo<RowDatum[]>(() => {
    const pos  = data.filter(d => d.sign === "pos")
                    .sort((a, b) => b.fillPct - a.fillPct);
    const neg  = data.filter(d => d.sign === "neg")
                    .sort((a, b) => a.fillPct - b.fillPct); // reverse
    const zero = data.filter(d => d.sign === "zero");
    return [...pos, ...neg, ...zero];
  }, [data]);

  /* header stats */
  const stats = useMemo<Stats>(() => {
    if (!sorted.length) return { sum: 0, max: null, min: null };
    let sum = 0;
    let max = sorted[0]!;
    let min = sorted[0]!;
    let i = 0;
    for (i = 0; i < sorted.length; i += 1) {
      const d = sorted[i]!;
      sum += d.value;
      if (d.value > max.value) max = d;
      if (d.value < min.value) min = d;
    }
    return { sum, max, min };
  }, [sorted]);

  /* layout: place the numbers column so its LEFT edge sits right after the
     *right-most* bar end across rows. Also fix the numbers width to the
     largest measured row so they align perfectly. */
  const listRef = useRef<HTMLUListElement | null>(null);
  const [numsLeft, setNumsLeft] = useState<number>(280);
  const [numsWidth, setNumsWidth] = useState<number>(120);

  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return;

    const measure = (): void => {
      // 1) measure the numbers width (max across rows)
      const numNodes = root.querySelectorAll<HTMLDivElement>('[data-role="nums"]');
      let maxW = 0;
      numNodes.forEach((n) => {
        const w = n.getBoundingClientRect().width;
        if (w > maxW) maxW = w;
      });
      const fixedNumsWidth = Math.max(90, Math.min(260, Math.round(maxW)));

      // 2) measure a representative row and its bar track
      const row = root.querySelector<HTMLLIElement>('[data-role="row"]');
      const bar = row?.querySelector<HTMLDivElement>('[data-role="bartrack"]');
      if (!row || !bar) {
        setNumsWidth(fixedNumsWidth);
        return;
      }

      const rowRect = row.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      const barOffsetLeft = barRect.left - rowRect.left;
      const barWidth = barRect.width;

      // 3) find the *right-most* end among rows
      let maxRightFrac = 0.5;
      for (let i = 0; i < sorted.length; i += 1) {
        const d = sorted[i]!;
        const halfFill = Math.min(50, (d.fillPct * 0.5) / 100);
        const rightFrac =
          d.sign === "pos" ? 0.5 + halfFill : d.sign === "neg" ? 0.5 : 0.5;
        if (rightFrac > maxRightFrac) maxRightFrac = rightFrac;
      }

      // 4) place the numbers LEFT so they sit just after the farthest bar
      const GAP_PX = 8;
      const left = Math.round(barOffsetLeft + barWidth * maxRightFrac + GAP_PX);

      setNumsLeft(left);
      setNumsWidth(fixedNumsWidth);
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

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle>Symbol Net PnL</CardTitle>
            <CardDescription className="mt-0.5">
              Realized net per symbol
            </CardDescription>

            {/* header badges */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Total */}
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

              {/* Highest */}
              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: POS }}
                />
                <TrendingUp className="h-3.5 w-3.5" style={{ color: POS }} />
                <span className="text-muted-foreground">
                  {`Highest${stats.max ? ` ${stats.max.label}` : ""}`}
                </span>
                <span className="font-semibold text-foreground">
                  {stats.max ? usd(stats.max.value) : "—"}
                </span>
              </span>

              {/* Lowest */}
              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: NEG }}
                />
                <TrendingDown className="h-3.5 w-3.5" style={{ color: NEG }} />
                <span className="text-muted-foreground">
                  {`Lowest${stats.min ? ` ${stats.min.label}` : ""}`}
                </span>
                <span className="font-semibold text-foreground">
                  {stats.min ? usd(stats.min.value) : "—"}
                </span>
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4">
        {sorted.length === 0 ? (
          <div className="text-sm text-muted-foreground px-4 py-8">No data.</div>
        ) : (
          <ul ref={listRef} className="divide-y">
            {sorted.map((d) => {
              const isPos = d.sign === "pos";
              const valueCls =
                d.sign === "pos"
                  ? "text-emerald-500"
                  : d.sign === "neg"
                  ? "text-red-500"
                  : "text-muted-foreground";

              const halfFillPct = Math.min(50, (d.fillPct * 0.5) / 100) * 100; // 0..50 in %
              return (
                <li
                  key={d.id}
                  data-role="row"
                  className="relative flex items-center gap-3 py-1"
                  style={{ paddingRight: numsWidth + 12 }}
                >
                  {/* Label — right-aligned */}
                  <div className="w-[10.5ch] min-w-[7ch] truncate text-xs sm:text-sm font-medium text-right">
                    {d.label}
                  </div>

                  {/* Bar track (thicker) */}
                  <div
                    data-role="bartrack"
                    className="relative h-[10px] flex-1 rounded-full bg-foreground/10"
                  >
                    {isPos ? (
                      <div
                        className="absolute inset-y-0 left-1/2 rounded-r-full"
                        style={{ width: `${halfFillPct}%`, background: POS }}
                      />
                    ) : d.sign === "neg" ? (
                      <div
                        className="absolute inset-y-0 left-1/2 -translate-x-full rounded-l-full"
                        style={{ width: `${halfFillPct}%`, background: NEG }}
                      />
                    ) : null}
                  </div>

                  {/* Numbers — left-aligned */}
                  <div
                    data-role="nums"
                    className="absolute top-1/2 -translate-y-1/2 flex items-center justify-start gap-2 tabular-nums text-[11px] sm:text-xs text-left"
                    style={{ left: numsLeft, width: numsWidth }}
                  >
                    <span className={valueCls}>{d.fillPct.toFixed(2)}%</span>
                    <span className={valueCls}>{usd(d.value)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
