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
import type { RunProbRow, RunProbabilities } from "@/app/(analytics)/analytics_adem_1_josh/prob_loss_k";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WindowSel = "Daily" | "Weekly";

type Row = {
  kLabel: string;     // "k=1", "k=2", ...
  empirical: number;  // 0..1
  iid: number;        // 0..1
};

const chartConfig = {
  empirical: { label: "Empirical", color: "var(--chart-1)" },
  iid: { label: "IID", color: "var(--chart-2)" },
} satisfies ChartConfig;

export default function ProbLossKChart({
  perAccounts,
  title = "P(run ≥ k losses)",
}: {
  perAccounts?: Record<string, MetricsPayload>;
  title?: string;
}) {
  const [win, setWin] = React.useState<WindowSel>("Daily");

  // Collect available account keys from provided payload
  const accountKeys = useMemo(
    () => (perAccounts ? Object.keys(perAccounts) : []),
    [perAccounts]
  );

  // Selected account (default: first)
  const [accountKey, setAccountKey] = React.useState<string | undefined>(() =>
    accountKeys.length ? accountKeys[0] : undefined
  );

  // Keep the selection valid if the list changes
  React.useEffect(() => {
    if (!accountKeys.length) {
      setAccountKey(undefined);
    } else if (!accountKey || !accountKeys.includes(accountKey)) {
      setAccountKey(accountKeys[0]);
    }
  }, [accountKeys, accountKey]);

  // Build rows for recharts from the selected account + window
  const rows = useMemo<Row[]>(() => {
    if (!perAccounts || !accountKey) return [];
    const payload = perAccounts[accountKey];
    if (!payload) return [];

    // MetricsPayload may not declare this field in your local import;
    // read it defensively to avoid TS errors across files.
    const arr =
      (payload as unknown as { whatsapp_prob_loss_k?: RunProbRow[] })
        .whatsapp_prob_loss_k;

    if (!Array.isArray(arr) || arr.length === 0) return [];

    // Usually computeRunProbabilities(accountKey, ks) returns a single row for that account.
    const row = arr.find((r) => r.account === accountKey) ?? arr[0];

    const series: RunProbabilities[] =
      win === "Daily" ? row.daily : row.weekly;

    if (!Array.isArray(series) || series.length === 0) return [];

    return series.map((p) => ({
      kLabel: `k=${p.k}`,
      empirical: Number((p.empirical ?? 0).toFixed(6)),
      iid: Number((p.iid ?? 0).toFixed(6)),
    }));
  }, [perAccounts, accountKey, win]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle className="leading-tight">{title}</CardTitle>
            <CardDescription className="mt-0.5">
              {accountKey ? `${accountKey} • ${win}` : "No account selected"}
            </CardDescription>
          </div>

          {/* Controls (top-right): Account + Window (matches your other cards) */}
          <div className="px-6 pb-3 sm:py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs sm:text-sm">Account</Label>
                <Select
                  value={accountKey}
                  onValueChange={(v) => setAccountKey(v)}
                  disabled={!accountKeys.length}
                >
                  <SelectTrigger className="h-8 w-[200px]">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountKeys.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs sm:text-sm">Window</Label>
                <ToggleGroup
                  type="single"
                  value={win}
                  onValueChange={(v) => v && setWin(v as WindowSel)}
                  className="h-8"
                >
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
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-6">
        {!accountKey || rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[240px] w-full"
          >
            <BarChart accessibilityLayer data={rows}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="kLabel"
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
                      return [`${(n * 100).toFixed(1)}%`, name === "empirical" ? "Empirical" : "IID"];
                    }}
                    labelFormatter={(label: string) => label}
                  />
                }
              />
              <Bar
                dataKey="empirical"
                fill="var(--color-empirical)"
                radius={4}
              />
              <Bar dataKey="iid" fill="var(--color-iid)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
