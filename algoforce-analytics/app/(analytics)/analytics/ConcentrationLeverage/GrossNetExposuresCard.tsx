"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ConcentrationMerged } from "./ConcentrationLeverageTab";

export default function GrossNetExposuresCard({
  merged,
}: {
  merged: ConcentrationMerged;
}) {
  const data = merged.symbolExposures ?? [];

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">Gross / Net Exposures</CardTitle>
          <CardDescription className="mt-0.5">Per crypto asset</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={{
            gross: { label: "Gross", color: "var(--chart-1)" },
            net: { label: "Net", color: "var(--chart-2)" },
          }}
          className="aspect-auto h-[240px] w-full"
        >
          <BarChart data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="symbol" tickMargin={8} />
            <YAxis width={70} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, props) => {
                    const symbol = (props?.payload as { symbol?: string })?.symbol ?? "";
                    const v = value == null ? "–" : String(value);
                    return [v, `${name} (${symbol})`];
                  }}
                />
              }
            />
            <Bar dataKey="gross" fill="var(--chart-1)" radius={4} />
            <Bar dataKey="net" fill="var(--chart-2)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}