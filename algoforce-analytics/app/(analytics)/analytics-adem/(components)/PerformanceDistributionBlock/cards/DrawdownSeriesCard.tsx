"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { DatedPoint } from "../types";

export function DrawdownSeriesCard({
  data,
  title = "Underwater",
  description = "Drawdown from peak (primary series)",
}: {
  data: DatedPoint[];
  title?: string;
  description?: string;
}): React.ReactNode {
  return (
    <Card className="rounded-3xl border">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ dd: { label: "Drawdown", color: "var(--chart-5)" } }}
          className="h-[300px] w-full"
        >
          <AreaChart data={data} margin={{ left: 12, right: 12 }}>
            <defs>
              <linearGradient id="fillDD" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-dd)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-dd)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} className="stroke-muted/40" />
            <YAxis
              width={56}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(v) =>
                new Date(v).toLocaleDateString(undefined, { month: "short" })
              }
            />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<ChartTooltipContent />}
              formatter={(val: unknown) => {
                const num = typeof val === "number" ? val : Number(val);
                return [`${(num * 100).toFixed(2)}%`, "Drawdown"];
              }}
            />
            <Area
              dataKey="value"
              name="Drawdown"
              type="monotone"
              fill="url(#fillDD)"
              stroke="var(--color-dd)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
