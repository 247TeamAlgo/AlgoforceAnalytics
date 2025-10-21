// app/(analytics)/analytics/components/performance-metrics/combined-performance-mrics/DrawdownChart.tsx
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

export type DrawdownChartProps = {
  /** Title above the chart; pass null to hide */
  title?: string | null;

  /** Show/hide the left row labels inside the chart */
  realizedLabel?: boolean;
  marginLabel?: boolean;

  realizedDD: number;
  marginDD: number;

  realizedBreakdown?: Record<string, number>;
  marginBreakdown?: Record<string, number>;
  selectedAccounts?: string[];

  levels?: Level[];
  levelColors?: string[];
  upnlReturn?: number;
  barHeight?: number;
  rowGap?: number;
  barColumnPadX?: number;
  overshootPad?: number;
  barOpacity?: number;
};

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

export default function DrawdownChart({
  title = "Drawdown",
  realizedLabel = true,
  marginLabel = true,
  realizedDD,
  marginDD,
  realizedBreakdown,
  marginBreakdown,
  selectedAccounts,
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

  // === critical threshold ===
  const CRITICAL = 0.035; // 3.5%
  const EPS = 1e-12;
  const ALERT_RED = "#ef4444";

  const realizedBreach = realizedDD <= -CRITICAL;
  const marginBreach = marginDD <= -CRITICAL;

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

  // unified bar fill resolver so we can reuse for right labels
  const barFillColor = (value: number, base: string): string => {
    const absVal = Math.abs(value);
    const baseFill = resolveFill(absVal, base);
    return absVal + EPS >= CRITICAL ? ALERT_RED : baseFill;
  };

  const normalizeEntries = (
    map?: Record<string, number>,
    selected?: string[]
  ): Array<{ k: string; v: number }> => {
    if (!map) return [];
    const pairs = Object.entries(map).filter(
      ([k]) => k.toLowerCase() !== "total"
    );
    const keyByLower = new Map<string, string>();
    for (const [k] of pairs) keyByLower.set(k.toLowerCase(), k);

    const chosen =
      selected && selected.length
        ? Array.from(
            new Set(
              selected
                .map((a) => keyByLower.get(String(a).toLowerCase()))
                .filter(Boolean) as string[]
            )
          )
        : pairs.map(([k]) => k).sort();

    return chosen.map((k) => {
      const raw = map[k];
      const v =
        typeof raw === "number" && Number.isFinite(raw)
          ? raw
          : Number(raw ?? 0) || 0;
      return { k, v };
    });
  };

  const realizedEntries = useMemo(
    () => normalizeEntries(realizedBreakdown, selectedAccounts),
    [realizedBreakdown, selectedAccounts]
  );
  const marginEntries = useMemo(
    () => normalizeEntries(marginBreakdown, selectedAccounts),
    [marginBreakdown, selectedAccounts]
  );

  const renderRow = (r: RowSpec) => {
    const widthPct = `${(Math.abs(r.value) / maxAbs) * 100}%`;
    const fillColor = barFillColor(r.value, r.color);

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

  // precompute bar colors for right labels
  const realizedBarColor = barFillColor(realizedDD, REALIZED_COLOR);
  const marginBarColor = barFillColor(marginDD, MARGIN_COLOR);

  return (
    <div className="rounded-lg border bg-card/40 p-3 sm:p-4">
      {title ? (
        <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
          {title}
        </div>
      ) : null}

      <div
        className={["grid", GRID_COLS_CLS, COL_GAP_CLS, ROW_GAP_CLS].join(" ")}
      >
        {/* axis labels */}
        <div />
        <div
          className={["relative", AXIS_H_CLS, AXIS_MB_CLS, PAD_X_CLS].join(" ")}
        >
          {ticks.map((t, i) => {
            const lvlVal = typeof t.i === "number" ? levels[t.i]!.value : 0;
            const isCriticalLabel =
              typeof t.i === "number" && lvlVal + 1e-12 >= CRITICAL;
            const color = isCriticalLabel
              ? ALERT_RED
              : typeof t.i === "number"
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
          {/* -3.5% axis label always red */}
          <span
            className="absolute text-[11px] leading-none top-0"
            style={{ ...tickLabelStyle(CRITICAL), color: ALERT_RED }}
          >
            -3.5%
          </span>
        </div>
        <div />

        {/* Realized row */}
        <div className="text-sm text-foreground flex items-center">
          {realizedLabel ? "Realized" : null}
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
                {/* dashed guides overlay */}
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
                  {levels.map((l, i) => {
                    const color =
                      l.value + 1e-12 >= CRITICAL
                        ? ALERT_RED
                        : (hot[i] ?? METRICS_COLORS.guide);
                    return (
                      <div
                        key={`lvl-top-${i}`}
                        className="absolute inset-y-0 border-r border-dashed opacity-90"
                        style={{
                          left: leftPct(l.value),
                          borderColor: color,
                          borderRightWidth: 1,
                        }}
                      />
                    );
                  })}
                  <div
                    className="absolute inset-y-0 border-r border-dashed opacity-90"
                    style={{
                      left: leftPct(CRITICAL),
                      borderColor: ALERT_RED,
                      borderRightWidth: 1,
                    }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent
              align="end"
              side="top"
              className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
            >
              <div className="mb-1 font-semibold">Realized Drawdown</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {realizedEntries.map(({ k, v }) => (
                  <React.Fragment key={`real-${k}`}>
                    <span className="text-muted-foreground">{k}</span>
                    <span className={valueColorClass(v)}>{pct4(v)}</span>
                  </React.Fragment>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* Right value label follows bar color */}
        <div
          className={[
            "text-sm font-medium tabular-nums flex items-center",
          ].join(" ")}
          style={{ color: realizedBarColor }}
        >
          {pct4(realizedDD)}
        </div>

        {/* Margin row */}
        <div className="text-sm text-foreground flex items-center">
          {marginLabel ? "Margin" : null}
        </div>
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
                  {levels.map((l, i) => {
                    const color =
                      l.value + 1e-12 >= CRITICAL
                        ? ALERT_RED
                        : (hot[i] ?? METRICS_COLORS.guide);
                    return (
                      <div
                        key={`lvl-bot-${i}`}
                        className="absolute inset-y-0 border-r border-dashed opacity-90"
                        style={{
                          left: leftPct(l.value),
                          borderColor: color,
                          borderRightWidth: 1,
                        }}
                      />
                    );
                  })}
                  <div
                    className="absolute inset-y-0 border-r border-dashed opacity-90"
                    style={{
                      left: leftPct(CRITICAL),
                      borderColor: ALERT_RED,
                      borderRightWidth: 1,
                    }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent
              align="end"
              side="top"
              className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
            >
              <div className="mb-1 font-semibold">Margin Drawdown</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {marginEntries.map(({ k, v }) => (
                  <React.Fragment key={`marg-${k}`}>
                    <span className="text-muted-foreground">{k}</span>
                    <span className={valueColorClass(v)}>{pct4(v)}</span>
                  </React.Fragment>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* Right value label follows bar color */}
        <div
          className={[
            "text-sm font-medium tabular-nums flex items-center",
          ].join(" ")}
          style={{ color: marginBarColor }}
        >
          {pct4(marginDD)}
        </div>
      </div>
    </div>
  );
}
