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
import type { MetricsPayload } from "../../lib/types";

type Row = { account: string; streak: number };

const chartConfig: ChartConfig = {
  streak: { label: "Current Losing Streak (days)", color: "var(--chart-3)" },
};

function currentLosingStreak(
  rows: MetricsPayload["daily_return_last_n_days"]["daily_rows"]
): number {
  // Definition: if daily return is negative, counter += 1 else counter = 0
  let cur = 0;
  for (const r of rows) {
    // Prefer provided daily_return_pct; fallback to net/start_balance
    const pct =
      r.daily_return_pct ??
      (r.start_balance > 0 ? (r.net_pnl / r.start_balance) * 100 : 0);
    if (pct < 0) cur += 1;
    else cur = 0;
  }
  return cur;
}

export default function ConsecutiveLosingDaysCard({
  perAccounts,
}: {
  perAccounts?: Record<string, MetricsPayload>;
}) {
  const data: Row[] = React.useMemo(() => {
    if (!perAccounts) return [];
    const out: Row[] = [];
    for (const [acct, payload] of Object.entries(perAccounts)) {
      const rows = payload.daily_return_last_n_days.daily_rows;
      out.push({ account: acct, streak: currentLosingStreak(rows) });
    }
    out.sort((a, b) => b.streak - a.streak);
    return out;
  }, [perAccounts]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">
            Consecutive Losing Days
          </CardTitle>
          <CardDescription className="mt-0.5">
            Per account over the selected range
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
                dataKey="account"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
              />
              <YAxis width={56} allowDecimals={false} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dashed" />}
              />
              <Bar dataKey="streak" radius={4} fill="var(--chart-3)" />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
