"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { RunLenRow } from "../types";

export function RunLengthProbabilityCard({
  rows,
}: {
  rows: RunLenRow[];
}): React.ReactNode {
  // group by horizon
  const byHorizon = rows.reduce(
    (acc, r) => {
      (acc[r.horizonLabel] ||= []).push(r);
      return acc;
    },
    {} as Record<string, RunLenRow[]>
  );

  // sort ks ascending within each horizon
  Object.values(byHorizon).forEach((arr) => arr.sort((a, b) => a.k - b.k));

  return (
    <Card className="rounded-3xl border">
      <CardHeader>
        <CardTitle>Losing Streak Probability</CardTitle>
        <CardDescription>
          Prob. of losing more than k periods in a row
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.keys(byHorizon).map((h) => (
          <div key={h} className="overflow-x-auto">
            <div className="text-sm font-semibold mb-2">{h}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-2 pr-4">k</th>
                  <th className="text-right py-2 pl-4">Probability</th>
                </tr>
              </thead>
              <tbody>
                {byHorizon[h].map((row) => (
                  <tr key={`${h}-${row.k}`} className="border-b">
                    <td className="py-2 pr-4">{row.k}</td>
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
