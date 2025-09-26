"use client";

import * as React from "react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { StrategyRiskResult } from "@/lib/types";

export default function StationarityCard({ merged }: { merged: StrategyRiskResult[] }) {
  const data = merged.flatMap((r) => r.stationarity.map((s) => ({ ...s, id: r.id })));

  if (!data.length) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Stationarity Tests</CardTitle>
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
          <CardTitle className="leading-tight">Stationarity Tests</CardTitle>
          <CardDescription className="mt-0.5">ADF p, KPSS p, Johansen stat</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={{
            adf_p: { label: "ADF p", color: "var(--chart-1)" },
            kpss_p: { label: "KPSS p", color: "var(--chart-2)" },
            johansen_stat: { label: "Johansen", color: "var(--chart-3)" },
          }}
          className="aspect-auto h-[240px] w-full"
        >
          <ComposedChart data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" />
            <YAxis />
            <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => [v == null ? "–" : String(v), ` ${n}`]} />} />
            <Line dataKey="adf_p" stroke="var(--chart-1)" dot={false} connectNulls={false} />
            <Line dataKey="kpss_p" stroke="var(--chart-2)" dot={false} connectNulls={false} />
            <Bar dataKey="johansen_stat" fill="var(--chart-3)" barSize={8} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}