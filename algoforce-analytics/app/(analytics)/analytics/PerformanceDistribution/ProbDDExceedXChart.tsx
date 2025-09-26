"use client";
// app/analytics/ProbDDExceedXChart.tsx

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

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PRow = { threshold: number; probability: number };
type Row = { thresholdLabel: string; probability: number };

const chartConfig = {
  probability: { label: "Probability", color: "var(--chart-2)" },
} satisfies ChartConfig;

export default function ProbDDExceedChart({
  perAccounts,
  title = "P(DD ≥ X%) — Threshold Exceedance",
}: {
  perAccounts?: Record<string, MetricsPayload>;
  title?: string;
}) {
  // Available accounts
  const accountKeys = useMemo(
    () => (perAccounts ? Object.keys(perAccounts) : []),
    [perAccounts]
  );

  // Selected account (defaults to first available)
  const [accountKey, setAccountKey] = React.useState<string | undefined>(() =>
    accountKeys.length ? accountKeys[0] : undefined
  );

  // Keep selection valid if the list changes
  React.useEffect(() => {
    if (!accountKeys.length) {
      setAccountKey(undefined);
    } else if (!accountKey || !accountKeys.includes(accountKey)) {
      setAccountKey(accountKeys[0]);
    }
  }, [accountKeys, accountKey]);

  // Build rows from whichever field is present:
  // prefer explicit daily, then weekly, then generic.
  const rows = useMemo<Row[]>(() => {
    if (!perAccounts || !accountKey) return [];
    const payload = perAccounts[accountKey];
    if (!payload) return [];

    const anyObj = payload as unknown as Record<string, unknown>;
    const daily = anyObj["whatsapp_prob_dd_exceed_daily"] as PRow[] | undefined;
    const weekly = anyObj["whatsapp_prob_dd_exceed_weekly"] as PRow[] | undefined;
    const generic = anyObj["whatsapp_prob_dd_exceed"] as PRow[] | undefined;

    const picked: PRow[] | undefined = daily ?? weekly ?? generic;
    if (!Array.isArray(picked) || picked.length === 0) return [];

    return picked.map((r) => ({
      thresholdLabel: `${(r.threshold * 100).toFixed(0)}%`,
      probability: Number((r.probability ?? 0).toFixed(6)),
    }));
  }, [perAccounts, accountKey]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle className="leading-tight">{title}</CardTitle>
            <CardDescription className="mt-0.5">
              {accountKey ?? "No account selected"}
            </CardDescription>
          </div>

          {/* Controls (top-right): Account picker only */}
          <div className="px-6 pb-3 sm:py-3">
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
                dataKey="thresholdLabel"
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
                    formatter={(val) => {
                      const n = typeof val === "number" ? val : Number(val ?? 0);
                      return [`${(n * 100).toFixed(1)}%`, "Probability"];
                    }}
                    labelFormatter={(label: string) => `Threshold ${label}`}
                  />
                }
              />
              <Bar dataKey="probability" fill="var(--chart-2)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
