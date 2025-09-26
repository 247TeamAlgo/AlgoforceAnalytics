"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetricsCore } from "../types";

export function MetricsSummaryCard({ metrics }: { metrics: MetricsCore }) {
  const pct = (x: number | null) =>
    x === null ? "—" : `${(x * 100).toFixed(2)}%`;
  const num = (x: number | null) => (x === null ? "—" : x.toFixed(2));

  return (
    <Card className="rounded-3xl border">
      <CardHeader>
        <CardTitle>Performance Summary ({metrics.freq})</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
        <Metric label="Annual Return" value={pct(metrics.annual_return)} />
        <Metric
          label="Annual Volatility"
          value={pct(metrics.annual_volatility)}
        />
        <Metric
          label="Sharpe (main window)"
          value={num(metrics.sharpe_ratio)}
        />
        <Metric
          label="Sortino (main window)"
          value={num(metrics.sortino_ratio)}
        />
        <Metric
          label="Calmar (main window)"
          value={num(metrics.calmar_ratio)}
        />
        <Metric label="Max Drawdown" value={pct(metrics.max_drawdown)} />
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold mt-1">{value}</div>
    </div>
  );
}
