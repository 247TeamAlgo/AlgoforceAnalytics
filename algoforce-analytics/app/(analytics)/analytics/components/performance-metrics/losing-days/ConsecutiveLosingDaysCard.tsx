"use client";

import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ShieldCheck } from "lucide-react";

/* ---- exported types ---- */
export type ThresholdLevel = { value: number; label?: string };

export type SlimAccountMetrics = {
  streaks?: { current?: number; max?: number };
};

export type AccountMini = { redisName: string; strategy?: string | null };

type Row = {
  account: string;
  current: number;
  max: number;
  crossedIndex: number;
  color: string;
};

const CURRENT_HEX = "#39A0ED";

/* ---- helpers ---- */
function buildRows(
  perAccounts: Record<string, SlimAccountMetrics> | undefined,
  levels: ThresholdLevel[],
  levelColors: string[],
  defaultColor: string
): Row[] {
  if (!perAccounts) return [];
  const ordered = [...levels].sort((a, b) => a.value - b.value);
  const vals = ordered.map((l) => l.value);

  return Object.entries(perAccounts).map(([account, p]) => {
    const cur = Math.max(0, Number(p?.streaks?.current ?? 0));
    const mx = Math.max(0, Number(p?.streaks?.max ?? 0));
    let idx = -1;
    for (let i = 0; i < vals.length; i += 1) {
      if (cur >= vals[i]!) idx = i;
      else break;
    }
    const color = idx >= 0 ? (levelColors[idx] ?? defaultColor) : defaultColor;
    return { account, current: cur, max: mx, crossedIndex: idx, color };
  });
}

function tallyByStrategyMap(
  rows: readonly Row[],
  mapping: Record<string, string>
) {
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

/* ---- component ---- */
export default function ConsecutiveLosingDaysCard({
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
  variant = "list",
}: {
  perAccounts?: Record<string, SlimAccountMetrics>;
  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
  accounts?: AccountMini[];
  variant?: "list" | "tiles";
}) {
  const rows = useMemo(
    () => buildRows(perAccounts, levels, levelColors, defaultBarColor),
    [perAccounts, levels, levelColors, defaultBarColor]
  );

  const accountToStrategyMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) {
      const strategy = (a?.strategy ?? "").toString().trim();
      if (strategy) map[a.redisName] = strategy;
    }
    return map;
  }, [accounts]);

  const { perStrategy, total, unmapped } = useMemo(
    () => tallyByStrategyMap(rows, accountToStrategyMap),
    [rows, accountToStrategyMap]
  );

  const perStrategySorted = useMemo(
    () =>
      Object.entries(perStrategy)
        .map(([strategy, value]) => ({ strategy, value }))
        .sort(
          (a, b) => b.value - a.value || a.strategy.localeCompare(b.strategy)
        ),
    [perStrategy]
  );

  const sortedRows = useMemo(
    () =>
      rows
        .slice()
        .sort(
          (a, b) => b.current - a.current || a.account.localeCompare(b.account)
        ),
    [rows]
  );

  return (
    <Card className="w-full h-full">
      <CardHeader className="border-b !p-0">
        <div className="flex items-start justify-between gap-3 px-4">
          <div className="min-w-0">
            <CardTitle className="text-base">Consecutive Losing Days</CardTitle>
            {rows.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* TOTAL (with accounts count) */}
                <span className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{ backgroundColor: "var(--muted-foreground)" }}
                  />
                  <span className="text-muted-foreground">
                    Total / Accounts
                  </span>
                  <span className="font-semibold text-foreground">
                    {total} / {rows.length}
                  </span>
                </span>

                {/* PER-STRATEGY BADGES */}
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
        </div>
      </CardHeader>

      <CardContent className="p-3">
        {!rows.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No data.
          </div>
        ) : variant === "list" ? (
          <ul className="space-y-2">
            {sortedRows.map((r) => {
              const crossed = r.crossedIndex >= 0;
              return (
                <li
                  key={r.account}
                  className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
                  style={{
                    boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${r.color} 22%, transparent)`,
                  }}
                  title={r.account}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {r.account}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-2xl font-bold leading-none tracking-tight"
                      style={{ color: r.color }}
                    >
                      {r.current}
                    </span>
                    <Badge
                      variant={crossed ? "destructive" : "outline"}
                      className="gap-1"
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
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {sortedRows.map((r) => {
              const crossed = r.crossedIndex >= 0;
              return (
                <div
                  key={r.account}
                  className="rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow"
                  style={{
                    boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${r.color} 24%, transparent)`,
                  }}
                >
                  <div className="flex items-start justify-between gap-1 px-3 pt-2">
                    <div className="break-words text-sm font-medium leading-snug">
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
