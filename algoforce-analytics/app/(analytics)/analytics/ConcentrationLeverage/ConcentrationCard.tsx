"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { ConcentrationMerged } from "./ConcentrationLeverageTab";

export default function ConcentrationCard({
  merged,
}: {
  merged: ConcentrationMerged;
}) {
  const v = merged.concentration?.largest_pair_pct ?? null;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">Concentration Risk</CardTitle>
          <CardDescription className="mt-0.5">Largest pair % of portfolio</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-6 py-6 text-3xl font-bold">
        {v == null ? "–" : `${v.toFixed(1)}%`}
      </CardContent>
    </Card>
  );
}