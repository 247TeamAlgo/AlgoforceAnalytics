// app/analytics/perf/ui/cards/LosingStreakMonitorCard.tsx
"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
  Cell,
  ReferenceLine,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { StreakSummary } from "../types";

export const description = "Losing streaks with a top ruler axis";

type Row = { label: string; run: number };

const chartConfig = {
  run: {
    label: "Losing streak length",
    color: "var(--chart-1)",
  },
  label: {
    color: "var(--background)",
  },
} satisfies ChartConfig;

// Token-only coloring (no HSL): safe color below threshold; destructive at/above
function barFill(run: number, k: number): string {
  return run >= k ? "var(--chart-6)" : "var(--chart-1)";
}

export function LosingStreakMonitorCard({
  streaks,
  thresholdK = 4,
}: {
  streaks: StreakSummary;
  /** Red zone threshold (at/above -> red) */
  thresholdK?: number;
}): React.ReactNode {
  // Use ALL accounts; list is already sorted by current run desc upstream
  const rows: Row[] = React.useMemo(
    () =>
      streaks.byAccountCurrent.map((a) => ({
        label: a.account,
        run: Math.max(0, a.run),
      })),
    [streaks]
  );

  const maxRun = rows.reduce((m, r) => Math.max(m, r.run), 0);
  const xMax = Math.max(thresholdK + 1, maxRun + 1);
  const xDomain: [number, number] = [0, xMax];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Losing Streak Monitor</CardTitle>
        <CardDescription>
          Current loss runs by account with threshold coloring (k = {thresholdK}
          )
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart
            accessibilityLayer
            data={rows}
            layout="vertical"
            margin={{ right: 16 }}
          >
            {/* Ruler-style vertical grid lines */}
            <CartesianGrid horizontal={false} />

            {/* Category axis hidden (labels rendered via LabelList) */}
            <YAxis dataKey="label" type="category" hide />

            {/* Top ruler axis with explicit label showing the limit */}
            <XAxis
              dataKey="run"
              type="number"
              orientation="top"
              domain={xDomain}
              allowDecimals={false}
              tickLine={false}
              axisLine
              label={{
                value: `Losing streak length (max = ${thresholdK})`,
                position: "top",
                offset: 8,
              }}
            />

            {/* Dashed reference line at the threshold */}
            <ReferenceLine
              x={thresholdK}
              stroke="var(--destructive)"
              strokeDasharray="4 4"
            />

            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />

            <Bar dataKey="run" layout="vertical" radius={4}>
              {/* Left: account label */}
              <LabelList
                dataKey="label"
                position="insideLeft"
                offset={8}
                className="fill-[var(--color-label)]"
                fontSize={12}
              />
              {/* Right: numeric run value */}
              <LabelList
                dataKey="run"
                position="right"
                offset={8}
                className="fill-foreground"
                fontSize={12}
              />
              {/* Per-bar fills via Cells (no HSL) */}
              {rows.map((r, i) => (
                <Cell key={i} fill={barFill(r.run, thresholdK)} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>

      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          X-axis shows losing streak length; bars turn red at ≥ {thresholdK}.{" "}
          <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">
          Shows all accounts (no overall summary bar).
        </div>
      </CardFooter>
    </Card>
  );
}
