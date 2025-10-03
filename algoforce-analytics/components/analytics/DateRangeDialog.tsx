"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ShieldCheck, ChevronRight } from "lucide-react";
import * as React from "react";
import { type Account } from "@/lib/jsonStore";
import { MetricsSlim } from "@/app/(analytics)/analytics/lib/performance_metric_types";

/* ---------------- types ---------------- */
type ThresholdLevel = { value: number; label?: string }; // value in DAYS

type Row = {
  account: string;
  current: number;
  max: number;
  crossedIndex: number;
  color: string;
};

const CURRENT_HEX = "#39A0ED";

/** In case your Account doesn't already have a strategy field, we treat it as optional. */
type AccountWithStrategy = Account & { strategy?: string | null };

/* ---------------- helpers ---------------- */

/** Tally `rows[].current` by strategy name using a simple account→strategy map. */
function tallyByStrategyMap(
  rows: readonly Row[],
  mapping: Record<string, string>
): { perStrategy: Record<string, number>; total: number; unmapped: number } {
  const perStrategy: Record<string, number> = {};
  let total = 0;
  let unmapped = 0;

  for (const r of rows) {
    const v = Number.isFinite(r.current) ? r.current : 0;
    total += v;

    const strategy = mapping[r.account];
    if (!strategy) {
      unmapped += v;
      continue;
    }
    perStrategy[strategy] = (perStrategy[strategy] ?? 0) + v;
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

function buildRows(
  perAccounts: Record<string, MetricsSlim> | undefined,
  levels: ThresholdLevel[],
  levelColors: string[],
  defaultColor: string
): Row[] {
  if (!perAccounts) return [];
  const orderedLevels = [...levels].sort((a, b) => a.value - b.value);
  const vals = orderedLevels.map((l) => l.value);

  return Object.entries(perAccounts).map(([account, p]) => {
    const cur = Math.max(0, Number(p.streaks?.current ?? 0));
    const mx = Math.max(0, Number(p.streaks?.max ?? 0));

    let idx = -1;
    for (let i = 0; i < vals.length; i += 1) {
      if (cur >= vals[i]!) idx = i;
      else break;
    }
    const color = idx >= 0 ? (levelColors[idx] ?? defaultColor) : defaultColor;

    return { account, current: cur, max: mx, crossedIndex: idx, color };
  });
}

/* ---------------- list item (Material-like) ---------------- */
function ListItem({
  r,
  levelLabel,
}: {
  r: Row;
  levelLabel: string | undefined;
}) {
  const crossed = r.crossedIndex >= 0;
  const statusIcon = crossed ? (
    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
  ) : (
    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
  );

  return (
    <li
      role="listitem"
      className="group relative flex w-full items-center gap-3 px-3 py-3 outline-none transition hover:bg-accent focus-visible:bg-accent"
      aria-label={`${r.account}: ${r.current} consecutive losing day${
        r.current === 1 ? "" : "s"
      }`}
    >
      {/* Leading graphic / color chip */}
      <div
        className="mt-0.5 h-9 w-9 shrink-0 rounded-full border"
        style={{
          borderColor: r.color,
          boxShadow: `inset 0 0 0 4px color-mix(in oklab, ${r.color} 22%, transparent)`,
        }}
        aria-hidden="true"
      />

      {/* Primary & secondary text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div
            className="truncate text-sm font-medium leading-none"
            title={r.account}
          >
            {r.account}
          </div>
          <Badge
            variant={crossed ? "destructive" : "secondary"}
            className="gap-1 shrink-0"
            style={
              crossed
                ? { backgroundColor: r.color, borderColor: r.color }
                : undefined
            }
          >
            {statusIcon}
            {crossed ? "Threshold" : "OK"}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold" style={{ color: r.color }}>
            {r.current}d
          </span>
          <span aria-hidden>•</span>
          <span title={`Max losing streak: ${r.max}d`}>max {r.max}d</span>
          {crossed && levelLabel ? (
            <>
              <span aria-hidden>•</span>
              <span title="Crossed level">{levelLabel}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Trailing chevron */}
      <ChevronRight
        className="h-4 w-4 opacity-0 transition group-hover:opacity-60"
        aria-hidden="true"
      />
    </li>
  );
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
}: {
  perAccounts?: Record<string, MetricsSlim>;
  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
  accounts: AccountWithStrategy[];
}) {
  const rows = React.useMemo(
    () => buildRows(perAccounts, levels, levelColors, defaultBarColor),
    [perAccounts, levels, levelColors, defaultBarColor]
  );

  // build simple account→strategy map
  const accountToStrategyMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) {
      const strategy = (a.strategy ?? "").toString().trim();
      if (strategy) map[a.redisName] = strategy;
    }
    return map;
  }, [accounts]);

  const { perStrategy, total, unmapped } = React.useMemo(
    () => tallyByStrategyMap(rows, accountToStrategyMap),
    [rows, accountToStrategyMap]
  );

  const perStrategySorted = React.useMemo(
    () => sortPerStrategyDesc(perStrategy),
    [perStrategy]
  );

  const orderedLevels = React.useMemo(
    () => [...levels].sort((a, b) => a.value - b.value),
    [levels]
  );

  return (
    <Card className="w-full">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {/* LEFT – title + chips */}
          <div className="min-w-0 px-6 pt-4 sm:py-3">
            <CardTitle>Consecutive Losing Days</CardTitle>

            {rows.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* TOTAL */}
                <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{ backgroundColor: "var(--muted-foreground)" }}
                  />
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold text-foreground">{total}</span>
                </span>

                {/* PER-STRATEGY BADGES */}
                {perStrategySorted.map(({ strategy, value }) => (
                  <Badge
                    key={strategy}
                    variant="outline"
                    className="px-2 py-1 text-xs"
                  >
                    {strategy}:{" "}
                    <span className="ml-1 font-semibold">{value}</span>
                  </Badge>
                ))}

                {/* UNMAPPED, if any */}
                {unmapped > 0 && (
                  <Badge variant="destructive" className="px-2 py-1 text-xs">
                    Unmapped:{" "}
                    <span className="ml-1 font-semibold">{unmapped}</span>
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* RIGHT – #accounts badge */}
          {!!rows.length && (
            <div className="px-6 pt-4 sm:py-3">
              <Badge variant="secondary" className="shrink-0">
                {rows.length} account{rows.length === 1 ? "" : "s"}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>

      {/* ---------------- body: Material-style list ---------------- */}
      <CardContent className="p-0">
        {!rows.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No data.
          </div>
        ) : (
          <div role="list" className="divide-y">
            {rows
              .slice()
              .sort(
                (a, b) =>
                  b.current - a.current || a.account.localeCompare(b.account)
              )
              .map((r, idx) => {
                const level =
                  r.crossedIndex >= 0
                    ? orderedLevels[r.crossedIndex]
                    : undefined;
                return (
                  <React.Fragment key={r.account}>
                    <ListItem r={r} levelLabel={level?.label} />
                    {idx < rows.length - 1 ? <Separator /> : null}
                  </React.Fragment>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
