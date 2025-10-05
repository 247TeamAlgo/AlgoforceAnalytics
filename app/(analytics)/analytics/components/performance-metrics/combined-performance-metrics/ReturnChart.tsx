// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/ReturnChart.tsx
"use client";

import React, { useMemo } from "react";
import SignedBar from "./SignedBar";
import { REALIZED_COLOR, MARGIN_COLOR } from "./helpers";

function pct4(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

type Row = { label: "Realized" | "Margin"; value: number; color: string };

export function ReturnChart({
  realizedReturn,
  marginReturn,
  containerWidth,
  upnlReturn = 0,
}: {
  realizedReturn: number;
  marginReturn: number;
  containerWidth: number; // provided by parent ResizeObserver
  upnlReturn?: number;
}) {
  // distinct colors
  const marginColor =
    String(MARGIN_COLOR) === String(REALIZED_COLOR)
      ? "hsl(263 90% 60%)"
      : String(MARGIN_COLOR);
  const UPNL_COLOR = "hsl(45 94% 55%)";

  const rows: Row[] = useMemo(
    () => [
      {
        label: "Realized",
        value: realizedReturn,
        color: String(REALIZED_COLOR),
      },
      { label: "Margin", value: marginReturn, color: marginColor },
    ],
    [realizedReturn, marginReturn, marginColor]
  );

  // symmetric domain (min ±10%)
  const maxAbs = Math.max(
    0,
    ...rows.map((r) => Math.abs(r.value)),
    Math.abs(upnlReturn)
  );
  const minSpan = 0.1; // 10%
  const bound = Math.max(minSpan, Math.ceil((maxAbs * 100) / 10) * 0.1); // fraction

  // === EXACTLY 7 guides, 4th is 0% ===
  // positions: [-1, -2/3, -1/3, 0, 1/3, 2/3, 1] * bound
  const guides: number[] = Array.from(
    { length: 7 },
    (_, i) => ((i - 3) / 3) * bound
  );

  // responsive vertical sizing to maximize space
  const w = containerWidth || 0;
  const BAR_H = Math.round(clamp(w * 0.022, 18, 26)); // scales with card width
  const ROW_GAP = Math.round(BAR_H * 0.45);
  const BOTTOM_LABEL_H = 16;
  const BARS_STACK_H = BAR_H * 2 + ROW_GAP;

  // styling
  const RAIL_BG = "rgba(148,163,184,0.12)";
  const DASH_COLOR = "var(--muted-foreground)";

  const asLeftPct = (v: number): string =>
    `${((v + bound) / (2 * bound)) * 100}%`;

  const valueColorClass = (v: number): string =>
    v > 0
      ? "text-emerald-500"
      : v < 0
        ? "text-red-500"
        : "text-muted-foreground";

  // one row renderer inside the stacked bar area
  const renderRow = (idx: 0 | 1, r: Row) => {
    const top = idx === 0 ? 0 : BAR_H + ROW_GAP;
    const isPos = r.value > 0;
    const isNeg = r.value < 0;
    const mag = Math.abs(r.value);

    const isMargin = r.label === "Margin";
    const upPos = isMargin && upnlReturn > 0;
    const upNeg = isMargin && upnlReturn < 0;
    const upMag = Math.abs(upnlReturn);

    return (
      <>
        {/* rails (no inner grid), 2px rounding */}
        <div
          className="absolute left-0 z-10 rounded-[2px]"
          style={{ top, height: BAR_H, width: "50%", background: RAIL_BG }}
        />
        <div
          className="absolute right-0 z-10 rounded-[2px]"
          style={{ top, height: BAR_H, width: "50%", background: RAIL_BG }}
        />

        {/* negative half */}
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
              valueThicknessPct={1} // full-height fill (no vertical padding)
              negColor={r.color}
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
                trackClassName="rounded-[2px] pointer-events-none"
              />
            )}
          </div>
        )}

        {/* positive half */}
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
              negColor={r.color}
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
                trackClassName="rounded-[2px] pointer-events-none"
              />
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="rounded-[2px] border bg-card/40 p-3 mb-5">
      <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
        Return (MTD)
      </div>

      {/* Three-column layout: label | bars | value */}
      <div
        className="grid"
        style={{ gridTemplateColumns: "auto 1fr auto", columnGap: 10 }}
      >
        {/* left labels, vertically aligned with bars */}
        <div
          className="flex flex-col justify-between"
          style={{ height: BARS_STACK_H }}
        >
          <div className="text-sm text-foreground flex items-center">
            Realized
          </div>
          <div className="text-sm text-foreground flex items-center">
            Margin
          </div>
        </div>

        {/* center: stacked bars */}
        <div
          className="relative w-full min-w-0"
          style={{ height: BARS_STACK_H }}
        >
          {/* === Single set of dashed guides spanning BOTH bars and extending down to labels === */}
          <div
            className="pointer-events-none absolute left-0 right-0 z-[15]"
            style={{ top: 0, bottom: -BOTTOM_LABEL_H }} // connects to bottom labels
          >
            {guides.map((g, i) => (
              <div
                key={`g-${i}`}
                className="absolute top-0 bottom-0 -translate-x-1/2 border-r border-dashed"
                style={{
                  left: asLeftPct(g),
                  borderColor: "var(--muted-foreground)",
                  borderRightWidth: 1,
                  opacity: 0.9,
                }}
              />
            ))}
          </div>

          {/* bars (no horizontal stroke between rows) */}
          {renderRow(0, rows[0]!)}
          {renderRow(1, rows[1]!)}
        </div>

        {/* right values */}
        <div
          className="flex flex-col justify-between"
          style={{ height: BARS_STACK_H }}
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

        {/* bottom labels: EXACTLY the same positions as the guides (always aligned) */}
        <div />
        <div className="relative mt-1" style={{ height: BOTTOM_LABEL_H }}>
          {guides.map((g, i) => (
            <div
              key={`lbl-${i}`}
              className="absolute text-[11px] leading-none text-muted-foreground"
              style={{ left: asLeftPct(g), transform: "translateX(-50%)" }}
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
