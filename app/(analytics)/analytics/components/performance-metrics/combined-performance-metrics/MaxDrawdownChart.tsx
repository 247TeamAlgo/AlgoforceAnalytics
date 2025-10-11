// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/MaxDrawdownChart.tsx
"use client";

import React, { useMemo } from "react";
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
  // kept for API compatibility, not used:
  marginReturn?: number;
  realizedBreakdown?: Record<string, number>;
  marginBreakdown?: Record<string, number>;
  selectedAccounts?: string[];
  containerWidth?: number;
  upnlReturn?: number; // not used in this single-row variant
  barHeight?: number;
  rowGap?: number; // not used, preserved for compatibility
  barColumnPadX?: number;
};

function pct4(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}

/* Fixed colors: positive → green (emerald-500), negative → red (red-500) */
const POS_COLOR = "hsl(142 72% 45%)";
const NEG_COLOR = "hsl(0 72% 51%)";
const barColorFor = (value: number): string =>
  value >= 0 ? POS_COLOR : NEG_COLOR;

export function MaxDrawdownChart({
  realizedReturn,
  realizedBreakdown,
  selectedAccounts,
  containerWidth,
  barHeight,
  barColumnPadX = 10,
}: Props) {
  const RAIL_BG = METRICS_COLORS.railBg;

  // ---- layout metrics (single-row) ----
  const CW =
    typeof containerWidth === "number" && Number.isFinite(containerWidth)
      ? containerWidth
      : 640;

  const BAR_H = barHeight ?? Math.round(Math.min(32, Math.max(20, CW * 0.026)));

  // Tight ticks + labels right below the bar
  const GUIDE_GAP_PX = 6; // gap between bar bottom and dashed tick zone
  const GUIDE_ZONE_H = 8; // height for vertical dashed ticks
  const LABEL_ROW_H = 18; // compact labels
  const GUIDE_FULL_H = BAR_H + GUIDE_GAP_PX + GUIDE_ZONE_H; // span from bar top down
  const STACK_H = BAR_H + GUIDE_GAP_PX + GUIDE_ZONE_H + LABEL_ROW_H;

  // ---- scale & guides ----
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

  // ---- single row renderer (Realized only) ----
  const renderRealizedRow = (): React.ReactNode => {
    const v = realizedReturn;
    const isPos = v > 0;
    const isNeg = v < 0;
    const mag = Math.abs(v);
    const barColor = barColorFor(v);

    return (
      <>
        {/* rails split at center */}
        <div
          className="absolute left-0 z-10 rounded-[2px]"
          style={{ top: 0, height: BAR_H, width: "50%", background: RAIL_BG }}
        />
        <div
          className="absolute right-0 z-10 rounded-[2px]"
          style={{ top: 0, height: BAR_H, width: "50%", background: RAIL_BG }}
        />

        {/* negative leg (left) */}
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

        {/* positive leg (right) */}
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
    <div className="rounded-xl border bg-card/40 p-4 sm:p-5">
      <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
        Max Drawdown (Initial UI Draft)
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "auto 1fr auto", columnGap: 10 }}
      >
        {/* labels column */}
        <div
          className="flex flex-col justify-start"
          style={{ height: STACK_H }}
        >
          <div
            className="text-sm text-foreground flex items-center"
            style={{ height: BAR_H }}
          >
            Max DD
          </div>
        </div>

        {/* chart column */}
        <div
          className="relative w-full min-w-0"
          style={{ height: STACK_H, padding: `0 ${barColumnPadX}px` }}
        >
          {/* Realized bar */}
          {renderRealizedRow()}

          {/* tooltips overlay (Realized) */}
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="absolute left-0 right-0 z-[30] cursor-default"
                  style={{ top: 0, height: BAR_H }}
                  aria-label="Realized return bar"
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
                      <span className={valueColorClass(v)}>{pct4(v)}</span>
                    </React.Fragment>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* dashed guide ticks span from bar top down through the tick zone */}
          <div
            className="pointer-events-none absolute z-[15]"
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

          {/* percentage labels tightly below the dashed ticks */}
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

        {/* values column */}
        <div
          className="flex flex-col justify-start"
          style={{ height: STACK_H }}
        >
          <div
            className={[
              "text-sm font-medium tabular-nums flex items-center",
              valueColorClass(realizedReturn),
            ].join(" ")}
            style={{ height: BAR_H }}
          >
            {pct4(realizedReturn)}
          </div>
        </div>
      </div>
    </div>
  );
}
