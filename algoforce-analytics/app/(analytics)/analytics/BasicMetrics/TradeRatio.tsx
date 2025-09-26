// FILE: app/analytics/TradeRatio.tsx
"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TradeRatioProps = {
    winRatePct: number | null;
    totalTrades: number;
};

export default function TradeRatio({ winRatePct, totalTrades }: TradeRatioProps) {
    const pos = winRatePct != null ? Math.round((winRatePct / 100) * totalTrades) : 0;
    const neg = Math.max(0, totalTrades - pos);
    const denom = Math.max(1, totalTrades);
    const posPct = (pos / denom) * 100;
    const negPct = 100 - posPct;

    return (
        <Card className="metric-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Trade Ratio</CardTitle>
                <CardDescription>Wins vs losses (approx)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                    {/* Wins (green to match bar) */}
                    <div className="text-3xl font-bold text-chart-3">
                        {posPct.toFixed(1)}%
                    </div>
                    {/* Losses (red to match bar) */}
                    <div className="text-3xl font-bold text-destructive">
                        {negPct.toFixed(1)}%
                    </div>
                </div>

                <div className="h-5 w-full overflow-hidden rounded-full ring-1 ring-border">
                    <div className="h-full bg-chart-3 inline-block" style={{ width: `${posPct}%` }} />
                    <div className="h-full bg-destructive/70 inline-block" style={{ width: `${negPct}%` }} />
                </div>

                <div className="flex items-center justify-between text-xs">
                    <span className="text-chart-3 font-medium">{pos.toLocaleString()} Positive</span>
                    <span className="text-destructive font-medium">{neg.toLocaleString()} Negative</span>
                </div>
            </CardContent>
        </Card>
    );
}
