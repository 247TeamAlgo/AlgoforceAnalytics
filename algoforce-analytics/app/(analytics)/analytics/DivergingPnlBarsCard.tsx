// app/analytics/cards/DivergingPnlBarsCard.tsx
"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Tooltip, ReferenceArea } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import type { HistoricalBucket } from "@/app/(analytics)/analytics/types";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";

// Minimal prop type for our custom LabelList renderer
type CountLabelProps = {
  index?: number;
  x?: number;
  y?: number;
  width?: number;
};

export default function DivergingPnlBarsCard({
  title, subtitle, rows,
}: { title: string; subtitle?: string; rows: HistoricalBucket[] }) {
  const data = rows.map(r => {
    const rawPos = Number(r.pnl_pos ?? 0);
    const rawNeg = Number(r.pnl_neg ?? 0);

    const pos = rawPos > 0 ? rawPos : 0;                  // strictly positive
    const neg = rawNeg < 0 ? rawNeg : rawNeg > 0 ? -rawNeg : 0; // strictly negative

    return { label: r.label, pos, neg, count: r.count ?? 0 };
  });

  const maxAbs = Math.max(
    1,
    ...data.map(d => Math.abs(d.pos)),
    ...data.map(d => Math.abs(d.neg))
  );

  const rowHeight = 28;
  const chartHeight = Math.max(280, rows.length * rowHeight + 80);
  const barSize = 18;
  const barGap = 6;

  const tooltipFormatter = (value: ValueType, name: NameType) => {
    const num = Array.isArray(value) ? Number(value[0]) : Number(value);
    const txt = Number.isFinite(num) ? `$${num.toLocaleString()}` : String(value);
    const series = name === "pos" ? "Positive" : "Negative";
    return [txt, series] as [string, string];
  };

  // Explicitly typed — no `any`
  const CountLabel = ({ index, x, y, width }: CountLabelProps) => {
    if (index == null) return null;
    const value = data[index]?.count ?? 0;
    if (!value) return null;
    const padding = 6;
    return (
      <text
        x={(x ?? 0) + (width ?? 0) + padding}
        y={(y ?? 0) + barSize / 2}
        dominantBaseline="middle"
        textAnchor="start"
        className="fill-foreground text-xs"
      >
        {value}
      </text>
    );
  };

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">{title}</CardTitle>
          {subtitle && <CardDescription className="mt-0.5">{subtitle}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={{
            pos: { label: "Positive PnL", color: "var(--chart-1)" },
            neg: { label: "Negative PnL", color: "var(--chart-2)" },
          }}
          className="w-full"
          style={{ height: chartHeight }}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 12, right: 12, top: 8, bottom: 8 }}
            barSize={barSize}
            barGap={barGap}
            stackOffset="sign" // ensure pos/neg stack away from zero on correct sides
          >
            {/* True background stripes — render first */}
            {data.map((_, i) =>
              i % 2 === 0 ? (
                <ReferenceArea
                  key={`row-bg-${i}`}
                  y1={i - 0.5}
                  y2={i + 0.5}
                  x1={-maxAbs}
                  x2={maxAbs}
                  fill="#f5f5f5"
                  fillOpacity={1}
                />
              ) : null
            )}

            <CartesianGrid horizontal vertical={false} />

            <YAxis type="category" dataKey="label" width={220} tickLine={false} />
            <XAxis
              type="number"
              domain={[-maxAbs, maxAbs]}
              tickFormatter={(v) => `$${Math.round(Number(v))}`}
            />
            <Tooltip
              content={
                <ChartTooltipContent
                  formatter={tooltipFormatter}
                  labelFormatter={(lab) => String(lab)}
                />
              }
            />

            {/* Single diverging bar per row */}
            <Bar dataKey="neg" stackId="pnl" fill="var(--chart-2)" isAnimationActive={false} />
            <Bar dataKey="pos" stackId="pnl" fill="var(--chart-1)" isAnimationActive={false}>
              <LabelList content={<CountLabel />} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
