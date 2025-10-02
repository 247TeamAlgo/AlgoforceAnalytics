// app/(analytics)/analytics/components/performance-metrics/CombinedPerformanceMTDCard.tsx
"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
import { Badge } from "@/components/ui/badge";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import type { BulkMetricsResponse } from "../../hooks/useAnalyticsData";

/* ----------------- helpers ----------------- */
function num(n: unknown, fallback = 0): number {
  if (typeof n === "number") return Number.isFinite(n) ? n : fallback;
  if (typeof n === "string") {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }
  return fallback;
}
function usd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const f = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (v < 0 ? "-" : "") + "$" + f.format(Math.abs(v));
}
function pct(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${(v * 100).toFixed(2)}%`;
}

/** Find the nearest key ≤ target, assuming ISO8601 sortable keys. */
function nearestKeyAtOrBefore(keys: string[], target: string): string | null {
  if (!keys.length) return null;
  const i = keys.findIndex((k) => k > target);
  if (i === -1) return keys[keys.length - 1]!;
  if (i === 0) return null;
  return keys[i - 1]!;
}

/** Find the nearest key ≥ target, assuming ISO8601 sortable keys. */
function nearestKeyAtOrAfter(keys: string[], target: string): string | null {
  if (!keys.length) return null;
  const i = keys.findIndex((k) => k >= target);
  return i === -1 ? null : keys[i]!;
}

/** Sum ONLY selected accounts from the row. No fallback to 'total'. */
function sumSelectedFromRow(
  row: Record<string, unknown> | undefined,
  accounts: readonly string[]
): number {
  if (!row) return 0;
  let s = 0;
  for (const acc of accounts) {
    if (row[acc] != null) s += num(row[acc], 0);
  }
  return s;
}

/* -------------- chart config -------------- */
const chartCfg: ChartConfig = {
  dd: { label: "Drawdown", color: "var(--chart-2)" },
  ret: { label: "Return", color: "var(--primary)" },
};

export default function CombinedPerformanceMTDCard({
  bulk,
  levels = [
    { value: 0.01, label: "-1%" },
    { value: 0.02, label: "-2%" },
    { value: 0.03, label: "-3%" },
    { value: 0.04, label: "-4%" },
    { value: 0.05, label: "-5%" },
    { value: 0.06, label: "-6%" },
  ],
  levelColors = [
    "var(--chart-5)",
    "#FFA94D",
    "#FF7043",
    "var(--chart-1)",
    "#C62828",
    "#C62828",
  ],
  ddDefault = "#39A0ED",
}: {
  bulk: BulkMetricsResponse;
  levels?: { value: number; label?: string }[];
  levelColors?: string[];
  ddDefault?: string;
}) {
  const windowLabel =
    bulk?.window?.startDay && bulk?.window?.endDay
      ? `${bulk.window.startDay} → ${bulk.window.endDay}`
      : "MTD";

  const accs = React.useMemo(
    () => (bulk?.accounts ?? []) as string[],
    [bulk?.accounts]
  );

  // ---- lock balance badges to the displayed window (prevents “data drift”)
  const sortedBalanceKeys = React.useMemo(() => {
    const ks = Object.keys(bulk?.balance ?? {});
    ks.sort(); // ISO-safe sort
    return ks;
  }, [bulk?.balance]);

  const windowStart = bulk?.window?.startDay ?? null;
  const windowEnd = bulk?.window?.endDay ?? null;

  const startKey = React.useMemo(() => {
    if (windowStart) return nearestKeyAtOrAfter(sortedBalanceKeys, windowStart);
    return sortedBalanceKeys[0] ?? null;
  }, [sortedBalanceKeys, windowStart]);

  const endKey = React.useMemo(() => {
    if (windowEnd) return nearestKeyAtOrBefore(sortedBalanceKeys, windowEnd);
    return sortedBalanceKeys[sortedBalanceKeys.length - 1] ?? null;
  }, [sortedBalanceKeys, windowEnd]);

  const startBal = React.useMemo(
    () =>
      sumSelectedFromRow(startKey ? bulk.balance[startKey] : undefined, accs),
    [bulk.balance, startKey, accs]
  );

  const latestBal = React.useMemo(
    () => sumSelectedFromRow(endKey ? bulk.balance[endKey] : undefined, accs),
    [bulk.balance, endKey, accs]
  );

  const deltaBal = latestBal - startBal;

  // --- DRAWDOWN / RETURN (use backend values directly)
  const ddTotal = num(bulk?.combinedLiveMonthlyDrawdown?.total, 0); // signed (e.g., -0.0233)
  const retTotal = num(bulk?.combinedLiveMonthlyReturn?.total, 0); // signed (e.g., -0.0363)

  // drawdown thresholds & color (bar uses absolute magnitude, label shows backend sign)
  const orderedLevels = React.useMemo(
    () => [...levels].sort((a, b) => a.value - b.value),
    [levels]
  );
  const ddAbs = Math.abs(ddTotal);

  const ddCrossIdx = React.useMemo(() => {
    let idx = -1;
    for (let i = 0; i < orderedLevels.length; i += 1) {
      if (ddAbs >= orderedLevels[i]!.value) idx = i;
      else break;
    }
    return idx;
  }, [ddAbs, orderedLevels]);

  const ddColor =
    ddCrossIdx >= 0 ? (levelColors[ddCrossIdx] ?? ddDefault) : ddDefault;

  const ddLegend = orderedLevels.map((l, i) => ({
    x: l.value,
    label: l.label ?? `-${(l.value * 100).toFixed(1)}%`,
    color: levelColors[i] ?? ddDefault,
  }));

  // layout
  const [size, setSize] = React.useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const barSize = Math.max(
    18,
    Math.min(44, Math.round(size.w < 520 ? 34 : 40))
  );
  const gapY = Math.round(barSize * 0.38);
  const yAxisWidth = 172;
  const margins = { left: 0, right: 56, top: 24, bottom: 8 };
  const sectionHeight = barSize + gapY + margins.top + margins.bottom + 8;

  // domains
  const xMaxDD =
    Math.max(ddAbs, ...orderedLevels.map((l) => l.value), 0.02) * 1.08;
  const retAbs = Math.abs(retTotal);
  const xMaxRet = Math.max(0.02, retAbs) * 1.25;

  // rows
  const ddRows = React.useMemo(
    () => [
      {
        k: "Combined (selected)",
        v: ddAbs,
        label: `Drawdown: ${pct(ddTotal)}`,
      },
    ],
    [ddAbs, ddTotal]
  );
  const retRows = React.useMemo(
    () => [
      {
        k: "Combined (selected)",
        v: retTotal,
        label: `Return: ${pct(retTotal)}`,
      },
    ],
    [retTotal]
  );

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>Combined Performance — MTD</CardTitle>
            <CardDescription className="text-base">
              {windowLabel}
            </CardDescription>
          </div>

          {/* Selected-accounts balance badges (no “combined-all” total, no bottom section) */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="text-sm px-3 py-1.5 rounded-full shadow-sm"
            >
              Latest:{" "}
              <span className="ml-1 font-semibold">{usd(latestBal)}</span>
            </Badge>
            <Badge
              variant="secondary"
              className="text-sm px-3 py-1.5 rounded-full shadow-sm"
            >
              Start: <span className="ml-1 font-semibold">{usd(startBal)}</span>
            </Badge>
            <Badge
              variant="secondary"
              className="text-sm px-3 py-1.5 rounded-full shadow-sm"
            >
              Sum: <span className="ml-1 font-semibold">{usd(deltaBal)}</span>
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent ref={ref} className="p-3 sm:p-4">
        {/* ---- Drawdown (MTD) ---- */}
        <div className="px-1 pb-1">
          <div className="mb-1 text-sm sm:text-base font-medium text-foreground">
            Drawdown (MTD)
          </div>
          <ChartContainer
            config={chartCfg}
            className="w-full"
            style={{ height: `${sectionHeight}px` }}
          >
            <BarChart
              accessibilityLayer
              data={ddRows}
              layout="vertical"
              barCategoryGap={gapY}
              margin={{ ...margins }}
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="k"
                type="category"
                width={yAxisWidth}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                tick={{ fontSize: 13, fontWeight: 600 }}
              />
              <XAxis
                type="number"
                domain={[0, xMaxDD]}
                tickFormatter={(v: number) => `-${Math.round(v * 100)}%`}
              />

              {ddLegend.map((it) => (
                <ReferenceLine
                  key={`thr-${it.label}`}
                  x={it.x}
                  stroke={it.color}
                  strokeDasharray="6 6"
                  label={{
                    value: it.label,
                    position: "top",
                    fill: it.color,
                    fontSize: 12,
                  }}
                />
              ))}

              <ChartTooltip
                cursor={{ strokeOpacity: 0.08 }}
                content={() => null}
              />

              <Bar
                dataKey="v"
                layout="vertical"
                radius={6}
                barSize={barSize}
                isAnimationActive={false}
              >
                <Cell fill={ddColor} />
                <LabelList
                  dataKey="v"
                  position="right"
                  offset={10}
                  className="fill-foreground"
                  formatter={() => ddRows[0]!.label}
                  fontSize={14}
                  fontWeight={700}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>

        {/* ---- Return (MTD) ---- */}
        <div className="px-1 pt-5">
          <div className="mb-1 text-sm sm:text-base font-medium text-foreground">
            Return (MTD)
          </div>
          <ChartContainer
            config={chartCfg}
            className="w-full"
            style={{ height: `${sectionHeight}px` }}
          >
            <BarChart
              accessibilityLayer
              data={retRows}
              layout="vertical"
              barCategoryGap={gapY}
              margin={{ ...margins }}
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="k"
                type="category"
                width={yAxisWidth}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                tick={{ fontSize: 13, fontWeight: 600 }}
              />
              <XAxis
                type="number"
                domain={[-xMaxRet, xMaxRet]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              />
              <ReferenceLine
                x={0}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
              />

              <Bar
                dataKey="v"
                layout="vertical"
                radius={6}
                barSize={barSize}
                isAnimationActive={false}
              >
                <Cell
                  fill={
                    retRows[0]!.v >= 0 ? "var(--chart-3)" : "var(--destructive)"
                  }
                />
                <LabelList
                  dataKey="v"
                  position="right"
                  offset={10}
                  className="fill-foreground"
                  formatter={() => retRows[0]!.label}
                  fontSize={14}
                  fontWeight={700}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
