"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
  LabelList,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MetricsPayload, HistoricalBucket } from "../../lib/types";
import { fmtUsd } from "../../lib/types";

type Row = { label: string; total: number };
type DivergingRow = { label: string; pos: number; neg: number; total: number };

type LabelRenderProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number | string;
};

const chartConfig: ChartConfig = {
  pos: { label: "Profit", color: "var(--chart-2)" }, // green
  neg: { label: "Loss", color: "var(--chart-1)" }, // red
};

function build(merged: MetricsPayload, topN = 12): Row[] {
  const buckets: HistoricalBucket[] | undefined = merged.historical?.perSymbol;
  if (!buckets?.length) return [];
  return [...buckets]
    .map((b) => ({
      label: b.label,
      total: Number((b.pnl_pos + b.pnl_neg).toFixed(2)),
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, topN);
}

function toDiverging(rows: Row[]): DivergingRow[] {
  return rows.map((r) => ({
    label: r.label,
    pos: r.total > 0 ? r.total : 0,
    neg: r.total < 0 ? r.total : 0, // keep negative for left-extend
    total: r.total,
  }));
}

function maxAbsDomain(rows: DivergingRow[]): [number, number] {
  let m = 0;
  for (const r of rows) {
    const a = Math.abs(r.total);
    if (a > m) m = a;
  }
  m = Math.ceil(m * 1.1); // headroom
  return [-m, m];
}

/** Value labels outside the bar ends; left for negatives, right for positives */
function DivergingValueLabel(raw: unknown) {
  const props = raw as LabelRenderProps;
  const v =
    typeof props.value === "number" ? props.value : Number(props.value ?? 0);
  const isNeg = v < 0;
  const x = (props.x ?? 0) + (isNeg ? -8 : (props.width ?? 0) + 8);
  const y = (props.y ?? 0) + (props.height ?? 0) / 2;

  return (
    <text
      x={x}
      y={y}
      textAnchor={isNeg ? "end" : "start"}
      dominantBaseline="central"
      className="fill-foreground text-[11px]"
    >
      {fmtUsd(v)}
    </text>
  );
}

export default function PnLPerSymbolCard({
  merged,
}: {
  merged: MetricsPayload;
}) {
  const rows = React.useMemo(() => build(merged), [merged]);
  const data = React.useMemo(() => toDiverging(rows), [rows]);
  const domain = React.useMemo(() => maxAbsDomain(data), [data]);

  // Size: height scales with number of rows so all labels fit cleanly
  const count = Math.max(1, data.length);
  const height = Math.min(520, Math.max(220, count * 28 + 80));
  const innerAvail = Math.max(120, height - 96);
  const barSize = Math.max(
    14,
    Math.min(32, Math.floor(innerAvail / count) - 6)
  );

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">Total PnL per Symbol</CardTitle>
          <CardDescription className="mt-0.5">
            Zero-centered; losses left (red), profits right (green)
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {!data.length ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="w-full"
            style={{ height }}
          >
            <BarChart
              accessibilityLayer
              data={data}
              layout="vertical"
              barSize={barSize}
              margin={{ left: 8, right: 56, top: 8, bottom: 8 }}
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="label"
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={180}
              />
              <XAxis
                type="number"
                domain={domain}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                tickFormatter={(v: number) => fmtUsd(v)}
              />
              <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" />
              <ChartTooltip
                cursor={{ strokeOpacity: 0.08 }}
                content={
                  <ChartTooltipContent
                    indicator="dashed"
                    formatter={(val) => {
                      const n =
                        typeof val === "number" ? val : Number(val ?? 0);
                      return [fmtUsd(n), n >= 0 ? "Profit" : "Loss"];
                    }}
                    labelFormatter={(label: string) => label}
                  />
                }
              />
              {/* Negatives first so they stack left of zero */}
              <Bar
                dataKey="neg"
                stackId="pnl"
                fill="var(--color-neg)"
                radius={[4, 0, 0, 4]}
              >
                <LabelList dataKey="neg" content={DivergingValueLabel} />
              </Bar>
              <Bar
                dataKey="pos"
                stackId="pnl"
                fill="var(--color-pos)"
                radius={[0, 4, 4, 0]}
              >
                <LabelList dataKey="pos" content={DivergingValueLabel} />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
