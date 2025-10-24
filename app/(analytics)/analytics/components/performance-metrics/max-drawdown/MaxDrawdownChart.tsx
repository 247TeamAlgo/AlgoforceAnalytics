// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/MaxDrawdownChart.tsx
"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { METRICS_COLORS } from "../combined-performance-metrics/helpers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type WindowLike = { startDay?: string; endDay?: string } | undefined | null;

type Props = {
  value: number; // negative for DD
  breakdown?: Record<string, number>;
  selectedAccounts?: string[];
  maxRefAbs?: number; // absolute all-time max DD
  maxRefLabel?: string;
  window?: WindowLike;
  barHeight?: number;
  barColumnPadX?: number;
  description?: string;
};

const POS = "hsl(142 72% 45%)";
const NEG = "hsl(0 72% 51%)";
const ALERT = "#ef4444";

function pct2(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export function MaxDrawdownChart({
  value,
  maxRefAbs = 0,
  barHeight = 22,
  barColumnPadX = 10,
  description = "Combined margin drawdown vs all-time max. Hover bar for more details.",
}: Props) {
  const RAIL_BG = METRICS_COLORS.railBg;
  const BORDER = "hsl(var(--border))";
  const FG = "hsl(var(--foreground))";

  const absV = Math.abs(value);
  const absMaxRef = Math.abs(maxRefAbs || 0);
  const EPS = 1e-9;

  // multiples of 2%
  const step = 0.02;
  const neededTop = Math.max(absV, absMaxRef, 0.06);
  const topRounded = Math.max(step, Math.ceil((neededTop + EPS) / step) * step);
  const maxAbs = absV >= topRounded ? absV * 1.06 : topRounded;

  const pctNum = (v: number) => Math.min(100, (Math.abs(v) / maxAbs) * 100);
  const pct = (v: number) => `${pctNum(v)}%`;
  const widthPct = `${(absV / maxAbs) * 100}%`;

  const ticks: Array<{ value: number; label: string }> = [];
  for (let x = step; x <= topRounded + EPS; x += step) {
    if (x / maxAbs >= 0.999) break;
    ticks.push({
      value: Number(x.toFixed(6)),
      label: `-${Math.round(x * 100)}%`,
    });
  }

  const PLOT_H = 84;
  const BAR_TOP = 16;
  const LABEL_H = 20;
  const LABEL_BOTTOM = 0;

  const labelInside = pctNum(absV) >= 10;
  const breached = absMaxRef > 0 && absV + EPS >= absMaxRef;

  const ACTIVE = value < 0 ? NEG : POS;
  const BAR_COLOR = breached ? ALERT : ACTIVE;
  const BAR_OPACITY = 0.6;
  const STROKE_COLOR = BORDER;

  const labelColor = labelInside ? "#ffffff" : FG;
  const labelStyle: React.CSSProperties = labelInside
    ? {
        // Tighter to bar end (was -10px)
        left: `calc(${pct(absV)} + ${barColumnPadX}px - 4px)`,
        transform: "translateX(-100%) translateY(-50%)",
        top: `calc(${BAR_TOP}px + ${barHeight / 2}px)`,
        color: labelColor,
        textShadow: "0 1px 0 rgba(0,0,0,.55)",
        zIndex: 40,
        position: "absolute",
        whiteSpace: "nowrap",
        fontWeight: 600,
      }
    : {
        // Closer when outside (was +8px)
        left: `calc(${pct(absV)} + ${barColumnPadX}px + 4px)`,
        transform: "translateY(-50%)",
        top: `calc(${BAR_TOP}px + ${barHeight / 2}px)`,
        color: labelColor,
        zIndex: 40,
        position: "absolute",
        whiteSpace: "nowrap",
        fontWeight: 600,
      };

  const showMaxRef = absMaxRef > 0 && absMaxRef / maxAbs < 0.999;
  const leftPx = (v: number) => `calc(${pct(v)} + ${barColumnPadX}px)`;

  const tickLabelStyle = (v: number): React.CSSProperties => {
    const p = pctNum(v);
    if (p <= 1) return { left: leftPx(v), transform: "translateX(0)" };
    if (p >= 99) return { left: leftPx(v), transform: "translateX(-100%)" };
    return { left: leftPx(v), transform: "translateX(-50%)" };
  };

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-2 pb-3 sm:py-2">
          <CardTitle className="text-base">Current Drawdown</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">
            {description}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 items-center justify-center mb-2">
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
              borderRadius: 6,
              boxShadow: `inset 0 0 0 1px ${BORDER}`,
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
              opacity: BAR_OPACITY,
              borderRadius: 6,
              boxShadow: `inset 0 0 0 1px ${STROKE_COLOR}`,
            }}
            aria-label="Current drawdown bar"
          />
          {/* end thumb (narrower so label can sit closer) */}
          <div
            className="absolute"
            style={{
              top: BAR_TOP - 2,
              height: barHeight + 4,
              width: 5, // was 6
              marginLeft: barColumnPadX,
              left: `calc(${pct(absV)} - 5px)`,
              background: "hsl(var(--card))",
              borderRadius: 6,
              boxShadow: `0 0 0 1px ${BORDER}`,
            }}
            aria-hidden
          />

          {/* value label */}
          <div
            className="tabular-nums text-sm leading-none"
            style={labelStyle}
            aria-label="Current drawdown value"
          >
            {pct2(value)}
          </div>

          {/* guides */}
          <div
            className="pointer-events-none absolute inset-0 z-[10]"
            aria-hidden
          >
            <div
              className="absolute border-r border-dashed opacity-90"
              style={{
                top: BAR_TOP,
                height: barHeight,
                left: leftPx(0),
                borderColor: METRICS_COLORS.guide,
                borderRightWidth: 1,
              }}
            />
            {ticks.map((t) => (
              <div
                key={`g-${t.value}`}
                className="absolute border-r border-dashed opacity-90"
                style={{
                  top: BAR_TOP,
                  height: barHeight,
                  left: leftPx(t.value),
                  borderColor: METRICS_COLORS.guide,
                  borderRightWidth: 1,
                }}
              />
            ))}
            {showMaxRef && (
              <div
                className="absolute border-r border-dashed"
                style={{
                  top: BAR_TOP - 8,
                  height: barHeight + 16,
                  left: leftPx(absMaxRef),
                  borderColor: ALERT,
                  borderRightWidth: 1,
                }}
              />
            )}
          </div>

          {/* x-axis labels */}
          <div
            className="absolute left-0 right-0 text-[11px] text-muted-foreground tabular-nums leading-none"
            style={{ bottom: LABEL_BOTTOM, height: LABEL_H }}
          >
            <span className="absolute" style={tickLabelStyle(0)}>
              0%
            </span>
            {ticks.map((t) => (
              <span
                key={`lbl-${t.value}`}
                className="absolute"
                style={tickLabelStyle(t.value)}
              >
                {t.label}
              </span>
            ))}
          </div>

          {/* tooltip */}
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
                <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 tabular-nums">
                  <span className="text-muted-foreground">Current</span>
                  <span className="text-foreground">{pct2(value)}</span>

                  <span className="text-muted-foreground">All-time Max</span>
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
