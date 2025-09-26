// FILE: app/analytics/VarEsCard.tsx
"use client";

import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MetricsPayload } from "./types";

/** ---------------- Types ---------------- */

type Method = "historical" | "normal-mc" | "cornish-fisher";

type RiskPoint = { day: string; var: number | null; es: number | null };

type DailyRow = MetricsPayload["daily_return_last_n_days"]["daily_rows"][number];

/** ---------------- Chart config ---------------- */

const chartConfig: ChartConfig = {
  var: { label: "VaR", color: "var(--chart-1)" },
  es: { label: "ES", color: "var(--chart-2)" },
};

/** ---------------- Math helpers (no 'any') ---------------- */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Inclusive, linear-interpolated empirical quantile
function quantile(arr: number[], q: number): number {
  if (arr.length === 0) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 >= a.length) return a[base];
  return a[base] + rest * (a[base + 1] - a[base]);
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : NaN;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return NaN;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function skewness(arr: number[]): number {
  // sample skewness (unbiased-ish for large n)
  if (arr.length < 3) return NaN;
  const m = mean(arr);
  const s = stddev(arr);
  if (!Number.isFinite(s) || s === 0) return NaN;
  const n = arr.length;
  const g1 = (n / ((n - 1) * (n - 2))) * arr.reduce((sum, x) => sum + ((x - m) / s) ** 3, 0);
  return g1;
}

function excessKurtosis(arr: number[]): number {
  if (arr.length < 4) return NaN;
  const m = mean(arr);
  const s = stddev(arr);
  if (!Number.isFinite(s) || s === 0) return NaN;
  const n = arr.length;
  const g2Raw = arr.reduce((sum, x) => sum + ((x - m) / s) ** 4, 0) / n - 3; // excess
  // small-sample correction (optional, fine to use raw for charts)
  return g2Raw;
}

// Standard normal utilities (for Cornish–Fisher ES approx)
function stdNormInv(p: number): number {
  // Acklam’s approximation (sufficient for UI)
  // https://web.archive.org/web/20150910044729/http://home.online.no/~pjacklam/notes/invnorm/
  if (p <= 0 || p >= 1) return p === 0 ? -Infinity : Infinity;
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00,
  ];

  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  let r: number;
  let x: number;

  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (phigh < p) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    q = p - 0.5;
    r = q * q;
    x =
      (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  // one step Halley iteration to improve accuracy
  const e = 0.5 * (1 + erf(x / Math.SQRT2)) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(0.5 * x * x);
  x = x - u / (1 + x * u / 2);
  return x;
}

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const sign = x < 0 ? -1 : 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * Math.abs(x));
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}

