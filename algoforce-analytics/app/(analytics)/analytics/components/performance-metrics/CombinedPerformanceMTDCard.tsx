"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { BulkMetricsResponse } from "../../hooks/useAnalyticsData";

/* ----------------- helpers ----------------- */
function toNum(n: unknown, fallback = 0): number {
  if (typeof n === "number") return Number.isFinite(n) ? n : fallback;
  if (typeof n === "string") {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }
  return fallback;
}
function pct4(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${(v * 100).toFixed(4)}%`;
}
function usd6(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  })}`;
}
function sumSelectedFromRow(
  row: Record<string, unknown> | undefined,
  accounts: readonly string[]
): number {
  if (!row) return 0;
  let s = 0;
  for (const acc of accounts) if (row[acc] != null) s += toNum(row[acc], 0);
  return s;
}
function nearestKeyAtOrBefore(keys: string[], target: string): string | null {
  if (!keys.length) return null;
  const i = keys.findIndex((k) => k > target);
  if (i === -1) return keys[keys.length - 1]!;
  if (i === 0) return null;
  return keys[i - 1]!;
}
function nearestKeyAtOrAfter(keys: string[], target: string): string | null {
  if (!keys.length) return null;
  const i = keys.findIndex((k) => k >= target);
  return i === -1 ? null : keys[i]!;
}

/* series colors */
const REALIZED_COLOR = "#39A0ED"; // blue
const MARGIN_COLOR = "#8A5CF6";   // purple

const cfg: ChartConfig = {
  pos: { label: "Realized", color: REALIZED_COLOR },
  neg: { label: "Margin", color: MARGIN_COLOR },
};

/* ----------------------- metric math ----------------------- */
function computeSeriesOverWindow(
  balance: Record<string, Record<string, number>>,
  accounts: readonly string[],
  start: string,
  end: string
): { keys: string[]; eq: number[] } {
  const keys = Object.keys(balance).sort();
  const startKey = nearestKeyAtOrAfter(keys, start);
  const endKey = nearestKeyAtOrBefore(keys, end);
  if (!startKey || !endKey) return { keys: [], eq: [] };
  const i0 = keys.indexOf(startKey);
  const i1 = keys.indexOf(endKey);
  const windowKeys = keys.slice(i0, i1 + 1);
  const eq = windowKeys.map((k) => sumSelectedFromRow(balance[k], accounts));
  return { keys: windowKeys, eq };
}
function minDrawdown(eq: number[]): number {
  if (eq.length === 0) return 0;
  let peak = eq[0] || 0;
  let worst = 0;
  for (let i = 0; i < eq.length; i += 1) {
    const v = eq[i]!;
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1; // negative in drawdown
      if (dd < worst) worst = dd;
    }
  }
  return worst; // ≤ 0
}

