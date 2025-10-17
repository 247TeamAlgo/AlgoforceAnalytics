// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/ReturnChart.tsx
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

type Row = { label: "Realized" | "Margin"; value: number };

type Props = {
  /** Title above the chart; pass null to hide */
  title?: string | null;

  /** Show/hide the left row labels inside the chart */
  realizedLabel?: boolean;
  marginLabel?: boolean;

  realizedReturn: number;
  marginReturn: number;
  realizedBreakdown?: Record<string, number>;
  marginBreakdown?: Record<string, number>;
  selectedAccounts?: string[];
  containerWidth?: number;
  upnlReturn?: number;
  barHeight?: number;
  rowGap?: number;
  barColumnPadX?: number;
};

function pct4(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}

const POS_COLOR = "hsl(142 72% 45%)";
const NEG_COLOR = "hsl(0 72% 51%)";
const barColorFor = (value: number): string =>
  value >= 0 ? POS_COLOR : NEG_COLOR;

export function ReturnChart({
  title = "Return",
  realizedLabel = true,
  marginLabel = true,
  realizedReturn,
  marginReturn,
  realizedBreakdown,
  marginBreakdown,
  selectedAccounts,
  containerWidth,
  upnlReturn = 0,
  barHeight,
  rowGap,
  barColumnPadX = 10,
}: Props) {
  const UPNL_COLOR = METRICS_COLORS.upnl;

  const rows: Row[] = useMemo(
    () => [
      { label: "Realized", value: realizedReturn },
      { label: "Margin", value: marginReturn },
    ],
    [realizedReturn, marginReturn]
  );

  const maxAbs = Math.max(
    0,
    ...rows.map((r) => Math.abs(r.value)),
    Math.abs(upnlReturn)
  );
  const minSpan = 0.1;
  const bound = Math.max(minSpan, Math.ceil((maxAbs * 100) / 10) * 0.1);

  const guides: number[] = Array.from(
    { length: 7 },
    (_, i) => ((i - 3) / 3) * bound
  );

  const CW =
    typeof containerWidth === "number" && Number.isFinite(containerWidth)
      ? containerWidth
      : 640;

  const BAR_H = barHeight ?? Math.round(Math.min(32, Math.max(20, CW * 0.026)));
  const ROW_GAP = rowGap ?? Math.round(BAR_H * 0.55);
  const LABEL_ROW_H = 22;
  const GUIDE_DASH_PX = 1;
  const STACK_H = BAR_H * 2 + ROW_GAP;

  const RAIL_BG = METRICS_COLORS.railBg;
  const BOTTOM_EXT_PX = 12;

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
  const marginEntries = useMemo(
    () => normalizeEntries(marginBreakdown, selectedAccounts),
    [marginBreakdown, selectedAccounts]
  );

  const renderRow = (idx: 0 | 1, r: Row) => {
    const top = idx === 0 ? 0 : BAR_H + ROW_GAP;
    const isPos = r.value > 0;
    const isNeg = r.value < 0;
    const mag = Math.abs(r.value);
    const barColor = barColorFor(r.value);

    const isMargin = r.label === "Margin";
    const upPos = isMargin && upnlReturn > 0;
    const upNeg = isMargin && upnlReturn < 0;
    const upMag = Math.abs(upnlReturn);

    return (
      <>
        {/* rails split at center */}
        <div
          className="absolute left-0 z-10 rounded-[2px]"
          style={{ top, height: BAR_H, width: "50%", background: RAIL_BG }}
        />
        <div
          className="absolute right-0 z-10 rounded-[2px]"
          style={{ top, height: BAR_H, width: "50%", background: RAIL_BG }}
        />

        {/* negative leg (left) */}
        {isNeg && (
          <div
            className="absolute left-0 z-20 overflow-hidden rounded-[2px]"
            style={{ top, height: BAR_H, width: "50%" }}
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
            {isMargin && upNeg && (
              <SignedBar
                mode="one-negative"
                anchor="right"
                value={upMag}
                ghostValue={0}
                maxAbs={bound}
                height={BAR_H}
                valueThicknessPct={1}
                negColor={UPNL_COLOR}
                valueOpacity={0.78}
                trackClassName="rounded-[2px] pointer-events-none"
              />
            )}
          </div>
        )}

        {/* positive leg (right) */}
        {isPos && (
          <div
            className="absolute right-0 z-20 overflow-hidden rounded-[2px]"
            style={{ top, height: BAR_H, width: "50%" }}
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
            {isMargin && upPos && (
              <SignedBar
                mode="one-negative"
                anchor="left"
                value={upMag}
                ghostValue={0}
                maxAbs={bound}
                height={BAR_H}
                valueThicknessPct={1}
                negColor={UPNL_COLOR}
                valueOpacity={0.78}
                trackClassName="rounded-[2px] pointer-events-none"
              />
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="rounded-lg border bg-card/40 p-3 sm:p-4">
      {title ? (
        <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
          {title}
        </div>
      ) : null}

      <div
        className="grid"
        style={{ gridTemplateColumns: "auto 1fr auto", columnGap: 8 }}
      >
        {/* labels column */}
        <div
          className="flex flex-col justify-between"
          style={{ height: STACK_H }}
        >
          <div className="text-sm text-foreground flex items-center">
            {realizedLabel ? "Realized" : null}
          </div>
          <div className="text-sm text-foreground flex items-center">
            {marginLabel ? "Margin" : null}
          </div>
        </div>

        {/* chart column */}
        <div
          className="relative w-full min-w-0"
          style={{ height: STACK_H, padding: `0 ${barColumnPadX}px` }}
        >
          {/* dashed guides shared overlay */}
          <div
            className="pointer-events-none absolute z-[15]"
            style={{
              left: barColumnPadX,
              right: barColumnPadX,
              top: 0,
              bottom: -BOTTOM_EXT_PX,
            }}
            aria-hidden
          >
            {guides.map((g, i) => (
              <div
                key={`shared-g-${i}`}
                className="absolute inset-y-0 border-r border-dashed opacity-90"
                style={{
                  left: asLeftPct(g),
                  borderColor: "var(--muted-foreground)",
                  borderRightWidth: GUIDE_DASH_PX,
                }}
              />
            ))}
          </div>

          {/* bars */}
          {renderRow(0, rows[0] as Row)}
          {renderRow(1, rows[1] as Row)}

          {/* tooltips overlay */}
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
                <div className="mb-1 font-semibold">Realized Return</div>
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

            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="absolute left-0 right-0 z-[30] cursor-default"
                  style={{ top: BAR_H + ROW_GAP, height: BAR_H }}
                  aria-label="Margin return bar"
                />
              </TooltipTrigger>
              <TooltipContent
                align="end"
                side="top"
                className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
              >
                <div className="mb-1 font-semibold">Margin Return</div>
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
        </div>

        {/* values column */}
        <div
          className="flex flex-col justify-between"
          style={{ height: STACK_H }}
        >
          <div
            className={[
              "text-sm font-medium tabular-nums flex items-center",
              valueColorClass(rows[0]!.value),
            ].join(" ")}
          >
            {pct4(rows[0]!.value)}
          </div>
          <div
            className={[
              "text-sm font-medium tabular-nums flex items-center",
              valueColorClass(rows[1]!.value),
            ].join(" ")}
          >
            {pct4(rows[1]!.value)}
          </div>
        </div>

        {/* axis labels row */}
        <div />
        <div
          className="relative mt-1"
          style={{ height: LABEL_ROW_H, padding: `0 ${barColumnPadX}px` }}
        >
          {guides.map((g, i) => (
            <div
              key={`lbl-${i}`}
              className="absolute text-[11px] leading-none text-muted-foreground"
              style={{
                left: asLeftPct(g),
                transform: "translateX(-50%)",
                bottom: 0,
              }}
            >
              {Math.round(g * 100)}%
            </div>
          ))}
        </div>
        <div />
      </div>
    </div>
  );
}
