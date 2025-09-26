"use client";

import * as React from "react";
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
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
import type { MetricsPayload } from "../../lib/types";

type Row = { day: string; cum: number };

const chartConfig: ChartConfig = {
  cum: { label: "Cumulative Net", color: "var(--chart-1)" },
};

function buildCum(merged: MetricsPayload): Row[] {
  const rows = merged.daily_return_last_n_days.daily_rows;
  let cum = 0;
  return rows.map((r) => {
    cum += r.net_pnl;
    return { day: r.day, cum: Number(cum.toFixed(2)) };
  });
}

export default function ReturnsCard({
  merged,
}: {
  merged: MetricsPayload;
}) {
  const kpi = merged.daily_return_last_n_days.total_return_pct_over_window ?? 0;
  const data = React.useMemo(() => buildCum(merged), [merged]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">
            Combined Selected Range Return
          </CardTitle>
          <CardDescription className="mt-0.5">
            Total return for the current date selection
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex items-baseline gap-3">
          <div className="text-3xl font-semibold">
            {kpi >= 0 ? "+" : ""}
            {kpi.toFixed(2)}%
          </div>
          <div className="text-sm text-muted-foreground">cumulative net</div>
        </div>

        <div className="mt-4">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[160px] w-full"
          >
            <LineChart data={data} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" hide />
              <YAxis hide />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[180px]"
                    nameKey="cum"
                    formatter={(val) => {
                      const n =
                        typeof val === "number" ? val : Number(val ?? 0);
                      return [`$${n.toLocaleString()}`, "Cumulative Net"];
                    }}
                    labelFormatter={(label: string) => label}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="cum"
                dot={false}
                stroke="var(--chart-1)"
                strokeWidth={2}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
