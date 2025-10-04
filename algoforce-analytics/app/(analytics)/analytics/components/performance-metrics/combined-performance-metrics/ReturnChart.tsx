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

export function ReturnChart({
  realizedReturn,
  marginReturn,
  containerWidth = 0,
}: {
  realizedReturn: number;
  marginReturn: number;
  containerWidth: number;
}) {
  const retRows = useMemo(
    () => [
      { k: "Realized", v: realizedReturn, c: REALIZED_COLOR },
      { k: "Margin", v: marginReturn, c: MARGIN_COLOR },
    ],
    [realizedReturn, marginReturn]
  );

  const retSteps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0];
  const retAbsNow = Math.max(0.0, ...retRows.map((r) => Math.abs(r.v)));
  const retTarget = retSteps.find((s) => retAbsNow <= s) ?? retAbsNow;
  const xMaxRet = (retTarget || 0.01) * 1.08;

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
    <div className="rounded-xl border bg-card/40 p-3">
      <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
        Return (MTD)
      </div>
      <ChartContainer
        config={chartCfg}
        className="w-full"
        style={{ height: `${sectionHeight}px` }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={retRows}
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
              domain={[-xMaxRet, xMaxRet]}
              ticks={[-xMaxRet / 1.08, 0, xMaxRet / 1.08]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine
              x={0}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
            />
            <Bar
              dataKey="v"
              layout="vertical"
              radius={6}
              barSize={30}
              isAnimationActive={false}
            >
              {[REALIZED_COLOR, MARGIN_COLOR].map((c, i) => (
                <Cell key={`ret-${i}`} fill={c} />
              ))}
              <LabelList content={<RightPctLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
