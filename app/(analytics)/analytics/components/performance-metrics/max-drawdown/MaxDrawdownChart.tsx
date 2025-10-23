// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/MaxDrawdownChart.tsx
"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { METRICS_COLORS } from "../combined-performance-metrics/helpers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* --------------------------- extra props for header --------------------------- */

type WindowLike = { startDay?: string; endDay?: string } | undefined | null;

type Props = {
  /** payload.drawdown.margin.current.total (negative for DD) */
  value: number;

  /** kept for compatibility (no longer shown in tooltip) */
  breakdown?: Record<string, number>;

  /** kept for compatibility; badge removed */
  selectedAccounts?: string[];

  /** abs(payload.drawdown.margin.max.total) */
  maxRefAbs?: number;
  /** ignored for label rendering (we only draw the dashed line now) */
  maxRefLabel?: string;

  /** show the same date window label as other MTD widgets */
  window?: WindowLike;

  barHeight?: number;
  barColumnPadX?: number;
};

/* ------------------------------- formatters -------------------------------- */

const POS_COLOR = "hsl(142 72% 45%)";
const NEG_COLOR = "hsl(0 72% 51%)";
const ALERT_RED = "#ef4444";

/** 2-decimal percent formatter (as requested) */
function pct2(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export function MaxDrawdownChart({
  value,
  maxRefAbs = 0,
  /* maxRefLabel intentionally unused to avoid overlapping label */
  barHeight = 22,
  barColumnPadX = 10,
}: Props) {
  const RAIL_BG = METRICS_COLORS.railBg;

  const absV = Math.abs(value);
  const absMaxRef = Math.abs(maxRefAbs || 0);
  const EPS = 1e-9;

  // multiples of 2%
  const neededTop = Math.max(absV, absMaxRef, 0.06);
  const step = 0.02;
  const topRounded = Math.max(step, Math.ceil((neededTop + EPS) / step) * step);

  const maxAbs = absV >= topRounded ? absV * 1.06 : topRounded;

  const leftPctNum = (v: number) => Math.min(100, (Math.abs(v) / maxAbs) * 100);
  const leftPct = (v: number) => `${leftPctNum(v)}%`;
  const widthPct = `${(absV / maxAbs) * 100}%`;

  // ticks at -2%, -4%, ...
  const levels2 = (() => {
    const arr: Array<{ value: number; label: string }> = [];
    for (let x = step; x <= topRounded + EPS; x += step) {
      if (x / maxAbs >= 0.999) break;
      arr.push({
        value: Number(x.toFixed(6)),
        label: `-${Math.round(x * 100)}%`,
      });
    }
    return arr;
  })();

  const tickLabelStyle = (v: number): React.CSSProperties => {
    const p = leftPctNum(v);
    if (p <= 0.5) return { left: "0%", transform: "translateX(0)" };
    if (p >= 99.5) return { left: "100%", transform: "translateX(-100%)" };
    return { left: `${p}%`, transform: "translateX(-50%)" };
  };

  // state/colors
  const breached = absMaxRef > 0 && absV + EPS >= absMaxRef;
  const HEADER_COLOR = breached ? ALERT_RED : value < 0 ? NEG_COLOR : POS_COLOR;
  const BAR_COLOR = HEADER_COLOR;

  // show max ref if inside rail (dashed line only; no axis label text)
  const showMaxRef = absMaxRef > 0 && absMaxRef / maxAbs < 0.999;

  // layout
  const BAR_TOP = 16;
  const MAXREF_TOP = BAR_TOP - 6;
  const MAXREF_H = barHeight + 12;
  const PLOT_H = 70;
  const LABEL_H = 20;
  const LABEL_BOTTOM = 0;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-2 pb-3 sm:py-2">
          <CardTitle className="text-base">Current Drawdown</CardTitle>
          {/* Accounts badge removed */}
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4">
        {/* Header container (value pill) */}
        <div
          className="mb-2 flex items-center justify-between rounded-lg border bg-card px-3 py-2"
          style={{
            boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${HEADER_COLOR} 22%, transparent)`,
          }}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">Current</div>
          </div>
          <div
            className="text-2xl font-bold leading-none tracking-tight tabular-nums"
            style={{ color: HEADER_COLOR }}
            aria-label="Current combined margin drawdown"
          >
            {pct2(value)}
          </div>
        </div>

        {/* Chart */}
        <div
          className="relative w-full rounded-md border bg-card"
          style={{ height: PLOT_H }}
        >
          {/* rail */}
          <div
            className="absolute left-0 right-0"
            style={{
              top: BAR_TOP,
              height: barHeight,
              background: RAIL_BG,
              margin: `0 ${barColumnPadX}px`,
              borderRadius: 4,
            }}
          />
          {/* bar */}
          <div
            className="absolute left-0"
            style={{
              top: BAR_TOP,
              height: barHeight,
              marginLeft: barColumnPadX,
              width: widthPct,
              background: BAR_COLOR,
              opacity: 0.9,
              borderRadius: 4,
            }}
            aria-label="Current margin drawdown bar"
          />
          {/* guides */}
          <div
            className="pointer-events-none absolute inset-0 z-[15]"
            aria-hidden
          >
            <div
              className="absolute border-r border-dashed opacity-90"
              style={{
                top: BAR_TOP,
                height: barHeight,
                left: `calc(${leftPct(0)} + ${barColumnPadX}px)`,
                borderColor: METRICS_COLORS.guide,
                borderRightWidth: 1,
              }}
            />
            {levels2.map((l) => (
              <div
                key={`g-${l.value}`}
                className="absolute border-r border-dashed opacity-90"
                style={{
                  top: BAR_TOP,
                  height: barHeight,
                  left: `calc(${leftPct(l.value)} + ${barColumnPadX}px)`,
                  borderColor: METRICS_COLORS.guide,
                  borderRightWidth: 1,
                }}
              />
            ))}
            {showMaxRef && (
              <div
                className="absolute border-r border-dashed"
                style={{
                  top: MAXREF_TOP,
                  height: MAXREF_H,
                  left: `calc(${leftPct(absMaxRef)} + ${barColumnPadX}px)`,
                  borderColor: ALERT_RED,
                  borderRightWidth: 2,
                }}
              />
            )}
          </div>
          {/* x-axis labels (gray) */}
          <div
            className="absolute left-0 right-0 text-[11px] text-muted-foreground"
            style={{ bottom: LABEL_BOTTOM, height: LABEL_H }}
          >
            <span
              className="absolute"
              style={{
                ...tickLabelStyle(0),
                left: `calc(${leftPct(0)} + ${barColumnPadX}px)`,
              }}
            >
              0%
            </span>
            {levels2.map((l) => (
              <span
                key={`lbl-${l.value}`}
                className="absolute"
                style={{
                  ...tickLabelStyle(l.value),
                  left: `calc(${leftPct(l.value)} + ${barColumnPadX}px)`,
                }}
              >
                {l.label}
              </span>
            ))}
            {/* no label for dashed max ref */}
          </div>

          {/* tooltip: CURRENT & MAX (totals only) */}
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="absolute left-0 right-0 z-[30] cursor-default"
                  style={{ top: BAR_TOP, height: barHeight }}
                />
              </TooltipTrigger>
              <TooltipContent
                align="end"
                side="top"
                className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
              >
                <div className="mb-1 font-semibold">Margin Drawdown</div>
                <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">
                    Current (All Time)
                  </span>
                  <span
                    className={
                      value < 0
                        ? "text-red-500"
                        : value > 0
                          ? "text-emerald-500"
                          : "text-muted-foreground"
                    }
                  >
                    {pct2(value)}
                  </span>

                  <span className="text-muted-foreground">Max (All Time)</span>
                  <span className="text-red-500">
                    {absMaxRef > 0 ? `-${(absMaxRef * 100).toFixed(2)}%` : "—"}
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
