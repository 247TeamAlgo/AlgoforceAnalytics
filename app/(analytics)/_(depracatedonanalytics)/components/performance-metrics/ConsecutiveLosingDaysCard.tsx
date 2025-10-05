"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import * as React from "react";
import type { MetricsSlim } from "../../lib/performance_metric_types";
import { type Account } from "@/lib/jsonStore";

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

/* ---------------- helpers (Option A) ---------------- */

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

/* ---------------- existing utils (unchanged) ---------------- */
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

  /* ---------- build simple account→strategy map (Option A) ---------- */
  const accountToStrategyMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) {
      // Choose how you want to derive the strategy string:
      // 1) Prefer explicit a.strategy if present
      // 2) Otherwise fall back to something else (e.g., a.display) or leave unmapped
      const strategy = (a.strategy ?? "").toString().trim();
      if (strategy) {
        map[a.redisName] = strategy;
      }
    }
    return map;
  }, [accounts]);

  /* ---------- compute per-strategy tallies ---------- */
  const { perStrategy, total, unmapped } = React.useMemo(
    () => tallyByStrategyMap(rows, accountToStrategyMap),
    [rows, accountToStrategyMap]
  );

  const perStrategySorted = React.useMemo(
    () => sortPerStrategyDesc(perStrategy),
    [perStrategy]
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
                  <span className="font-semibold text-foreground">
                    {total}
                  </span>
                </span>

                {/* PER-STRATEGY BADGES */}
                {perStrategySorted.map(({ strategy, value }) => (
                  <Badge key={strategy} variant="outline" className="px-2 py-1 text-xs">
                    {strategy}: <span className="ml-1 font-semibold">{value}</span>
                  </Badge>
                ))}

                {/* UNMAPPED, if any */}
                {unmapped > 0 && (
                  <Badge variant="destructive" className="px-2 py-1 text-xs">
                    Unmapped: <span className="ml-1 font-semibold">{unmapped}</span>
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

      {/* ---------------- body (unchanged) ---------------- */}
      <CardContent className="p-3 sm:p-4">
        {!rows.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No data.
          </div>
        ) : (
          <div
            className="
              grid gap-3
              grid-cols-2
              sm:grid-cols-3
              md:grid-cols-4
              lg:grid-cols-5
              xl:grid-cols-6
            "
          >
            {rows
              .sort(
                (a, b) =>
                  b.current - a.current || a.account.localeCompare(b.account)
              )
              .map((r) => {
                const crossed = r.crossedIndex >= 0;
                return (
                  <div
                    key={r.account}
                    className="
                      rounded-xl border bg-card text-card-foreground shadow-sm
                      transition-shadow hover:shadow
                    "
                    style={{
                      boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${r.color} 24%, transparent)`,
                    }}
                  >
                    {/* NAME */}
                    <div className="flex items-start justify-between gap-1 px-3 pt-2">
                      <div
                        className="break-words text-sm font-medium leading-snug"
                        title={r.account}
                      >
                        {r.account}
                      </div>
                      <Badge
                        variant={crossed ? "destructive" : "outline"}
                        className="gap-1 shrink-0"
                        style={
                          crossed
                            ? { backgroundColor: r.color, borderColor: r.color }
                            : undefined
                        }
                      >
                        {crossed ? (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        )}
                        {crossed ? "Threshold" : "OK"}
                      </Badge>
                    </div>

                    <div className="px-3 pb-3 pt-1">
                      <div className="flex items-center justify-center gap-2">
                        <div
                          className="text-3xl font-bold leading-none tracking-tight sm:text-4xl"
                          style={{ color: r.color }}
                          aria-label={`Current losing days: ${r.current}`}
                          title={`${r.current} consecutive losing day${
                            r.current === 1 ? "" : "s"
                          }`}
                        >
                          {r.current}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
