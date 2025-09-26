"use client";

import * as React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { StrategyRiskResult } from "@/lib/types";

export default function SpreadMonitorCard({ merged }: { merged: StrategyRiskResult[] }) {
  const data = merged.flatMap((r) => r.spread.map((s) => ({ ...s, id: r.id })));

  if (!data.length) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Spread Z-Score</CardTitle>
            <CardDescription className="mt-0.5">No data</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">Spread Z-Score</CardTitle>
          <CardDescription className="mt-0.5">Merged view across all pairs</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={{ z: { label: "Z", color: "var(--chart-1)" } }} className="aspect-auto h-[240px] w-full">
          <LineChart data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" tickMargin={8} />
            <YAxis width={60} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" />
            <ReferenceLine y={1} stroke="var(--chart-2)" strokeDasharray="3 3" />
            <ReferenceLine y={-1} stroke="var(--chart-2)" strokeDasharray="3 3" />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => [v == null ? "–" : String(v), " Z"]} />} />
            <Line type="monotone" dataKey="z" stroke="var(--chart-1)" dot={false} connectNulls={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}