// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/DrawdownChart.tsx
"use client";

import React from "react";

type Level = { value: number; label?: string };

const REALIZED_COLOR = "#39A0ED";
const MARGIN_COLOR = "#8A5CF6";

function pct4(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}
function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

type RowSpec = { label: string; color: string; value: number };

export type DrawdownChartProps = {
  realizedDD: number;
  marginDD: number;
  levels?: Level[];
  levelColors?: string[];
  barHeight?: number;
  rowGap?: number;
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
  levelColors = [
    "var(--chart-5)",
    "#FFA94D",
    "#FF7043",
    "var(--chart-1)",
    "#C62828",
    "#C62828",
  ],
  barHeight = 20,
  rowGap = 14,
}: DrawdownChartProps) {
  // Domain: 0 (left) → maxAbs (right). Values are negative; use abs().
  const maxLevel = levels.length ? Math.max(...levels.map((l) => l.value)) : 0.06;
  const maxAbs = Math.max(Math.abs(realizedDD), Math.abs(marginDD), maxLevel, 1e-9);

  const rows: RowSpec[] = [
    { label: "Realized", color: REALIZED_COLOR, value: realizedDD },
    { label: "Margin", color: MARGIN_COLOR, value: marginDD },
  ];

  // Layout
  const GRID_COL_GAP = 10;
  const AXIS_ROW_H = 14;  // height for the "% labels" row
  const AXIS_MB = 2;

  // How much to lift the dashed overlay ABOVE each bar (in px).
  // Realized gets a bigger lift to be closer to the percent labels above.
  const DASH_UP_OVER_REALIZED = AXIS_ROW_H + AXIS_MB - 3; // ≈ just under the labels row
  const DASH_UP_OVER_MARGIN = 4; // small lift; change to match realized if you want

  return (
    <div className="rounded-xl border bg-card/40 p-3 mb-5">
      <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
        Drawdown (MTD)
      </div>

      {/* Shared 3-col grid keeps everything aligned */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "auto 1fr auto", // label | bar | value
          columnGap: GRID_COL_GAP,
          rowGap,
        }}
      >
        {/* Top axis labels aligned to the bar column */}
        <div />
        <div className="relative" style={{ height: AXIS_ROW_H, marginBottom: AXIS_MB }}>
          {[{ v: 0, label: "0%" }, ...levels.map((l) => ({ v: l.value, label: l.label ?? `-${Math.round(l.value * 100)}%` }))].map(
            (t, i) => {
              const leftPct = clamp01(t.v / maxAbs) * 100;
              const color = i === 0 ? "var(--muted-foreground)" : levelColors[i - 1] ?? "var(--muted-foreground)";
              return (
                <span
                  key={`tick-${t.label}`}
                  className="absolute text-[11px] leading-none"
                  style={{
                    left: `${leftPct}%`,
                    transform: "translateX(-50%)",
                    color,
                    top: 0,
                  }}
                >
                  {t.label}
                </span>
              );
            }
          )}
        </div>
        <div />

        {/* Rows */}
        {rows.map((r, rowIdx) => {
          const absVal = Math.abs(r.value);
          const widthPct = clamp01(absVal / maxAbs) * 100;

          // Lift amount for dashed overlay (to push its top closer to axis labels)
          const upLift =
            rowIdx === 0 ? DASH_UP_OVER_REALIZED : DASH_UP_OVER_MARGIN;

          return (
            <React.Fragment key={r.label}>
              <div className="text-sm text-foreground flex items-center">
                {r.label}
              </div>

              <div className="relative">
                {/* Track */}
                <div
                  className="w-full rounded-full bg-muted"
                  style={{ height: `${barHeight}px` }}
                />

                {/* Fill (0 → right) */}
                <div
                  className="absolute left-0 top-0 rounded-full"
                  style={{
                    height: `${barHeight}px`,
                    width: `${widthPct}%`,
                    backgroundColor: r.color,
                  }}
                  aria-label={`${r.label} drawdown bar`}
                />

                {/* Dashed guidelines — ON TOP of the bar, with a negative top to reach upward */}
                <div
                  className="pointer-events-none absolute z-20"
                  style={{
                    left: 0,
                    right: 0,
                    top: `-${upLift}px`,                               // lift upwards
                    height: `${barHeight + upLift}px`,                   // extend to bar top + lift
                  }}
                >
                  {/* 0% vertical dash */}
                  <div
                    className="absolute inset-y-0 border-r border-dashed"
                    style={{
                      left: "0%",
                      borderColor: "var(--muted-foreground)",
                      opacity: 0.9,
                      transform: "translateX(-0.5px)",
                    }}
                    aria-hidden
                  />
                  {/* Colored level dashes */}
                  {levels.map((l, i) => {
                    const leftPct = clamp01(l.value / maxAbs) * 100;
                    const color = levelColors[i] ?? "var(--muted-foreground)";
                    return (
                      <div
                        key={`${r.label}-g-${i}`}
                        className="absolute inset-y-0 border-r border-dashed"
                        style={{
                          left: `${leftPct}%`,
                          borderColor: color,
                          opacity: 0.9,
                          transform: "translateX(-0.5px)",
                        }}
                        aria-hidden
                      />
                    );
                  })}
                </div>
              </div>

              <div className="text-sm font-medium tabular-nums text-foreground flex items-center">
                {pct4(r.value)}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
