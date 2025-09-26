// app/analytics/DailyReturnsStrip.tsx
"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, Cell } from "recharts";

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

type Row = {
    day: string; // ISO "YYYY-MM-DD"
    v: number;   // daily P&L (can be negative)
};

interface Props {
    rows: ReadonlyArray<Row>;
    /** Fixed pixel width per bar. */
    barSizePx?: number;
    /** Minimum inner chart width before scrolling. */
    minChartWidthPx?: number;
}

const chartConfig = {
    pnl: {
        label: "Daily Return ($)",
        color: "var(--chart-3)", // positive bars
    },
} satisfies ChartConfig;

export default function DailyReturnsStrip({
    rows,
    barSizePx = 10,
    minChartWidthPx = 720,
}: Props) {
    // HOOKS MUST BE UNCONDITIONAL
    const chartData = React.useMemo(
        () =>
            rows.map((r) => ({
                date: r.day,
                pnl: r.v,
            })),
        [rows]
    );

    const innerWidthPx = React.useMemo(() => {
        const gap = 6; // spacing between bars
        const side = 48; // side padding allowance
        return Math.max(minChartWidthPx, rows.length * (barSizePx + gap) + side);
    }, [rows.length, barSizePx, minChartWidthPx]);

    const formatTick = React.useCallback((value: string): string => {
        const d = new Date(value);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }, []);

    // RENDER
    if (rows.length === 0) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Daily Return ($) — Selected Range</CardTitle>
                    <CardDescription>No data in this range.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card className="py-0">
            <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
                <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:!py-0">
                    <CardTitle>Daily Return ($) — Selected Range</CardTitle>
                    <CardDescription>
                        From <code>daily_return_dollars</code>
                    </CardDescription>
                </div>
            </CardHeader>

            <CardContent className="px-2 sm:p-6">
                {/* Horizontal scroll container */}
                <div className="overflow-x-auto">
                    {/* Fixed inner width so the responsive chart expands and enables scrolling */}
                    <div style={{ width: `${innerWidthPx}px` }}>
                        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
                            <BarChart
                                accessibilityLayer
                                data={chartData}
                                margin={{ left: 12, right: 12 }}
                            >
                                <CartesianGrid vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    minTickGap={28}
                                    interval="preserveStartEnd"
                                    tickFormatter={formatTick}
                                />
                                <ChartTooltip
                                    content={
                                        <ChartTooltipContent
                                            className="w-[180px]"
                                            nameKey="pnl"
                                            labelFormatter={(value) =>
                                                new Date(value as string).toLocaleDateString("en-US", {
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric",
                                                })
                                            }
                                        />
                                    }
                                />
                                <Bar dataKey="pnl" barSize={barSizePx}>
                                    {chartData.map((d) => (
                                        <Cell
                                            key={d.date}
                                            fill={d.pnl >= 0 ? "var(--color-pnl)" : "var(--destructive)"}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
