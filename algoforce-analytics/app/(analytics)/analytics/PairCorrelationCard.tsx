"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { ConcentrationMerged } from "./ConcentrationLeverage/ConcentrationLeverageTab";

export default function PairCorrelationCard({
  merged,
}: {
  merged: ConcentrationMerged;
  perAccounts?: Record<string, ConcentrationMerged>;
}) {
  const corr = merged.corrMatrix ?? {};
  const pairs = Object.keys(corr);

  if (!pairs.length) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">Pair Correlations</CardTitle>
            <CardDescription className="mt-0.5">No data</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="py-0 overflow-x-auto">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-4 pb-3 sm:py-3">
          <CardTitle className="leading-tight">Pair Correlations</CardTitle>
          <CardDescription className="mt-0.5">Between cointegrated pairs</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1 border">Pair</th>
              {pairs.map((p) => (
                <th key={p} className="px-2 py-1 border text-center">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pairs.map((a) => (
              <tr key={a}>
                <td className="px-2 py-1 border font-medium">{a}</td>
                {pairs.map((b) => (
                  <td key={b} className="px-2 py-1 border text-center">
                    {corr[a]?.[b] == null ? "–" : corr[a][b]!.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}