"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { AvgReturnRow } from "../types";

export function AvgReturnSummaryCard({
  rows,
}: {
  rows: AvgReturnRow[];
}): React.ReactNode {
  return (
    <Card className="rounded-3xl border">
      <CardHeader>
        <CardTitle>Average Return (Bootstrap)</CardTitle>
        <CardDescription>
          Empirical distribution of average returns over horizons
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left py-2 pr-4">Horizon</th>
                <th className="text-right py-2 px-4">Mean</th>
                <th className="text-right py-2 px-4">P5</th>
                <th className="text-right py-2 px-4">Median</th>
                <th className="text-right py-2 pl-4">P95</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.horizonLabel} className="border-b">
                  <td className="py-2 pr-4">{r.horizonLabel}</td>
                  <td className="text-right py-2 px-4">{fmtPct(r.mean)}</td>
                  <td className="text-right py-2 px-4">{fmtPct(r.p5)}</td>
                  <td className="text-right py-2 px-4">{fmtPct(r.p50)}</td>
                  <td className="text-right py-2 pl-4">{fmtPct(r.p95)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function fmtPct(x: number) {
  return `${(x * 100).toFixed(2)}%`;
}
