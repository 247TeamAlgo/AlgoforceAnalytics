// app/(analytics)/analytics/components/performance-metrics/PnLPerPairCard.tsx
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
import type { MetricsSlim } from "../../lib/types";
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

const POS_HEX = "#23ba7d";
const NEG_HEX = "#f6465d";

const chartConfig: ChartConfig = {
  pos: { label: "Profit", color: POS_HEX },
  neg: { label: "Loss", color: NEG_HEX },
};

function build(merged: MetricsSlim, topN = 12): Row[] {
  const buckets = merged.pnl_per_pair ?? [];
  if (!buckets.length) return [];
  return [...buckets]
    .map((b) => ({ label: b.label, total: Number(b.total.toFixed(2)) }))
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
  m = Math.ceil(m * 1.1); // small headroom
  return [-m, m];
}

/** Labels just outside the bar ends; left for negatives, right for positives */
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

/** Resize observer hook (no layout thrash, works in cards) */
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

export default function PnLPerPairCard({ merged }: { merged: MetricsSlim }) {
  const rows = React.useMemo(() => build(merged), [merged]);
  const data = React.useMemo(() => toDiverging(rows), [rows]);
  const domain = React.useMemo(() => maxAbsDomain(data), [data]);

  const [contentRef, { width }] = useMeasure<HTMLDivElement>();
  const count = Math.max(1, data.length);

  // Sizing + responsiveness mirrors Drawdown card
  const widthFactor =
    width < 520 ? 0.96 : width < 800 ? 1.06 : width < 1100 ? 1.18 : 1.3;

  const baseBar =
    count <= 6
      ? 32
      : count <= 10
        ? 28
        : count <= 16
          ? 24
          : count <= 24
            ? 20
            : count <= 32
              ? 18
              : 16;

  const barSize = Math.max(12, Math.min(40, Math.round(baseBar * widthFactor)));
  const gapY = Math.round(barSize * 0.38);

  // Y-axis width (cap ~34% of card width). Use longest label length.
  const longest = rows.reduce((m, r) => Math.max(m, r.label.length), 0);
  const yAxisWidth = Math.max(
    112,
    Math.min(Math.floor(width * 0.34), longest * 7 + 20)
  );

  // Margins: room for value labels on the right
  const maxAbs = Math.max(Math.abs(domain[0]), Math.abs(domain[1]));
  const rightLabelChars = fmtUsd(maxAbs).length;
  const rightMargin = Math.max(12, 6 + rightLabelChars * 6);
  const topMargin = 12;
  const leftMargin = 0;
  const bottomMargin = 6;

  // Chart height: tight packing
  const height = count * (barSize + gapY) + topMargin + bottomMargin + 4;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-2 sm:py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="leading-tight">
                Total PnL per Pair
              </CardTitle>
              <CardDescription className="mt-0.5">
                Zero-centered; losses left (red), profits right (green)
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent ref={contentRef} className="px-2 sm:p-6">
        {!data.length ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="w-full"
            style={{ height: `${height}px` }}
          >
            <BarChart
              accessibilityLayer
              data={data}
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
                dataKey="label"
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={yAxisWidth}
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
                fill={NEG_HEX}
                radius={[4, 0, 0, 4]}
                barSize={barSize}
              >
                <LabelList dataKey="neg" content={DivergingValueLabel} />
              </Bar>
              <Bar
                dataKey="pos"
                stackId="pnl"
                fill={POS_HEX}
                radius={[0, 4, 4, 0]}
                barSize={barSize}
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
