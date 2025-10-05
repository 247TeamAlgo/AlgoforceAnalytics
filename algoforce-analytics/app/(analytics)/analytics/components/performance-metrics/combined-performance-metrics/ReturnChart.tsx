// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/ReturnChart.tsx
"use client";

import React, { useMemo } from "react";
import SignedBar from "./SignedBar";
import { REALIZED_COLOR, MARGIN_COLOR } from "./helpers";

function pct4(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}

export function ReturnChart({
  realizedReturn,
  marginReturn,
  containerWidth = 0, // kept for API compatibility
}: {
  realizedReturn: number;
  marginReturn: number;
  containerWidth: number;
}) {
  const rows = useMemo(
    () => [
      { label: "Realized", value: realizedReturn, color: REALIZED_COLOR },
      { label: "Margin", value: marginReturn, color: MARGIN_COLOR },
    ],
    [realizedReturn, marginReturn]
  );

  // Symmetric domain snapped to 10% multiples (min ±10%)
  const maxAbsNow = Math.max(0, ...rows.map((r) => Math.abs(r.value)));
  const minSpan = 0.1; // 10%
  const bound10 = Math.max(minSpan, Math.ceil((maxAbsNow * 100) / 10) * 0.1);

  // Bottom ticks every 10%
  const ticks: number[] = [];
  for (let t = -bound10; t <= bound10 + 1e-9; t += 0.1) {
    ticks.push(Number((Math.round(t * 10) / 10).toFixed(1)));
  }

  // Layout constants
  const GRID_COL_GAP = 10;
  const BAR_H = 30;
  const ROW_GAP = 14;

  // Keep these in sync with SignedBar defaults
  const VALUE_THICKNESS_PCT = 0.7;
  const VALUE_STRIP_H = Math.max(2, Math.round(BAR_H * VALUE_THICKNESS_PCT));
  const VALUE_STRIP_TOP = Math.max(0, Math.round((BAR_H - VALUE_STRIP_H) / 2));
  // Width needed to “square” the rounded inner end (half the strip’s height)
  const CENTER_CAP_W = Math.ceil(VALUE_STRIP_H / 2);

  const RAIL_BG = "rgba(148,163,184,0.12)";
  const ZERO_LINE_COLOR = "var(--muted-foreground)";

  return (
    <div className="rounded-xl border bg-card/40 p-3">
      <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
        Return (MTD)
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "auto 1fr auto", // label | bar | value
          columnGap: GRID_COL_GAP,
          rowGap: ROW_GAP,
        }}
      >
        {rows.map((r) => {
          const isPos = r.value > 0;
          const isNeg = r.value < 0;
          const posMag = isPos ? r.value : 0;
          const negMag = isNeg ? Math.abs(r.value) : 0;

          return (
            <React.Fragment key={r.label}>
              <div className="text-sm text-foreground flex items-center">
                {r.label}
              </div>

              <div className="relative h-[30px]">
                {/* rails */}
                <div
                  className="absolute inset-y-0 left-0 w-1/2 z-0"
                  style={{
                    background: RAIL_BG,
                    borderTopLeftRadius: BAR_H / 2,
                    borderBottomLeftRadius: BAR_H / 2,
                  }}
                />
                <div
                  className="absolute inset-y-0 right-0 w-1/2 z-0"
                  style={{
                    background: RAIL_BG,
                    borderTopRightRadius: BAR_H / 2,
                    borderBottomRightRadius: BAR_H / 2,
                  }}
                />

                {/* 0% dashed divider (highest layer) */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-r border-dashed z-40"
                  style={{ borderColor: ZERO_LINE_COLOR }}
                />

                {/* LEFT half (negative only) */}
                {isNeg && (
                  <div className="absolute left-0 top-0 h-full w-1/2 z-20">
                    <SignedBar
                      mode="one-negative"
                      anchor="right"
                      value={negMag}
                      ghostValue={0}
                      minBarPx={0}
                      maxAbs={bound10}
                      height={BAR_H}
                      negColor={r.color}
                      trackClassName="border-0 bg-transparent"
                    />
                    {/* center cap mask to square inner end */}
                    <div
                      className="absolute"
                      style={{
                        right: 0,
                        top: VALUE_STRIP_TOP,
                        width: CENTER_CAP_W,
                        height: VALUE_STRIP_H,
                        background: RAIL_BG,
                        zIndex: 30, // above bar, below dashed line
                      }}
                    />
                  </div>
                )}

                {/* RIGHT half (positive only) */}
                {isPos && (
                  <div className="absolute right-0 top-0 h-full w-1/2 z-20">
                    <SignedBar
                      mode="one-negative"
                      anchor="left"
                      value={posMag}
                      ghostValue={0}
                      minBarPx={0}
                      maxAbs={bound10}
                      height={BAR_H}
                      negColor={r.color}
                      trackClassName="border-0 bg-transparent"
                    />
                    {/* center cap mask to square inner end */}
                    <div
                      className="absolute"
                      style={{
                        left: 0,
                        top: VALUE_STRIP_TOP,
                        width: CENTER_CAP_W,
                        height: VALUE_STRIP_H,
                        background: RAIL_BG,
                        zIndex: 30, // above bar, below dashed line
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="text-sm font-medium tabular-nums text-foreground flex items-center">
                {pct4(r.value)}
              </div>
            </React.Fragment>
          );
        })}

        {/* Bottom axis ticks (−10%, 0%, 10%, …) */}
        <div />
        <div className="relative mt-1 h-4">
          {ticks.map((t) => {
            const leftPct = ((t + bound10) / (2 * bound10)) * 100;
            return (
              <div
                key={`tick-${t}`}
                className="absolute top-0 text-[11px] leading-none text-muted-foreground"
                style={{ left: `${leftPct}%`, transform: "translateX(-50%)" }}
              >
                {(t * 100).toFixed(0)}%
              </div>
            );
          })}
        </div>
        <div />
      </div>
    </div>
  );
}
