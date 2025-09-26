"use client";

import * as React from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { StrategyRiskResult } from "@/lib/types";

export default function ReversionCard({ merged }: { merged: StrategyRiskResult[] }) {
  const data = merged.flatMap((r) => r.reversion.map((s) => ({ ...s, id: r.id })));

  if (!data.length) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Reversion Strength</CardTitle>
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
          <CardTitle className="leading-tight">Reversion Strength</CardTitle>
          <CardDescription className="mt-0.5">AR(1) φ &amp; half-life (days)</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={{
            phi: { label: "φ", color: "var(--chart-1)" },
            half_life_days: { label: "Half-Life", color: "var(--chart-2)" },
          }}
          className="aspect-auto h-[240px] w-full"
        >
          <LineChart data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" />
            <YAxis />
            <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => [v == null ? "–" : String(v), ` ${n}`]} />} />
            <Line dataKey="phi" stroke="var(--chart-1)" dot={false} connectNulls={false} />
            <Line dataKey="half_life_days" stroke="var(--chart-2)" dot={false} connectNulls={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
