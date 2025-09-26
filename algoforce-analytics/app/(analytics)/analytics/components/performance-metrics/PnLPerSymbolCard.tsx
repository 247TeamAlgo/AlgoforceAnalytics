"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceArea, // ← add
  Cell,
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

type Row = {
  label: string;
  pos: number;
  neg: number;
  total: number;
};

type LabelRenderProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number | string;
  payload?: Row;
};

const chartConfig: ChartConfig = {
  total: { label: "Net PnL", color: "var(--chart-1)" },
};

const GREEN = "var(--chart-2)";
const RED = "var(--chart-1)";

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

function build(merged: MetricsPayload, topN = 12): Row[] {
  const buckets: HistoricalBucket[] | undefined = merged.historical?.perSymbol;
  if (!buckets?.length) return [];
  const rows = buckets.map((b) => {
    const pos = Math.max(0, Number(b.pnl_pos.toFixed(2)));
    const negMag = Math.max(0, Math.abs(Number(b.pnl_neg.toFixed(2))));
    const neg = -negMag;
    const total = Number((pos + neg).toFixed(2));
    return { label: b.label, pos, neg, total };
  });
  return rows
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, topN);
}

function leftLossLabel(props: LabelRenderProps) {
  const { x = 0, y = 0, height = 0, payload } = props;
  const row = payload as Row | undefined;
  if (!row || row.neg === 0) return null;
  const cy = y + height / 2;
  return (
    <text
      x={x - 8}
      y={cy}
      textAnchor="end"
      dominantBaseline="middle"
      className="fill-foreground text-[11px]"
    >
      {fmtUsd(Math.abs(row.neg))}
    </text>
  );
}

function rightGainLabel(props: LabelRenderProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const row = payload as Row | undefined;
  if (!row || row.pos === 0) return null;
  const cx = x + width + 8;
  const cy = y + height / 2;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="start"
      dominantBaseline="middle"
      className="fill-foreground text-[11px]"
    >
      {fmtUsd(row.pos)}
    </text>
  );
}

export default function PnLPerSymbolCard({ merged }: { merged: MetricsPayload }) {
  const data = React.useMemo(() => build(merged), [merged]);

  const [contentRef, { width }] = useMeasure<HTMLDivElement>();
  const rows = data.length;
  const top = 12;
  const bottom = 8;
  const left = 0;
  const right = 16;

  const baseBar =
    rows <= 6 ? 28 : rows <= 10 ? 24 : rows <= 16 ? 20 : rows <= 24 ? 18 : 16;
  const widthFactor =
    width < 520 ? 0.9 : width < 800 ? 1.0 : width < 1100 ? 1.1 : 1.2;
  const barSize = Math.max(12, Math.min(28, Math.round(baseBar * widthFactor)));
  const gapY = Math.round(barSize * 0.45);
  const height = rows ? rows * (barSize + gapY) + top + bottom + 2 : 240;

  const maxSide = data.reduce(
    (m, r) => Math.max(m, r.pos, Math.abs(r.neg)),
    0
  );
  const xMax = (maxSide || 1) * 1.08;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">Total PnL per Symbol</CardTitle>
          <CardDescription className="mt-0.5">
            Left = losses • Right = gains
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent ref={contentRef} className="px-2 sm:p-6">
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
              barCategoryGap={gapY}
              margin={{ top, bottom, left, right }}
            >
              {/* background halves like the screenshot */}
              <ReferenceArea x1={-xMax} x2={0} fill="var(--chart-1)" fillOpacity={0.08} />
              <ReferenceArea x1={0} x2={xMax} fill="var(--chart-2)" fillOpacity={0.08} />

              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="label"
                type="category"
                width={Math.min(220, Math.max(120, Math.floor(width * 0.28)))}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
              />
              <XAxis
                type="number"
                domain={[-xMax, xMax]}
                tickFormatter={(v: number) => fmtUsd(v)}
              />

              {/* center zero line */}
              <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 6" />

              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dashed"
                    formatter={(_, __, p) => {
                      const row = (p?.payload ?? {}) as Row;
                      return [
                        `${fmtUsd(row.pos)} / -${fmtUsd(Math.abs(row.neg))}`,
                        "Gains / Losses",
                      ];
                    }}
                    labelFormatter={(label: string) => label}
                  />
                }
              />

              <Bar dataKey="neg" stackId="pnl" radius={[0, 4, 4, 0]}>
                {data.map((r) => (
                  <Cell key={`neg-${r.label}`} fill={RED} />
                ))}
                <LabelList dataKey="neg" content={leftLossLabel} />
              </Bar>

              <Bar dataKey="pos" stackId="pnl" radius={[4, 0, 0, 4]}>
                {data.map((r) => (
                  <Cell key={`pos-${r.label}`} fill={GREEN} />
                ))}
                <LabelList dataKey="pos" content={rightGainLabel} />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
