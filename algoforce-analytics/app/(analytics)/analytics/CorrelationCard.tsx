"use client";

import * as React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { StrategyRiskResult } from "@/lib/types";

export default function CorrelationCard({ merged }: { merged: StrategyRiskResult[] }) {
  const data = merged.flatMap((r) => r.correlation.map((s) => ({ ...s, id: r.id })));

  if (!data.length) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Correlation Monitor</CardTitle>
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
          <CardTitle className="leading-tight">Correlation Monitor</CardTitle>
          <CardDescription className="mt-0.5">Pearson • Spearman • Kendall</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={{
            pearson: { label: "Pearson", color: "var(--chart-1)" },
            spearman: { label: "Spearman", color: "var(--chart-2)" },
            kendall: { label: "Kendall", color: "var(--chart-3)" },
          }}
          className="aspect-auto h-[240px] w-full"
        >
          <LineChart data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" />
            <YAxis domain={[-1, 1]} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => [v == null ? "–" : String(v), ` ${n}`]} />} />
            <Line dataKey="pearson" stroke="var(--chart-1)" dot={false} connectNulls={false} />
            <Line dataKey="spearman" stroke="var(--chart-2)" dot={false} connectNulls={false} />
            <Line dataKey="kendall" stroke="var(--chart-3)" dot={false} connectNulls={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}