"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
  Cell,
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
import type { MetricsPayload } from "../../lib/types";

type Row = { month: string; dd: number }; // dd in decimal (negative)

const chartConfig: ChartConfig = {
  dd: { label: "Monthly Max Drawdown", color: "var(--chart-2)" },
};

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function buildMonthlyDD(merged: MetricsPayload): Row[] {
  const rows = merged.daily_return_last_n_days.daily_rows;
  if (!rows.length) return [];

  // Prefer end_balance; fallback to cumulative net
  const equity: Array<{ day: string; equity: number }> = [];
  let cum = 0;
  for (const r of rows) {
    cum += r.net_pnl;
    equity.push({ day: r.day, equity: r.end_balance ?? cum });
  }

  const out = new Map<string, Row>();
  let curMonth = monthKey(equity[0]!.day);
  let peak = equity[0]!.equity;
  let minDD = 0;

  const flush = (m: string) => {
    out.set(m, { month: m, dd: Number(minDD.toFixed(6)) });
  };

  for (const d of equity) {
    const m = monthKey(d.day);
    if (m !== curMonth) {
      flush(curMonth);
      curMonth = m;
      peak = d.equity;
      minDD = 0;
    }
    if (d.equity > peak) peak = d.equity;
    if (peak > 0) {
      const dd = d.equity / peak - 1;
      if (dd < minDD) minDD = dd;
    }
  }
  flush(curMonth);

  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export default function MonthlyDrawdownCard({
  merged,
  threshold = -0.035, // -3.5%
}: {
  merged: MetricsPayload;
  threshold?: number;
}) {
  const data = React.useMemo(() => buildMonthlyDD(merged), [merged]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">
            Combined Live Monthly Drawdown
          </CardTitle>
          <CardDescription className="mt-0.5">
            Threshold reference at −3.5%
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {!data.length ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[260px] w-full"
          >
            <BarChart accessibilityLayer data={data}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
              />
              <YAxis
                width={56}
                domain={["auto", 0]}
                tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              />
              <ReferenceLine
                y={threshold}
                stroke="var(--destructive)"
                strokeDasharray="4 3"
                label={{
                  value: "-3.5%",
                  position: "right",
                  fill: "var(--destructive)",
                  fontSize: 12,
                }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dashed"
                    formatter={(val) => {
                      const n =
                        typeof val === "number" ? val : Number(val ?? 0);
                      return [`${(n * 100).toFixed(2)}%`, "Max Drawdown"];
                    }}
                    labelFormatter={(label: string) => label}
                  />
                }
              />
              <Bar dataKey="dd" radius={4}>
                {data.map((r) => (
                  <Cell
                    key={r.month}
                    fill={
                      r.dd <= threshold
                        ? "var(--destructive)"
                        : "var(--chart-2)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
