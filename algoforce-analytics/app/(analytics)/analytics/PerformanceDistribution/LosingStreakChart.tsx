"use client";
// app/analytics/LosingStreakChart.tsx

import * as React from "react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { MetricsPayload } from "../types";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type WindowSel = "Per Report" | "Daily" | "Weekly";

type Row = {
  account: string;
  perReport_numNegativeStreak: number;
  perReport_maxNegativeStreak: number;
  perReport_meetsThreshold: number;
  perDay_numNegativeStreak: number;
  perDay_maxNegativeStreak: number;
  perDay_meetsThreshold: number;
  perWeek_numNegativeStreak: number;
  perWeek_maxNegativeStreak: number;
  perWeek_meetsThreshold: number;
};

const chartConfig = {
  perReport_numNegativeStreak: { label: "perReport_numNegativeStreak", color: "var(--chart-1)" },
  perReport_maxNegativeStreak: { label: "perReport_maxNegativeStreak", color: "var(--chart-2)" },
  perReport_meetsThreshold:   { label: "perReport_meetsThreshold",   color: "var(--chart-3)" },
  perDay_numNegativeStreak:   { label: "perDay_numNegativeStreak",   color: "var(--chart-1)" },
  perDay_maxNegativeStreak:   { label: "perDay_maxNegativeStreak",   color: "var(--chart-2)" },
  perDay_meetsThreshold:      { label: "perDay_meetsThreshold",      color: "var(--chart-3)" },
  perWeek_numNegativeStreak:  { label: "perWeek_numNegativeStreak",  color: "var(--chart-1)" },
  perWeek_maxNegativeStreak:  { label: "perWeek_maxNegativeStreak",  color: "var(--chart-2)" },
  perWeek_meetsThreshold:     { label: "perWeek_meetsThreshold",     color: "var(--chart-3)" },
} satisfies ChartConfig;

export default function LosingStreakChart({
  perAccounts,
}: {
  perAccounts?: Record<string, MetricsPayload>;
}) {
  const [win, setWin] = React.useState<WindowSel>("Daily");

  const rows = useMemo<Row[]>(() => {
    if (!perAccounts) return [];
    const kv = Object.entries(perAccounts);
    return kv.map(([account, payload]) => {
      const ls = (payload as unknown as { whatsapp_losing_streak?: Array<Row> })
        .whatsapp_losing_streak;

      if (Array.isArray(ls) && ls.length > 0) {
        const r = ls[0]!;
        return {
          account,
          perReport_numNegativeStreak: r.perReport_numNegativeStreak ?? 0,
          perReport_maxNegativeStreak: r.perReport_maxNegativeStreak ?? 0,
          perReport_meetsThreshold: r.perReport_meetsThreshold ?? 0,
          perDay_numNegativeStreak: r.perDay_numNegativeStreak ?? 0,
          perDay_maxNegativeStreak: r.perDay_maxNegativeStreak ?? 0,
          perDay_meetsThreshold: r.perDay_meetsThreshold ?? 0,
          perWeek_numNegativeStreak: r.perWeek_numNegativeStreak ?? 0,
          perWeek_maxNegativeStreak: r.perWeek_maxNegativeStreak ?? 0,
          perWeek_meetsThreshold: r.perWeek_meetsThreshold ?? 0,
        };
      }
      return {
        account,
        perReport_numNegativeStreak: 0,
        perReport_maxNegativeStreak: 0,
        perReport_meetsThreshold: 0,
        perDay_numNegativeStreak: 0,
        perDay_maxNegativeStreak: 0,
        perDay_meetsThreshold: 0,
        perWeek_numNegativeStreak: 0,
        perWeek_maxNegativeStreak: 0,
        perWeek_meetsThreshold: 0,
      };
    });
  }, [perAccounts]);

  // Which three bars to show based on the toggle
  const barKeys: Array<{ key: keyof Row; fillVar: string }> = useMemo(() => {
    if (win === "Per Report") {
      return [
        { key: "perReport_numNegativeStreak", fillVar: "var(--color-perReport_numNegativeStreak)" },
        { key: "perReport_maxNegativeStreak", fillVar: "var(--color-perReport_maxNegativeStreak)" },
        { key: "perReport_meetsThreshold",    fillVar: "var(--color-perReport_meetsThreshold)" },
      ];
    }
    if (win === "Daily") {
      return [
        { key: "perDay_numNegativeStreak",    fillVar: "var(--color-perDay_numNegativeStreak)" },
        { key: "perDay_maxNegativeStreak",    fillVar: "var(--color-perDay_maxNegativeStreak)" },
        { key: "perDay_meetsThreshold",       fillVar: "var(--color-perDay_meetsThreshold)" },
      ];
    }
    return [
      { key: "perWeek_numNegativeStreak",   fillVar: "var(--color-perWeek_numNegativeStreak)" },
      { key: "perWeek_maxNegativeStreak",   fillVar: "var(--color-perWeek_maxNegativeStreak)" },
      { key: "perWeek_meetsThreshold",      fillVar: "var(--color-perWeek_meetsThreshold)" },
    ];
  }, [win]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle className="leading-tight">Losing Streak Monitor</CardTitle>
            <CardDescription className="mt-0.5">
              {rows.length ? `Loaded ${rows.length} account${rows.length === 1 ? "" : "s"}` : "No data"}
            </CardDescription>
          </div>

          {/* Controls top-right (matches RollingSharpeCard pattern) */}
          <div className="px-6 pb-3 sm:py-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs sm:text-sm">Window</Label>
              <ToggleGroup
                type="single"
                value={win}
                onValueChange={(v) => v && setWin(v as WindowSel)}
                className="h-8"
              >
                <ToggleGroupItem value="Per Report" className="h-8 px-2">
                  Per Report
                </ToggleGroupItem>
                <ToggleGroupItem value="Daily" className="h-8 px-2">
                  Daily
                </ToggleGroupItem>
                <ToggleGroupItem value="Weekly" className="h-8 px-2">
                  Weekly
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-6">
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
            <BarChart accessibilityLayer data={rows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="account" tickLine={false} tickMargin={10} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
              {barKeys.map(({ key, fillVar }) => (
                <Bar key={String(key)} dataKey={key as string} fill={fillVar} radius={4} />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}