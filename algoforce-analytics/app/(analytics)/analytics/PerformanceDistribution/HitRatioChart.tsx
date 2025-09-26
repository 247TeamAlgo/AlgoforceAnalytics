"use client";

import * as React from "react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
import type { HitRatioRow } from "@/app/(analytics)/analytics_adem_1_josh/hit_ratio";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type WindowSel = "Daily" | "Weekly" | "Per Report";

type Row = {
  label: string;   // account key on x-axis
  winRate: number; // 0..1
  lossRate: number; // 0..1
};

const chartConfig = {
  winRate: { label: "Win Rate", color: "var(--chart-1)" },
  lossRate: { label: "Loss Rate", color: "var(--chart-2)" },
} satisfies ChartConfig;

function clamp01(x: number | null | undefined): number {
  const n = typeof x === "number" ? x : 0;
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export default function HitRatioChart({
  perAccounts,
  title = "Hit Ratio (Win/Loss)",
}: {
  perAccounts?: Record<string, MetricsPayload>;
  title?: string;
}) {
  const [win, setWin] = React.useState<WindowSel>("Daily");

  // All account keys (x-axis categories)
  const accountKeys = useMemo<string[]>(
    () => (perAccounts ? Object.keys(perAccounts) : []),
    [perAccounts]
  );

  // Build rows for *all* accounts using the selected window
  const rows = useMemo<Row[]>(() => {
    if (!perAccounts) return [];
    const out: Row[] = [];

    for (const accountKey of Object.keys(perAccounts)) {
      const payload = perAccounts[accountKey];
      if (!payload) continue;

      const arr =
        (payload as unknown as { whatsapp_hit_ratio?: HitRatioRow[] })
          .whatsapp_hit_ratio;
      if (!Array.isArray(arr) || arr.length === 0) continue;

      const found = arr.find((r) => r.account === accountKey) ?? arr[0];

      let w = 0;
      let l = 0;
      if (win === "Per Report") {
        w = found.perReport_winRate;
        l = found.perReport_lossRate;
      } else if (win === "Daily") {
        w = found.perDay_winRate;
        l = found.perDay_lossRate;
      } else {
        w = found.perWeek_winRate;
        l = found.perWeek_lossRate;
      }

      out.push({
        label: accountKey,
        winRate: Number(clamp01(w).toFixed(6)),
        lossRate: Number(clamp01(l).toFixed(6)),
      });
    }

    // optional: keep accounts sorted alphabetically
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [perAccounts, win]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle className="leading-tight">{title}</CardTitle>
            <CardDescription className="mt-0.5">
              {accountKeys.length ? `${accountKeys.length} accounts • ${win}` : "No accounts"}
            </CardDescription>
          </div>

          {/* Controls (top-right): Window only */}
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
        {!rows.length ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[320px] w-full"
          >
            <BarChart accessibilityLayer data={rows}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
              />
              <YAxis
                width={56}
                domain={[0, 1]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dashed"
                    formatter={(val, name) => {
                      const n =
                        typeof val === "number" ? val : Number(val ?? 0);
                      return [
                        `${(n * 100).toFixed(1)}%`,
                        name === "winRate" ? "Win Rate" : "Loss Rate",
                      ];
                    }}
                    labelFormatter={(label: string) => label}
                  />
                }
              />
              <Bar dataKey="winRate" fill="var(--chart-1)" radius={4} />
              <Bar dataKey="lossRate" fill="var(--chart-2)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
