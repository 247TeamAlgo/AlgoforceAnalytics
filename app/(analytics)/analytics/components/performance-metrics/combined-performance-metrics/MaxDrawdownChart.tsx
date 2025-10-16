// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/MaxDrawdownChart.tsx
"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SignedBar from "./SignedBar";
import { METRICS_COLORS } from "./helpers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  realizedReturn: number;
  marginReturn?: number;
  realizedBreakdown?: Record<string, number>;
  marginBreakdown?: Record<string, number>;
  selectedAccounts?: string[];
  containerWidth?: number;
  upnlReturn?: number;
  barHeight?: number;
  rowGap?: number;
  barColumnPadX?: number;
};

function pct2(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

/* Accent color used by the Combined tile (match RegularReturns) */
const VALUE_COLOR = METRICS_COLORS.margin;

/* Chart bar polarity colors */
const POS_COLOR = "hsl(142 72% 45%)";
const NEG_COLOR = "hsl(0 72% 51%)";
const barColorFor = (v: number): string => (v >= 0 ? POS_COLOR : NEG_COLOR);

export function MaxDrawdownChart({
  realizedReturn,
  realizedBreakdown,
  selectedAccounts,
  containerWidth,
  barHeight,
  barColumnPadX = 10,
}: Props) {
  const RAIL_BG = METRICS_COLORS.railBg;

  // layout (bar close to x-axis labels)
  const CW =
    typeof containerWidth === "number" && Number.isFinite(containerWidth)
      ? containerWidth
      : 640;
  const BAR_H = barHeight ?? Math.round(Math.min(30, Math.max(18, CW * 0.024)));
  const GUIDE_GAP_PX = 3;
  const GUIDE_ZONE_H = 6;
  const LABEL_ROW_H = 18;

  const GUIDE_FULL_H = BAR_H + GUIDE_GAP_PX + GUIDE_ZONE_H;
  const STACK_H = BAR_H + GUIDE_GAP_PX + GUIDE_ZONE_H + LABEL_ROW_H;

  // scale & guides
  const maxAbs = Math.max(0, Math.abs(realizedReturn));
  const minSpan = 0.1;
  const bound = Math.max(minSpan, Math.ceil((maxAbs * 100) / 10) * 0.1);

  const guides: number[] = Array.from(
    { length: 7 },
    (_, i) => ((i - 3) / 3) * bound
  );
  const asLeftPct = (v: number): string =>
    `${((v + bound) / (2 * bound)) * 100}%`;

  const valueColorClass = (v: number): string =>
    v > 0
      ? "text-emerald-500"
      : v < 0
        ? "text-red-500"
        : "text-muted-foreground";

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

  // bar
  const renderRealizedRow = (): React.ReactNode => {
    const v = realizedReturn;
    const isPos = v > 0;
    const isNeg = v < 0;
    const mag = Math.abs(v);
    const barColor = barColorFor(v);

    return (
      <>
        {/* rails */}
        <div
          className="absolute left-0 z-10 rounded-[2px]"
          style={{ top: 0, height: BAR_H, width: "50%", background: RAIL_BG }}
        />
        <div
          className="absolute right-0 z-10 rounded-[2px]"
          style={{ top: 0, height: BAR_H, width: "50%", background: RAIL_BG }}
        />

        {/* negative leg */}
        {isNeg && (
          <div
            className="absolute left-0 z-20 overflow-hidden rounded-[2px]"
            style={{ top: 0, height: BAR_H, width: "50%" }}
          >
            <SignedBar
              mode="one-negative"
              anchor="right"
              value={mag}
              ghostValue={0}
              maxAbs={bound}
              height={BAR_H}
              valueThicknessPct={1}
              negColor={barColor}
              valueOpacity={0.9}
              trackClassName="rounded-[2px]"
            />
          </div>
        )}

        {/* positive leg */}
        {isPos && (
          <div
            className="absolute right-0 z-20 overflow-hidden rounded-[2px]"
            style={{ top: 0, height: BAR_H, width: "50%" }}
          >
            <SignedBar
              mode="one-negative"
              anchor="left"
              value={mag}
              ghostValue={0}
              maxAbs={bound}
              height={BAR_H}
              valueThicknessPct={1}
              negColor={barColor}
              valueOpacity={0.9}
              trackClassName="rounded-[2px]"
            />
          </div>
        )}
      </>
    );
  };

  return (
    <Card className="py-0">
      {/* Header matches RegularReturns (no range/dropdown) */}
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-2 pb-3 sm:py-2">
          <CardTitle className="text-base">Max Drawdown (IUD)</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        {/* Combined tile (copy of RegularReturns look) */}
        <ul className="space-y-2">
          <li
            className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
            style={{
              boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${VALUE_COLOR} 22%, transparent)`,
            }}
            title="Combined"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">Combined</div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-2xl font-bold leading-none tracking-tight tabular-nums"
                style={{ color: VALUE_COLOR }}
              >
                {pct2(realizedReturn)}
              </span>
            </div>
          </li>
        </ul>

        {/* Chart (bar + dashed guides over the bar) */}
        <div
          className="relative mt-3 w-full min-w-0"
          style={{ height: STACK_H, padding: `0 ${barColumnPadX}px` }}
        >
          {/* bar */}
          {renderRealizedRow()}

          {/* tooltip */}
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="absolute left-0 right-0 z-[30] cursor-default"
                  style={{ top: 0, height: BAR_H }}
                  aria-label="Max drawdown bar"
                />
              </TooltipTrigger>
              <TooltipContent
                align="end"
                side="top"
                className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
              >
                <div className="mb-1 font-semibold">Max Drawdown</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {realizedEntries.map(({ k, v }) => (
                    <React.Fragment key={`real-${k}`}>
                      <span className="text-muted-foreground">{k}</span>
                      <span className={valueColorClass(v)}>{pct2(v)}</span>
                    </React.Fragment>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* dashed guides on top */}
          <div
            className="pointer-events-none absolute z-[25]"
            style={{
              left: barColumnPadX,
              right: barColumnPadX,
              top: 0,
              height: GUIDE_FULL_H,
            }}
            aria-hidden
          >
            {guides.map((g, i) => (
              <div
                key={`tick-${i}`}
                className="absolute inset-y-0 border-r border-dashed opacity-90"
                style={{
                  left: asLeftPct(g),
                  borderColor: "var(--muted-foreground)",
                  borderRightWidth: 1,
                }}
              />
            ))}
          </div>

          {/* x-axis labels (kept as integers for readability) */}
          <div
            className="absolute left-0 right-0"
            style={{
              top: BAR_H + GUIDE_GAP_PX + GUIDE_ZONE_H,
              height: LABEL_ROW_H,
              padding: `0 ${barColumnPadX}px`,
            }}
          >
            {guides.map((g, i) => (
              <div
                key={`lbl-${i}`}
                className="absolute text-[11px] leading-none text-muted-foreground"
                style={{
                  left: asLeftPct(g),
                  transform: "translateX(-50%)",
                  top: 2,
                }}
              >
                {Math.round(g * 100)}%
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
