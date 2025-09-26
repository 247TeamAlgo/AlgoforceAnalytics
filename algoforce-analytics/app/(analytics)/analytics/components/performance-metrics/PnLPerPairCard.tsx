"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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

const chartConfig: ChartConfig = {
  total: { label: "Total PnL", color: "var(--chart-2)" },
};

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

export default function PnLPerPairCard({
  merged,
}: {
  merged: MetricsPayload;
}) {
  const data = React.useMemo(() => build(merged), [merged]);
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
      <CardContent className="px-2 sm:p-6">
        {!data.length ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[280px] w-full"
          >
            <BarChart accessibilityLayer data={data}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
              />
              <YAxis width={70} tickFormatter={(v: number) => fmtUsd(v)} />
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
              <Bar dataKey="total" radius={4} fill="var(--chart-2)" />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
