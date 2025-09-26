"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { PnLBreakdown } from "../types";

export function PnLBreakdownCard({
  data,
}: {
  data: PnLBreakdown;
}): React.ReactNode {
  return (
    <Card className="rounded-3xl border">
      <CardHeader>
        <CardTitle>PnL Breakdown</CardTitle>
        <CardDescription>
          Compounded total, mean, std, hit ratio
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left py-2 pr-4">Frequency</th>
                <th className="text-right py-2 px-4">Observations</th>
                <th className="text-right py-2 px-4">Total Return</th>
                <th className="text-right py-2 px-4">Mean</th>
                <th className="text-right py-2 px-4">Std</th>
                <th className="text-right py-2 pl-4">Hit Ratio</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.freq} className="border-b">
                  <td className="py-2 pr-4">{r.freq}</td>
                  <td className="text-right py-2 px-4">{r.observations}</td>
                  <td className="text-right py-2 px-4">
                    {fmtPct(r.totalReturn)}
                  </td>
                  <td className="text-right py-2 px-4">{fmtPct(r.mean)}</td>
                  <td className="text-right py-2 px-4">{fmtPct(r.std)}</td>
                  <td className="text-right py-2 pl-4">{fmtPct(r.hitRatio)}</td>
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
