// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/DrawdownChart.tsx
"use client";

import React, { CSSProperties, useMemo } from "react";
import {
  REALIZED_COLOR,
  MARGIN_COLOR,
  METRICS_COLORS,
  makeDrawdownLevelColors,
} from "./helpers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Level = { value: number; label?: string };
type RowSpec = { label: string; color: string; value: number };
type Tick = { v: number; label: string; i?: number };

function pct4(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}
function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function hClass(px: number): string {
  if (px <= 18) return "h-[18px]";
  if (px <= 20) return "h-5";
  if (px <= 24) return "h-6";
  if (px <= 28) return "h-7";
  if (px <= 32) return "h-8";
  if (px <= 36) return "h-9";
  return "h-10";
}
function rowGapClass(px: number): string {
  if (px <= 10) return "gap-y-2.5";
  if (px <= 12) return "gap-y-3";
  if (px <= 14) return "gap-y-3.5";
  if (px <= 16) return "gap-y-4";
  return "gap-y-5";
}

export type DrawdownChartProps = {
  realizedDD: number;
  marginDD: number;
  levels?: Level[];
  levelColors?: string[];
  barHeight?: number;
  rowGap?: number;
  barColumnPadX?: number;
  overshootPad?: number;
  barOpacity?: number;
};

export default function DrawdownChart({
  realizedDD,
  marginDD,
  levels = [
    { value: 0.01, label: "-1%" },
    { value: 0.02, label: "-2%" },
    { value: 0.03, label: "-3%" },
    { value: 0.04, label: "-4%" },
    { value: 0.05, label: "-5%" },
    { value: 0.06, label: "-6%" },
  ],
  levelColors,
  barHeight = 20,
  rowGap = 14,
  barColumnPadX = 10,
  overshootPad = 1.06,
  barOpacity = 0.78,
}: DrawdownChartProps) {
  const maxLevel = levels.length
    ? Math.max(...levels.map((l) => l.value))
    : 0.06;
  const maxSeriesAbs = Math.max(Math.abs(realizedDD), Math.abs(marginDD), 1e-9);
  const crossedTop = maxSeriesAbs >= maxLevel - 1e-12;
  const maxAbs =
    (crossedTop ? overshootPad : 1) * Math.max(maxSeriesAbs, maxLevel);

  const hot =
    levelColors && levelColors.length === levels.length
      ? levelColors
      : makeDrawdownLevelColors(levels.length);

  const BAR_H_CLS = hClass(barHeight);
  const ROW_GAP_CLS = rowGapClass(rowGap);
  const PAD_X_CLS =
    barColumnPadX <= 8
      ? "px-2"
      : barColumnPadX <= 10
        ? "px-2.5"
        : barColumnPadX <= 12
          ? "px-3"
          : "px-4";

  const AXIS_H_CLS = "h-3.5";
  const AXIS_MB_CLS = "mb-0.5";
  const GRID_COLS_CLS = "grid-cols-[auto_1fr_auto]";
  const COL_GAP_CLS = "gap-x-2.5";

  const ticks: Tick[] = [{ v: 0, label: "0%" }].concat(
    levels.map((l, i) => ({
      v: l.value,
      label: l.label ?? `-${Math.round(l.value * 100)}%`,
      i,
    }))
  );

  const leftPct = (v: number): string => `${clamp01(v / maxAbs) * 100}%`;

  const tickLabelStyle = (v: number): CSSProperties => {
    const p = clamp01(v / maxAbs) * 100;
    if (p <= 0.5) return { left: "0%", transform: "translateX(0)" };
    if (p >= 99.5) return { left: "100%", transform: "translateX(-100%)" };
    return { left: `${p}%`, transform: "translateX(-50%)" };
  };

  const valueColorClass = (v: number): string =>
    v < 0
      ? "text-red-500"
      : v > 0
        ? "text-emerald-500"
        : "text-muted-foreground";

  const TOP_EXT_PX = 12;

  const resolveFill = (absVal: number, base: string): string => {
    let c = base;
    for (let i = 0; i < levels.length; i += 1) {
      if (absVal >= levels[i]!.value) c = hot[i] ?? c;
    }
    return c;
  };

  const realizedFill = resolveFill(Math.abs(realizedDD), REALIZED_COLOR);
  const marginFill = resolveFill(Math.abs(marginDD), MARGIN_COLOR);

  const renderRow = (r: RowSpec) => {
    const absVal = Math.abs(r.value);
    const widthPct = `${(absVal / maxAbs) * 100}%`;
    const fillColor = resolveFill(absVal, r.color);

    return (
      <>
        <div
          className={["relative w-full rounded-[2px]", BAR_H_CLS].join(" ")}
          style={{ background: METRICS_COLORS.railBg }}
        />
        <div
          className={["absolute left-0 top-0 rounded-[2px]", BAR_H_CLS].join(
            " "
          )}
          style={{
            width: widthPct,
            backgroundColor: fillColor,
            opacity: barOpacity,
          }}
          aria-label={`${r.label} drawdown bar`}
        />
      </>
    );
  };

  return (
    <div className="rounded-xl border bg-card/40 p-4 sm:p-5">
      <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
        Drawdown (MTD)
      </div>

      <div
        className={["grid", GRID_COLS_CLS, COL_GAP_CLS, ROW_GAP_CLS].join(" ")}
      >
        {/* axis labels */}
        <div />
        <div
          className={["relative", AXIS_H_CLS, AXIS_MB_CLS, PAD_X_CLS].join(" ")}
        >
          {ticks.map((t, i) => {
            const color =
              typeof t.i === "number"
                ? (hot[t.i] ?? METRICS_COLORS.guide)
                : METRICS_COLORS.guide;
            return (
              <span
                key={`tick-${i}-${t.label}`}
                className="absolute text-[11px] leading-none top-0"
                style={{ ...tickLabelStyle(t.v), color }}
              >
                {t.label}
              </span>
            );
          })}
        </div>
        <div />

        {/* Realized row */}
        <div className="text-sm text-foreground flex items-center">
          Realized
        </div>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative w-full min-w-0 cursor-default">
                {renderRow({
                  label: "Realized",
                  color: REALIZED_COLOR,
                  value: realizedDD,
                })}
                {/* shared dashed guides overlay */}
                <div
                  className="pointer-events-none absolute z-[15]"
                  style={{
                    left: 0,
                    right: 0,
                    top: `-${TOP_EXT_PX}px`,
                    bottom: 0,
                  }}
                  aria-hidden
                >
                  <div
                    className="absolute inset-y-0 border-r border-dashed opacity-90"
                    style={{
                      left: leftPct(0),
                      borderColor: METRICS_COLORS.guide,
                      borderRightWidth: 1,
                    }}
                  />
                  {levels.map((l, i) => (
                    <div
                      key={`lvl-top-${i}`}
                      className="absolute inset-y-0 border-r border-dashed opacity-90"
                      style={{
                        left: leftPct(l.value),
                        borderColor: hot[i] ?? METRICS_COLORS.guide,
                        borderRightWidth: 1,
                      }}
                    />
                  ))}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent
              align="end"
              side="top"
              className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
            >
              <div className="mb-1 font-semibold">Realized</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Drawdown</span>
                <span className="font-medium" style={{ color: realizedFill }}>
                  {pct4(realizedDD)}
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div
          className={[
            "text-sm font-medium tabular-nums text-foreground flex items-center",
            valueColorClass(realizedDD),
          ].join(" ")}
        >
          {pct4(realizedDD)}
        </div>

        {/* Margin row */}
        <div className="text-sm text-foreground flex items-center">Margin</div>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative w-full min-w-0 cursor-default">
                {renderRow({
                  label: "Margin",
                  color: MARGIN_COLOR,
                  value: marginDD,
                })}
                <div
                  className="pointer-events-none absolute inset-0 z-[15]"
                  aria-hidden
                >
                  <div
                    className="absolute inset-y-0 border-r border-dashed opacity-90"
                    style={{
                      left: leftPct(0),
                      borderColor: METRICS_COLORS.guide,
                      borderRightWidth: 1,
                    }}
                  />
                  {levels.map((l, i) => (
                    <div
                      key={`lvl-bot-${i}`}
                      className="absolute inset-y-0 border-r border-dashed opacity-90"
                      style={{
                        left: leftPct(l.value),
                        borderColor: hot[i] ?? METRICS_COLORS.guide,
                        borderRightWidth: 1,
                      }}
                    />
                  ))}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent
              align="end"
              side="top"
              className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
            >
              <div className="mb-1 font-semibold">Margin</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Drawdown</span>
                <span className="font-medium" style={{ color: marginFill }}>
                  {pct4(marginDD)}
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div
          className={[
            "text-sm font-medium tabular-nums text-foreground flex items-center",
            valueColorClass(marginDD),
          ].join(" ")}
        >
          {pct4(marginDD)}
        </div>
      </div>
    </div>
  );
}
