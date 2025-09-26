// app/analytics/cards/WinrateBarsCard.tsx
"use client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Tooltip } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import type { HistoricalBucket } from "@/app/(analytics)/analytics/types";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";

export default function WinrateBarsCard({
  title, subtitle, rows,
}: { title: string; subtitle?: string; rows: HistoricalBucket[] }) {
  const data = rows.map(r => ({ label: r.label, winrate: r.winrate_pct ?? 0, count: r.count }));

  const tooltipFormatter = (value: ValueType, _name: NameType) => {
    const num = Array.isArray(value) ? Number(value[0] as number) : Number(value);
    const txt = Number.isFinite(num) ? `${num.toFixed(2)}%` : String(value);
    return [txt, " Win-rate"] as [string, string];
  };

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">{title}</CardTitle>
          {subtitle && <CardDescription className="mt-0.5">{subtitle}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={{ winrate: { label: "Win-rate %", color: "var(--chart-1)" } }}
          className="w-full h-[420px]"
        >
          <BarChart data={data} layout="vertical" margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
            <CartesianGrid horizontal vertical={false} />
            <YAxis type="category" dataKey="label" width={200} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<ChartTooltipContent formatter={tooltipFormatter} labelFormatter={(lab) => String(lab)} />} />
            <Bar dataKey="winrate" fill="var(--chart-1)" radius={4}>
              <LabelList dataKey="winrate" position="right" formatter={(v: unknown) => `${Number(v ?? 0).toFixed(1)}%`} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
