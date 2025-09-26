"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { RollingTable, YTDRow } from "../types";

export function RollingRiskTableCard({
  data,
}: {
  data: { table: RollingTable; ytd: YTDRow[] };
}): React.ReactNode {
  const { table, ytd } = data;

  return (
    <Card className="rounded-3xl border">
      <CardHeader>
        <CardTitle>Rolling Risk</CardTitle>
        <CardDescription>
          Windowed annualized metrics + YTD summary
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left py-2 pr-4">Window</th>
                <th className="text-right py-2 px-4">Sharpe</th>
                <th className="text-right py-2 px-4">Sortino</th>
                <th className="text-right py-2 px-4">Calmar</th>
                <th className="text-right py-2 pl-4">Ann. Return</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.windowLabel} className="border-b">
                  <td className="py-2 pr-4">{r.windowLabel}</td>
                  <td className="text-right py-2 px-4">{fmtNum(r.sharpe)}</td>
                  <td className="text-right py-2 px-4">{fmtNum(r.sortino)}</td>
                  <td className="text-right py-2 px-4">{fmtNum(r.calmar)}</td>
                  <td className="text-right py-2 pl-4">
                    {fmtPct(r.annReturn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left py-2 pr-4">Year</th>
                <th className="text-right py-2 px-4">Sharpe</th>
                <th className="text-right py-2 px-4">Sortino</th>
                <th className="text-right py-2 pl-4">Calmar</th>
              </tr>
            </thead>
            <tbody>
              {ytd.map((row) => (
                <tr key={row.year} className="border-b">
                  <td className="py-2 pr-4">{row.year}</td>
                  <td className="text-right py-2 px-4">{fmtNum(row.sharpe)}</td>
                  <td className="text-right py-2 px-4">
                    {fmtNum(row.sortino)}
                  </td>
                  <td className="text-right py-2 pl-4">{fmtNum(row.calmar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function fmtNum(x: number | null) {
  return x === null ? "—" : x.toFixed(2);
}

function fmtPct(x: number | null) {
  return x === null ? "—" : `${(x * 100).toFixed(2)}%`;
}