/* ----------------------- component ----------------------- */
export default function CombinedPerformanceMTDCard({
  bulk,
  selected,
  combinedUpnl = 0,
  levels = [
    { value: 0.01, label: "-1%" },
    { value: 0.02, label: "-2%" },
    { value: 0.03, label: "-3%" },
    { value: 0.04, label: "-4%" },
    { value: 0.05, label: "-5%" },
    { value: 0.06, label: "-6%" },
  ],
  levelColors = [
    "var(--chart-5)",
    "#FFA94D",
    "#FF7043",
    "var(--chart-1)",
    "#C62828",
    "#C62828",
  ],
}: {
  bulk: BulkMetricsResponse;
  selected: string[];
  combinedUpnl?: number;
  levels?: { value: number; label?: string }[];
  levelColors?: string[];
}) {
  const accs = React.useMemo(
    () => (selected.length ? selected : bulk.accounts ?? []),
    [selected, bulk.accounts]
  );

  const windowLabel =
    bulk?.window?.startDay && bulk?.window?.endDay
      ? `${bulk.window.startDay} → ${bulk.window.endDay}`
      : "MTD";

  // Realized equity series MUST use pre-Upnl when available
  const realizedBalance = bulk.balancePreUpnl ?? bulk.balance;
  const { eq: realizedEq } = React.useMemo(
    () =>
      computeSeriesOverWindow(
        realizedBalance ?? {},
        accs,
        bulk.window?.startDay ?? "",
        bulk.window?.endDay ?? ""
      ),
    [realizedBalance, accs, bulk.window?.startDay, bulk.window?.endDay]
  );

  const startBal = realizedEq.length ? realizedEq[0]! : 0;
  const latestRealized = realizedEq.length ? realizedEq[realizedEq.length - 1]! : 0;

  // Margin: inject combined UPNL only into the last point
  const marginLatest = latestRealized + (Number.isFinite(combinedUpnl) ? combinedUpnl : 0);

  // Header balances (today with UPNL)
  const totalBal = marginLatest;
  const deltaBal = totalBal - startBal;

  // Realized metrics
  // const realizedReturn = startBal > 0 ? (latestRealized - startBal) / startBal : 0;
  // const realizedDD = minDrawdown(realizedEq);
  const realizedReturn = bulk?.combinedLiveMonthlyReturn?.total ?? 0;
  const realizedDD = bulk?.combinedLiveMonthlyDrawdown?.total ?? 0;

  // Margin metrics (series with UPNL added to last)
  const marginEq = React.useMemo(() => {
    if (realizedEq.length === 0) return [];
    const out = realizedEq.slice();
    out[out.length - 1] = marginLatest;
    return out;
  }, [realizedEq, marginLatest]);
  // const marginReturn =
  //   startBal > 0 && marginEq.length
  //     ? (marginEq[marginEq.length - 1]! - startBal) / startBal
  //     : 0;
  // const marginDD = minDrawdown(marginEq);
  const marginReturn = bulk?.combinedLiveMonthlyReturnWithUpnl?.total ?? 0;
  const marginDD = bulk?.combinedLiveMonthlyDrawdownWithUpnl?.total ?? 0;

  // TESTS
  // const alert1 = `[TEST] combinedLiveMonthlyReturn = ${JSON.stringify(bulk?.combinedLiveMonthlyReturn)}`;
  // const alert2 = `[TEST] combinedLiveMonthlyDrawdown = ${JSON.stringify(bulk?.combinedLiveMonthlyDrawdown)}`;
  // const alert3 = `[TEST] combinedLiveMonthlyReturnWithUpnl = ${JSON.stringify(bulk?.combinedLiveMonthlyReturnWithUpnl)}`;
  // const alert4 = `[TEST] combinedLiveMonthlyDrawdownWithUpnl = ${JSON.stringify(bulk?.combinedLiveMonthlyDrawdownWithUpnl)}`;
  // alert(`${alert1}\n${alert2}\n${alert3}\n${alert4}`)


  /* ----- Drawdown rows & thresholds ----- */

  const ddRows = React.useMemo(
    () => [
      { k: "Realized", v: Math.abs(realizedDD), display: realizedDD, c: REALIZED_COLOR },
      { k: "Margin", v: Math.abs(marginDD), display: marginDD, c: MARGIN_COLOR },
    ],
    [realizedDD, marginDD]
  );
  const ddMax = Math.max(0.02, ...ddRows.map((r) => r.v), ...levels.map((l) => l.value));
  const xMaxDD = ddMax * 1.12;
  const ddLegend = levels.map((l, i) => ({
    x: l.value,
    label: l.label ?? `-${Math.round(l.value * 100)}%`,
    color: levelColors[i] ?? "var(--chart-2)",
  }));

  /* ----- Return rows ----- */
  const retRows = React.useMemo(
    () => [
      { k: "Realized", v: realizedReturn, c: REALIZED_COLOR },
      { k: "Margin", v: marginReturn, c: MARGIN_COLOR },
    ],
    [realizedReturn, marginReturn]
  );
  const retSteps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0];
  const retAbsNow = Math.max(0.0, ...retRows.map((r) => Math.abs(r.v)));
  const retTarget = retSteps.find((s) => retAbsNow <= s) ?? retAbsNow;
  const xMaxRet = (retTarget || 0.01) * 1.08;
  const returnTicks = [-retTarget, 0, retTarget];
  const retTickFmt = (v: number): string => `${Math.round(v * 100)}%`;

  /* ----- layout ----- */
  const RIGHT_GUTTER_PX_BASE = 120;
  const YAXIS_WIDTH_BASE = 130;
  const VALUE_FONT_PX = 12;
  const GUTTER_INNER_PAD_PX = 8;

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = React.useState<number>(0);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setWrapW(r.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const RIGHT_GUTTER_PX = Math.max(100, Math.min(140, Math.round(wrapW * 0.10))) || RIGHT_GUTTER_PX_BASE;
  const yAxisWidth = Math.max(110, Math.min(145, Math.round(wrapW * 0.10))) || YAXIS_WIDTH_BASE;

  type LabelCoreProps = { y?: number; height?: number; value?: number };
  const RightPctLabel = (props: LabelCoreProps) => {
    const y = typeof props.y === "number" ? props.y : NaN;
    const h = typeof props.height === "number" ? props.height : NaN;
    const value = typeof props.value === "number" ? props.value : NaN;
    if (![y, h, value].every(Number.isFinite)) return null;
    const ty = y + h / 2 + VALUE_FONT_PX * 0.36;
    return (
      <text
        x={wrapW - RIGHT_GUTTER_PX + GUTTER_INNER_PAD_PX}
        y={ty}
        textAnchor="start"
        fontSize={VALUE_FONT_PX}
        className="font-semibold"
        fill="var(--primary)"
      >
        {pct4(value)}
      </text>
    );
  };

  const barSize = 30;
  const gapY = 14;
  const margins = { left: 6, right: RIGHT_GUTTER_PX, top: 14, bottom: 8 };
  const sectionHeight = barSize * 2 + gapY + margins.top + margins.bottom + 8;

  const deltaPositive = deltaBal >= 0;

  return (
    <Card className="w-full">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle>Combined Performance — MTD</CardTitle>
            <CardDescription className="mt-0.5">{windowLabel}</CardDescription>

            {/* Balances (today uses UPNL) */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: "var(--muted-foreground)" }} />
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold text-foreground">{usd6(totalBal)}</span>
              </span>

              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: REALIZED_COLOR }} />
                <span className="text-muted-foreground">Start</span>
                <span className="font-semibold text-foreground">{usd6(startBal)}</span>
              </span>

              <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: deltaPositive ? REALIZED_COLOR : MARGIN_COLOR }}
                />
                {deltaPositive ? (
                  <TrendingUp className="h-3.5 w-3.5" style={{ color: REALIZED_COLOR }} />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" style={{ color: MARGIN_COLOR }} />
                )}
                <span className="text-muted-foreground">Delta</span>
                <span className="font-semibold text-foreground">{usd6(deltaBal)}</span>
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent ref={wrapRef} className="px-2 sm:p-6">
        {/* ---- Drawdown (Realized vs Margin) ---- */}
        <div className="rounded-xl border bg-card/40 p-3 mb-5">
          <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
            Drawdown (MTD)
          </div>
          <ChartContainer config={cfg} className="w-full" style={{ height: `${sectionHeight}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ k: "Realized", v: Math.abs(realizedDD), display: realizedDD, c: REALIZED_COLOR },
                               { k: "Margin", v: Math.abs(marginDD), display: marginDD, c: MARGIN_COLOR }]}
                        layout="vertical" barCategoryGap={gapY} margin={{ ...margins }}>
                <CartesianGrid horizontal={false} vertical={false} />
                <YAxis dataKey="k" type="category" width={yAxisWidth} tickLine={false} axisLine={false} tickMargin={6} tick={{ fontSize: 13, fontWeight: 600 }} />
                <XAxis type="number" domain={[0, xMaxDD]} tickFormatter={(v: number) => `-${Math.round(v * 100)}%`} tickLine={false} axisLine={false} />
                {ddLegend.map((it) => (
                  <ReferenceLine key={`thr-${it.label}`} x={it.x} stroke={it.color} strokeDasharray="6 6"
                                 label={{ value: it.label, position: "top", fill: it.color, fontSize: 12 }} />
                ))}
                <Bar dataKey="v" layout="vertical" radius={6} barSize={barSize} isAnimationActive={false}>
                  {[REALIZED_COLOR, MARGIN_COLOR].map((c, i) => <Cell key={`dd-${i}`} fill={c} />)}
                  <LabelList dataKey="display" content={<RightPctLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>

        {/* ---- Return (Realized vs Margin) ---- */}
        <div className="rounded-xl border bg-card/40 p-3">
          <div className="mb-2 text-sm sm:text-base font-medium text-foreground">
            Return (MTD)
          </div>
          <ChartContainer config={cfg} className="w-full" style={{ height: `${sectionHeight}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ k: "Realized", v: realizedReturn, c: REALIZED_COLOR },
                               { k: "Margin", v: marginReturn, c: MARGIN_COLOR }]}
                        layout="vertical" barCategoryGap={gapY} margin={{ ...margins }}>
                <CartesianGrid horizontal={false} vertical={false} />
                <YAxis dataKey="k" type="category" width={yAxisWidth} tickLine={false} axisLine={false} tickMargin={6} tick={{ fontSize: 13, fontWeight: 600 }} />
                <XAxis type="number" domain={[-xMaxRet, xMaxRet]} ticks={[-xMaxRet / 1.08, 0, xMaxRet / 1.08]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} />
                <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                <Bar dataKey="v" layout="vertical" radius={6} barSize={barSize} isAnimationActive={false}>
                  {[REALIZED_COLOR, MARGIN_COLOR].map((c, i) => <Cell key={`ret-${i}`} fill={c} />)}
                  <LabelList content={<RightPctLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
