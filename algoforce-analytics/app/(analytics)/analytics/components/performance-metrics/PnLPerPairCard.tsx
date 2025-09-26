"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
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

type Row = { label: string; total: number };

type LabelRenderProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number | string;
};

const chartConfig: ChartConfig = {
  total: { label: "Total PnL", color: "var(--chart-2)" },
};

// Palette aligned with CombinedDrawdownCard
const POS_COLOR = "#39A0ED"; // defaultBarColor (blue)
const NEG_COLOR = "var(--chart-1)"; // stronger red

function build(merged: MetricsPayload, topN = 12): Row[] {
  const buckets: HistoricalBucket[] | undefined = merged.historical?.perPair;
  if (!buckets?.length) return [];
  return [...buckets]
    .map((b) => ({
      label: b.label,
      total: Number((b.pnl_pos + b.pnl_neg).toFixed(2)),
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, topN);
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

/** Labels above positives, below negatives, centered on the bar */
function renderValueLabel(raw: unknown) {
  const props = raw as LabelRenderProps;
  const v =
    typeof props.value === "number" ? props.value : Number(props.value ?? 0);
  const cx = (props.x ?? 0) + (props.width ?? 0) / 2;
  const isPos = v >= 0;
  const ty = isPos
    ? (props.y ?? 0) - 6
    : (props.y ?? 0) + (props.height ?? 0) + 14;
  return (
    <text
      x={cx}
      y={ty}
      textAnchor="middle"
      className="fill-foreground text-[11px]"
    >
      {fmtUsd(v)}
    </text>
  );
}

export default function PnLPerPairCard({ merged }: { merged: MetricsPayload }) {
  const data = React.useMemo(() => build(merged), [merged]);

  const [contentRef, { width }] = useMeasure<HTMLDivElement>();
  // Height scales with width but stays within sensible bounds
  const height = Math.max(220, Math.min(460, Math.round(width * 0.56)));
  // Bar size computed so the set always fits inside the card width
  const count = Math.max(1, data.length);
  const usable = Math.max(140, width - 48); // subtract margins
  const barSize = Math.max(
    10,
    Math.min(46, Math.floor(usable / (count * 1.6)))
  );

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">Total PnL per Pair</CardTitle>
          <CardDescription className="mt-0.5">
            Top contributors by absolute PnL
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
            <BarChart accessibilityLayer data={data} barSize={barSize}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={0}
                tickMargin={8}
              />
              <YAxis width={70} tickFormatter={(v: number) => fmtUsd(v)} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dashed"
                    formatter={(val) => {
                      const n =
                        typeof val === "number" ? val : Number(val ?? 0);
                      return [fmtUsd(n), "Total PnL"];
                    }}
                    labelFormatter={(label: string) => label}
                  />
                }
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.label}
                    fill={d.total >= 0 ? POS_COLOR : NEG_COLOR}
                  />
                ))}
                <LabelList dataKey="total" content={renderValueLabel} />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
