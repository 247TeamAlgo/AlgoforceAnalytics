"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { StrategyRiskResult } from "@/lib/types";

export default function BreakdownCard({ merged }: { merged: StrategyRiskResult[] }) {
  const vals = merged
    .map((r) => r.breakdown_probability_pct)
    .filter((v): v is number => v != null);

  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">Breakdown Probability</CardTitle>
          <CardDescription className="mt-0.5">% windows failing tests (merged)</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-6 py-5 sm:py-6">
        <div className="text-3xl font-bold leading-none">
          {avg == null ? "–" : `${avg.toFixed(1)}%`}
        </div>
        {/* Optional helper text */}
        <div className="mt-1 text-xs text-muted-foreground">
          Averaged across all cointegrated pairs
        </div>
      </CardContent>
    </Card>
  );
}