"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck } from "lucide-react";

/* ---------------- local types ---------------- */

type ThresholdLevel = { value: number; label?: string };

type MetricsSlimCompat = {
  streaks?: { current?: number; max?: number };
  [k: string]: unknown;
};

type Account = {
  redisName: string;
  display?: string | null;
  monitored?: boolean;
  strategy?: string | null;
};

type Row = {
  account: string;
  label: string;
  current: number;
  max: number;
  crossedIndex: number; // -1 if none
  color: string;
};

/* ---------------- helpers ---------------- */

const CURRENT_HEX = "#39A0ED";

function buildRows(
  perAccounts: Record<string, MetricsSlimCompat> | undefined,
  levels: ThresholdLevel[],
  levelColors: string[],
  defaultColor: string,
  labelMap: Record<string, string>
): Row[] {
  if (!perAccounts) return [];
  const orderedLevels = [...levels].sort((a, b) => a.value - b.value);
  const vals = orderedLevels.map((l) => l.value);

  return Object.entries(perAccounts).map(([account, p]) => {
    const cur = Math.max(0, Number(p?.streaks?.current ?? 0));
    const mx = Math.max(0, Number(p?.streaks?.max ?? cur));
    let idx = -1;
    for (let i = 0; i < vals.length; i += 1) {
      if (cur >= vals[i]!) idx = i;
      else break;
    }
    const color = idx >= 0 ? (levelColors[idx] ?? defaultColor) : defaultColor;
    const label = labelMap[account] ?? account;
    return { account, label, current: cur, max: mx, crossedIndex: idx, color };
  });
}

function tallyByStrategy(
  rows: readonly Row[],
  strategyOf: Record<string, string | undefined>
): { perStrategy: Record<string, number>; total: number; unmapped: number } {
  const perStrategy: Record<string, number> = {};
  let total = 0;
  let unmapped = 0;

  for (const r of rows) {
    const v = Number.isFinite(r.current) ? r.current : 0;
    total += v;
    const strat = strategyOf[r.account];
    if (strat) perStrategy[strat] = (perStrategy[strat] ?? 0) + v;
    else unmapped += v;
  }
  return { perStrategy, total, unmapped };
}

function sortPerStrategyDesc(
  perStrategy: Record<string, number>
): Array<{ strategy: string; value: number }> {
  return Object.entries(perStrategy)
    .map(([strategy, value]) => ({ strategy, value }))
    .sort((a, b) => b.value - a.value || a.strategy.localeCompare(b.strategy));
}

/* ---------------- component ---------------- */

export default function ConsecutiveLosingDaysThresholdsCard({
  perAccounts,
  levels = [
    { value: 4, label: "4d" },
    { value: 6, label: "6d" },
    { value: 8, label: "8d" },
    { value: 10, label: "10d" },
  ],
  levelColors = ["var(--chart-5)", "#FFA94D", "#FF7043", "var(--chart-1)"],
  defaultBarColor = CURRENT_HEX,
  accounts = [],
  fixedHeight, // <-- lock card height; body scrolls
}: {
  perAccounts?: Record<string, MetricsSlimCompat>;
  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
  accounts: Account[];
  fixedHeight?: number;
}) {
  // Label mapping (redisName → display)
  const labelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) {
      const label = (a.display ?? a.redisName ?? "").toString().trim();
      if (label) map[a.redisName] = label;
    }
    return map;
  }, [accounts]);

  // Strategy mapping (redisName → strategy)
  const strategyMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) {
      const s = (a.strategy ?? "").toString().trim();
      if (s) map[a.redisName] = s;
    }
    return map;
  }, [accounts]);

  const rows = useMemo(
    () =>
      buildRows(perAccounts, levels, levelColors, defaultBarColor, labelMap),
    [perAccounts, levels, levelColors, defaultBarColor, labelMap]
  );

  const { perStrategy, total, unmapped } = useMemo(
    () => tallyByStrategy(rows, strategyMap),
    [rows, strategyMap]
  );

  const perStrategySorted = useMemo(
    () => sortPerStrategyDesc(perStrategy),
    [perStrategy]
  );

  const hasRows = rows.length > 0;

  return (
    <Card
      className="w-full"
      style={fixedHeight ? { height: fixedHeight } : undefined}
    >
      <CardHeader className="border-b !px-4 !py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Consecutive Losing Days</CardTitle>

            {hasRows && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* TOTAL */}
                <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{ backgroundColor: "var(--muted-foreground)" }}
                  />
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold text-foreground">{total}</span>
                </span>

                {/* PER-STRATEGY */}
                {perStrategySorted.map(({ strategy, value }) => (
                  <Badge
                    key={strategy}
                    variant="outline"
                    className="px-2 py-1 text-[11px]"
                  >
                    {strategy}:{" "}
                    <span className="ml-1 font-semibold">{value}</span>
                  </Badge>
                ))}

                {/* UNMAPPED */}
                {unmapped > 0 && (
                  <Badge
                    variant="destructive"
                    className="px-2 py-1 text-[11px]"
                  >
                    Unmapped:{" "}
                    <span className="ml-1 font-semibold">{unmapped}</span>
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* count */}
          {hasRows ? (
            <Badge variant="secondary" className="shrink-0">
              {rows.length} account{rows.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="!px-0 !py-0">
        {!hasRows ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No data.
          </div>
        ) : (
          <div
            className="overflow-auto"
            style={
              fixedHeight
                ? { height: fixedHeight - 60 /* header approx */ }
                : { maxHeight: 560 }
            }
          >
            <ul className="divide-y">
              {rows
                .slice()
                .sort(
                  (a, b) =>
                    b.current - a.current || a.account.localeCompare(b.account)
                )
                .map((r) => {
                  const crossed = r.crossedIndex >= 0;
                  return (
                    <li key={r.account} className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {/* left colored rule */}
                        <div
                          className="w-1.5 rounded-sm shrink-0"
                          style={{ backgroundColor: r.color, height: 36 }}
                          aria-hidden
                        />
                        {/* name + status on the left */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div
                              className="truncate font-medium text-sm"
                              title={r.label}
                            >
                              {r.label}
                            </div>
                            <Badge
                              variant={crossed ? "destructive" : "outline"}
                              className="gap-1 py-0.5"
                              style={
                                crossed
                                  ? {
                                      backgroundColor: r.color,
                                      borderColor: r.color,
                                    }
                                  : undefined
                              }
                            >
                              {crossed ? (
                                <>
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Threshold
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  OK
                                </>
                              )}
                            </Badge>
                          </div>
                        </div>
                        {/* big number on the right */}
                        <div
                          className="text-4xl sm:text-5xl font-extrabold leading-none tracking-tight pl-3"
                          style={{ color: r.color }}
                          aria-label={`Current losing days: ${r.current}`}
                          title={`${r.current} consecutive losing day${r.current === 1 ? "" : "s"}`}
                        >
                          {r.current}
                          <span className="ml-1 align-top text-[10px] text-muted-foreground">
                            d
                          </span>
                        </div>
                      </div>

                      {/* row footer */}
                      <div className="mt-1 flex items-center justify-between text-[12px] text-muted-foreground pl-3">
                        {r.max > r.current ? (
                          <span>Max {r.max}d</span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                        {crossed && r.crossedIndex >= 0 ? (
                          <span
                            className="rounded bg-muted px-1.5 py-0.5"
                            style={{ border: `1px solid ${r.color}` }}
                          >
                            ≥{" "}
                            {levels[r.crossedIndex]?.label ??
                              `${levels[r.crossedIndex]?.value ?? ""}d`}
                          </span>
                        ) : (
                          <span />
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
