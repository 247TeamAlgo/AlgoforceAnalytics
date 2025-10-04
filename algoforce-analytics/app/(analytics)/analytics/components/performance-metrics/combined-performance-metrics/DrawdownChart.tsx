"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { chartCfg, REALIZED_COLOR, MARGIN_COLOR, pct4 } from "./helpers";
import { useMemo } from "react";

export function DrawdownChart({
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
  containerWidth = 0,
}: {
  realizedDD: number; // negative
  marginDD: number; // negative
  levels?: { value: number; label?: string }[];
  levelColors?: string[];
  containerWidth: number;
}) {
  const ddRows = useMemo(
    () => [
      {
        k: "Realized",
        v: Math.abs(realizedDD),
        display: realizedDD,
        c: REALIZED_COLOR,
      },
      {
        k: "Margin",
        v: Math.abs(marginDD),
        display: marginDD,
        c: MARGIN_COLOR,
      },
    ],
    [realizedDD, marginDD]
  );
  const ddMax = Math.max(
    0.02,
    ...ddRows.map((r) => r.v),
    ...levels.map((l) => l.value)
  );
  const xMaxDD = ddMax * 1.12;

  const ddLegend = levels.map((l, i) => ({
    x: l.value,
    label: l.label ?? `-${Math.round(l.value * 100)}%`,
    color: levelColors[i] ?? "var(--chart-2)",
  }));

  const RIGHT_GUTTER_PX =
    Math.max(100, Math.min(140, Math.round(containerWidth * 0.1))) || 120;
  const yAxisWidth =
    Math.max(110, Math.min(145, Math.round(containerWidth * 0.1))) || 130;
  const VALUE_FONT_PX = 12;
  const GUTTER_INNER_PAD_PX = 8;
  const barSize = 30;
  const gapY = 14;
  const margins = { left: 6, right: RIGHT_GUTTER_PX, top: 14, bottom: 8 };
  const sectionHeight = barSize * 2 + gapY + margins.top + margins.bottom + 8;

  const RightPctLabel = (props: {
    y?: number;
    height?: number;
    value?: number;
  }) => {
    const y = typeof props.y === "number" ? props.y : NaN;
    const h = typeof props.height === "number" ? props.height : NaN;
    const value = typeof props.value === "number" ? props.value : NaN;
    if (![y, h, value].every(Number.isFinite)) return null;
    const ty = y + h / 2 + VALUE_FONT_PX * 0.36;
    return (
      <text
        x={containerWidth - RIGHT_GUTTER_PX + GUTTER_INNER_PAD_PX}
        y={ty}
        textAnchor="start"
        fontSize={VALUE_FONT_PX}
        className="font-semibold"
        fill="var(--primary)"
      >
        {pct4(value)}
      </text>
    );
  };

  return (
    <div className="rounded-xl border bg-card/40 p-3 mb-5">
      <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
        Drawdown (MTD)
      </div>
      <ChartContainer
        config={chartCfg}
        className="w-full"
        style={{ height: `${sectionHeight}px` }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={ddRows}
            layout="vertical"
            barCategoryGap={gapY}
            margin={margins}
          >
            <CartesianGrid horizontal={false} vertical={false} />
            <YAxis
              dataKey="k"
              type="category"
              width={yAxisWidth}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tick={{ fontSize: 13, fontWeight: 600 }}
            />
            <XAxis
              type="number"
              domain={[0, xMaxDD]}
              tickFormatter={(v: number) => `-${Math.round(v * 100)}%`}
              tickLine={false}
              axisLine={false}
            />
            {ddLegend.map((it) => (
              <ReferenceLine
                key={`thr-${it.label}`}
                x={it.x}
                stroke={it.color}
                strokeDasharray="6 6"
                label={{
                  value: it.label,
                  position: "top",
                  fill: it.color,
                  fontSize: 12,
                }}
              />
            ))}
            <Bar
              dataKey="v"
              layout="vertical"
              radius={6}
              barSize={barSize}
              isAnimationActive={false}
            >
              {[REALIZED_COLOR, MARGIN_COLOR].map((c, i) => (
                <Cell key={`dd-${i}`} fill={c} />
              ))}
              <LabelList dataKey="display" content={<RightPctLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