function stdNormPdf(x: number): number {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/** ---------------- Core builder ---------------- */

function buildRiskSeries(
  metrics: MetricsPayload,
  alpha: number,
  method: Method
): RiskPoint[] {
  const rows: DailyRow[] = metrics.daily_return_last_n_days?.daily_rows ?? [];
  if (rows.length === 0) return [];

  // daily returns as decimals; keep nulls for filtering
  const rets = rows.map((r) => ({
    day: r.day,
    r: isFiniteNumber(r.daily_return_pct) ? r.daily_return_pct / 100 : null,
  }));

  const lookback = 90; // rolling window length
  const minObs = 30;   // minimum valid obs to compute

  const out: RiskPoint[] = [];
  const q = 1 - alpha; // lower tail probability (e.g., 0.05 for 95%)

  for (let i = 0; i < rets.length; i += 1) {
    const windowVals = rets
      .slice(Math.max(0, i - lookback + 1), i + 1)
      .map((x) => x.r)
      .filter(isFiniteNumber);

    if (windowVals.length < minObs) {
      out.push({ day: rets[i].day, var: null, es: null });
      continue;
    }

    let varPct: number | null = null;
    let esPct: number | null = null;

    if (method === "historical") {
      const varCut = quantile(windowVals, q);
      const tail = windowVals.filter((r) => r <= varCut);
      const es = tail.length ? mean(tail) : NaN;
      varPct = Number.isFinite(varCut) ? varCut * 100 : null;
      esPct = Number.isFinite(es) ? es * 100 : null;
    } else if (method === "normal-mc") {
      const μ = mean(windowVals);
      const σ = stddev(windowVals);
      if (Number.isFinite(μ) && Number.isFinite(σ) && σ > 0) {
        // MC simulate 10k draws
        const N = 10000;
        const draws: number[] = new Array(N);
        // Box–Muller
        for (let k = 0; k < N; k += 2) {
          const u1 = Math.random();
          const u2 = Math.random();
          const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
          const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
          draws[k] = μ + σ * z0;
          if (k + 1 < N) draws[k + 1] = μ + σ * z1;
        }
        const varCut = quantile(draws, q);
        const tail = draws.filter((r) => r <= varCut);
        const es = tail.length ? mean(tail) : NaN;
        varPct = Number.isFinite(varCut) ? varCut * 100 : null;
        esPct = Number.isFinite(es) ? es * 100 : null;
      }
    } else {
      // method === "cornish-fisher"
      const μ = mean(windowVals);
      const σ = stddev(windowVals);
      const S = skewness(windowVals);          // skewness
      const K = excessKurtosis(windowVals);    // excess kurtosis
      if (Number.isFinite(μ) && Number.isFinite(σ) && σ > 0) {
        const z = stdNormInv(q); // base lower-tail z
        const s = Number.isFinite(S) ? S : 0;
        const k = Number.isFinite(K) ? K : 0;
        // Cornish–Fisher adjusted z (through 2nd order in skew/kurt)
        const zcf =
          z +
          (1 / 6) * (z * z - 1) * s +
          (1 / 24) * (z * z * z - 3 * z) * k -
          (1 / 36) * (2 * z * z * z - 5 * z) * s * s;

        const varCF = μ + σ * zcf;
        // ES approximation: plug adjusted z into normal ES formula
        // ES_normal = μ - σ * φ(z) / (1 - α); (note sign: lower tail)
        const esCF = μ + σ * (-stdNormPdf(zcf) / (1 - alpha));

        varPct = Number.isFinite(varCF) ? varCF * 100 : null;
        esPct = Number.isFinite(esCF) ? esCF * 100 : null;
      }
    }

    out.push({
      day: rets[i].day,
      var: varPct,
      es: esPct,
    });
  }

  return out;
}

/** ---------------- Component ---------------- */

export default function VarEsCard({ metrics }: { metrics: MetricsPayload }) {
  const [alpha, setAlpha] = React.useState<0.95 | 0.99>(0.95);
  const [method, setMethod] = React.useState<Method>("historical");

  const series = React.useMemo(
    () => buildRiskSeries(metrics, alpha, method),
    [metrics, alpha, method]
  );

  if (series.length === 0) {
    return (
      <Card className="py-0">
        <CardHeader className="border-b !p-0">
          <div className="px-6 pt-4 pb-3 sm:py-3">
            <CardTitle className="leading-tight">VaR &amp; Expected Shortfall</CardTitle>
            <CardDescription className="mt-0.5">No data in this range.</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const methodLabel =
    method === "historical"
      ? "Historical"
      : method === "normal-mc"
      ? "Monte Carlo (Normal)"
      : "Cornish–Fisher";

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle className="leading-tight">VaR &amp; Expected Shortfall</CardTitle>
            <CardDescription className="mt-0.5">
              {methodLabel}, rolling 90d window, α={alpha}
            </CardDescription>
          </div>
          <div className="px-6 pb-3 sm:py-3 flex items-center gap-3">
            <ToggleGroup
              type="single"
              value={String(alpha)}
              onValueChange={(v) => v && setAlpha(Number(v) as 0.95 | 0.99)}
              className="h-8"
            >
              <ToggleGroupItem value="0.95" className="h-8 px-2">95%</ToggleGroupItem>
              <ToggleGroupItem value="0.99" className="h-8 px-2">99%</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup
              type="single"
              value={method}
              onValueChange={(v) => v && setMethod(v as Method)}
              className="h-8"
            >
              <ToggleGroupItem value="historical" className="h-8 px-2">Historical</ToggleGroupItem>
              <ToggleGroupItem value="normal-mc" className="h-8 px-2">Monte&nbsp;Carlo</ToggleGroupItem>
              <ToggleGroupItem value="cornish-fisher" className="h-8 px-2">Cornish–Fisher</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
          <AreaChart data={series} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickMargin={8} />
            <YAxis width={60} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="var"
                  formatter={(val: unknown, name: unknown) => {
                    const n = Number(val);
                    return [Number.isFinite(n) ? `${n.toFixed(2)}%` : "–", ` ${String(name)}`];
                  }}
                  labelFormatter={(d) =>
                    new Date(d).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  }
                />
              }
            />
            <Area
              dataKey="var"
              stroke="var(--chart-1)"
              fill="var(--chart-1)"
              fillOpacity={0.2}
              connectNulls
            />
            <Area
              dataKey="es"
              stroke="var(--chart-2)"
              fill="var(--chart-2)"
              fillOpacity={0.2}
              connectNulls
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
