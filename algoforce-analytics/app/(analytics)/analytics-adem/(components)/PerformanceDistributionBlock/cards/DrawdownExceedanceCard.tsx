"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { DDProbPoint } from "../types";

export function DrawdownExceedanceCard({
  data,
}: {
  data: DDProbPoint[];
}): React.ReactNode {
  // Group by horizon label for readability
  const byHorizon = groupBy(data, (d) => d.horizonLabel);

  return (
    <Card className="rounded-3xl border">
      <CardHeader>
        <CardTitle>Drawdown Exceedance</CardTitle>
        <CardDescription>
          Probability of max drawdown exceeding X% over horizon
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.keys(byHorizon).map((h) => (
          <div key={h} className="overflow-x-auto">
            <div className="text-sm font-semibold mb-2">{h}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-2 pr-4">Threshold</th>
                  <th className="text-right py-2 pl-4">Probability</th>
                </tr>
              </thead>
              <tbody>
                {byHorizon[h].map((row) => (
                  <tr key={`${h}-${row.thresholdPct}`} className="border-b">
                    <td className="py-2 pr-4">{row.thresholdPct}%</td>
                    <td className="text-right py-2 pl-4">
                      {(row.probability * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function groupBy<T>(arr: T[], keyfn: (x: T) => string): Record<string, T[]> {
  return arr.reduce(
    (acc, x) => {
      const k = keyfn(x);
      (acc[k] ||= []).push(x);
      return acc;
    },
    {} as Record<string, T[]>
  );
}
