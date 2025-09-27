// app/(analytics)/analytics/components/performance-metrics/ConsecutiveLosingDaysCard.tsx
"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MetricsSlim } from "../../lib/types";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

type Row = { account: string; current: number; max: number };

/* Keep palette explicit and readable. */
const CURRENT_HEX = "#39A0ED"; // blue
const MAX_HEX = "#A1A1AA"; // gray-500

const chartConfig: ChartConfig = {
  current: { label: "Current losing streak", color: CURRENT_HEX },
  max: { label: "Max losing streak", color: MAX_HEX },
};

/* Responsive measurement hook (shared pattern across cards) */
function useMeasure<T extends HTMLElement>(): [
  React.MutableRefObject<T | null>,
  { width: number; height: number },
] {
  const ref = React.useRef<T>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ width: cr.width, height: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

function buildRows(perAccounts?: Record<string, MetricsSlim>): Row[] {
  if (!perAccounts) return [];
  const rows: Row[] = Object.entries(perAccounts).map(([account, p]) => ({
    account,
    current: Math.max(0, Number(p.streaks?.current ?? 0)),
    max: Math.max(0, Number(p.streaks?.max ?? 0)),
  }));
  rows.sort((a, b) => b.current - a.current || b.max - a.max);
  return rows;
}

function dayLabel(n: number): string {
  return `${n}d`;
}

export default function ConsecutiveLosingDaysCard({
  perAccounts,
}: {
  perAccounts?: Record<string, MetricsSlim>;
}) {
  const rows = React.useMemo(() => buildRows(perAccounts), [perAccounts]);

  const [contentRef, { width }] = useMeasure<HTMLDivElement>();
  const rowCount = Math.max(1, rows.length);

  const widthFactor =
    width < 520 ? 0.96 : width < 800 ? 1.06 : width < 1100 ? 1.18 : 1.3;

  const baseBar =
    rowCount <= 6
      ? 32
      : rowCount <= 10
        ? 28
        : rowCount <= 16
          ? 24
          : rowCount <= 24
            ? 20
            : rowCount <= 32
              ? 18
              : 16;

  const barSize = Math.max(12, Math.min(40, Math.round(baseBar * widthFactor)));
  const gapY = Math.round(barSize * 0.38);

  const longest = rows.reduce((m, r) => Math.max(m, r.account.length), 0);
  const yAxisWidth = Math.max(
    112,
    Math.min(Math.floor(width * 0.34), longest * 7 + 20)
  );

  const xMax = Math.max(1, ...rows.map((r) => Math.max(r.current, r.max)));
  const rightMargin = 42; // room for end labels
  const topMargin = 12;
  const leftMargin = 0;
  const bottomMargin = 6;

  const height = rowCount * (barSize + gapY) + topMargin + bottomMargin + 4;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">
            Consecutive Losing Days
          </CardTitle>
          <CardDescription className="mt-0.5">
            Side-by-side bars per account — current vs max losing streak
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent ref={contentRef} className="px-2 sm:p-6">
        {!rows.length ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="w-full"
            style={{ height: `${height}px` }}
          >
            <BarChart
              accessibilityLayer
              data={rows}
              layout="vertical"
              barCategoryGap={gapY}
              margin={{
                left: leftMargin,
                right: rightMargin,
                top: topMargin,
                bottom: bottomMargin,
              }}
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="account"
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={yAxisWidth}
              />
              <XAxis
                type="number"
                domain={[0, Math.ceil(xMax * 1.06)]}
                allowDecimals={false}
                tickFormatter={(v: number) => dayLabel(v)}
              />

              {/* Using native Recharts Tooltip for simplicity here */}
              <ReTooltip
                cursor={{ strokeOpacity: 0.08 }}
                formatter={(value: unknown, name: unknown) => {
                  const v =
                    typeof value === "number" ? value : Number(value ?? 0);
                  const label = name === "current" ? "Current" : "Max";
                  return [dayLabel(v), label];
                }}
                labelFormatter={(label: string) => label}
              />

              <Bar dataKey="max" fill={MAX_HEX} radius={4} barSize={barSize}>
                <LabelList
                  dataKey="max"
                  position="right"
                  offset={8}
                  className="fill-foreground"
                  formatter={(v: number) => dayLabel(v)}
                  fontSize={12}
                />
              </Bar>

              <Bar
                dataKey="current"
                fill={CURRENT_HEX}
                radius={4}
                barSize={barSize}
              >
                <LabelList
                  dataKey="current"
                  position="right"
                  offset={8}
                  className="fill-foreground"
                  formatter={(v: number) => dayLabel(v)}
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
