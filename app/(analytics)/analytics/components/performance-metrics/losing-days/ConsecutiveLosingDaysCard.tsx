// app/(analytics)/analytics/components/performance-metrics/combined-performance-metrics/ConsecutiveLosingDaysCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { METRICS_COLORS } from "../combined-performance-metrics/helpers";

/* ----------------------------- exported types ----------------------------- */
export type ThresholdLevel = { value: number; label?: string };

export type SlimAccountMetrics = {
  streaks?: { current?: number; max?: number };
};

export type AccountMini = { redisName: string; strategy?: string | null };

/** The API payload only needs this part for this card. */
export type LosingDaysEntry = {
  consecutive?: number;
  days?: Record<string, number | undefined>; // "YYYY-MM-DD" -> (optional) negative PnL
};

export type LosingDaysPayload = Record<string, LosingDaysEntry>;

export type ApiPayload = {
  // ... other fields exist, we only rely on this one:
  losingDays?: LosingDaysPayload;
};

/* ---------------------------------- row ---------------------------------- */
type Row = {
  account: string;
  current: number;
  max: number;
  crossedIndex: number;
  color: string;
  days: ReadonlyArray<{ day: string; pnl?: number }>;
};

/* -------------------------------- helpers -------------------------------- */

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function niceUsd(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const s = n < 0 ? "-" : "";
  return `${s}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toRows(
  perAccounts: Record<string, SlimAccountMetrics> | undefined,
  apiLosingDays: LosingDaysPayload | undefined,
  levels: ThresholdLevel[],
  levelColors: string[],
  defaultColor: string,
  includeCombined: boolean
): Row[] {
  const ordered = [...levels].sort((a, b) => a.value - b.value);
  const vals = ordered.map((l) => l.value);

  const keys = new Set<string>();
  if (perAccounts) Object.keys(perAccounts).forEach((k) => keys.add(k));
  if (apiLosingDays) Object.keys(apiLosingDays).forEach((k) => keys.add(k));
  if (!includeCombined) keys.delete("combined");

  const out: Row[] = [];
  keys.forEach((account) => {
    const p = perAccounts?.[account];
    const ld = apiLosingDays?.[account];

    const pref =
      typeof ld?.consecutive === "number"
        ? ld.consecutive!
        : (p?.streaks?.current ?? 0);
    const current = clamp(
      Math.max(0, Math.floor(pref)),
      0,
      Number.MAX_SAFE_INTEGER
    );
    const max = Math.max(0, Number(p?.streaks?.max ?? 0));

    let idx = -1;
    for (let i = 0; i < vals.length; i += 1) {
      if (current >= vals[i]!) idx = i;
      else break;
    }
    const color = idx >= 0 ? (levelColors[idx] ?? defaultColor) : defaultColor;

    const days: Array<{ day: string; pnl?: number }> = [];
    if (ld?.days) {
      for (const [day, pnl] of Object.entries(ld.days)) {
        days.push({ day, pnl: typeof pnl === "number" ? pnl : undefined });
      }
      // most-recent first
      days.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
    }

    out.push({ account, current, max, crossedIndex: idx, color, days });
  });

  return out;
}

function tallyByStrategyMap(
  rows: readonly Row[],
  mapping: Record<string, string>
) {
  const perStrategy: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const v = Number.isFinite(r.current) ? r.current : 0;
    total += v;
    const strategy = mapping[r.account];
    if (!strategy) continue;
    perStrategy[strategy] = (perStrategy[strategy] ?? 0) + v;
  }
  return { perStrategy, total };
}

function StatusPill({
  crossed,
  color,
  label,
}: {
  crossed: boolean;
  color: string;
  label: string;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] leading-none";
  if (crossed) {
    return (
      <span
        className={base}
        style={{
          color: "var(--card)",
          backgroundColor: color,
          borderColor: color,
        }}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  }
  return (
    <span className={base}>
      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

/* ------------------------------- fetch hook ------------------------------ */

function useLosingDaysFromApi(apiUrl?: string) {
  const [data, setData] = useState<LosingDaysPayload | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!apiUrl) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(apiUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ApiPayload;
        if (cancelled) return;
        setData(json?.losingDays ?? {});
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return { data, loading, error };
}

/* --------------------------------- view --------------------------------- */

export default function ConsecutiveLosingDaysCard({
  apiUrl,
  losingDays, // optional: if you already fetched server-side
  perAccounts,
  accounts = [],
  showCombined = true,
  levels = [
    { value: 4, label: "4d" },
    { value: 6, label: "6d" },
    { value: 8, label: "8d" },
    { value: 10, label: "10d" },
  ],
  levelColors = ["#FFC761", "#FFA94D", "#FF7043", "hsl(0 84% 62%)"],
  defaultBarColor = METRICS_COLORS.margin,
  variant = "list",
}: {
  apiUrl?: string;
  losingDays?: LosingDaysPayload;
  perAccounts?: Record<string, SlimAccountMetrics>;
  accounts?: AccountMini[];
  showCombined?: boolean;
  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
  variant?: "list" | "tiles";
}) {
  // pick source: prop > api
  const { data: fetched, loading, error } = useLosingDaysFromApi(apiUrl);
  const sourceLosingDays = losingDays ?? fetched ?? {};

  const rows = useMemo(
    () =>
      toRows(
        perAccounts,
        sourceLosingDays,
        levels,
        levelColors,
        defaultBarColor,
        showCombined
      ),
    [
      perAccounts,
      sourceLosingDays,
      levels,
      levelColors,
      defaultBarColor,
      showCombined,
    ]
  );

  const accountToStrategyMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) {
      const strategy = (a?.strategy ?? "").toString().trim();
      if (strategy) map[a.redisName] = strategy;
    }
    return map;
  }, [accounts]);

  const { perStrategy, total } = useMemo(
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

  const sortedRows = useMemo(() => {
    const list = rows.slice().sort((a, b) => {
      const byVal = b.current - a.current;
      if (byVal !== 0) return byVal;
      return a.account.localeCompare(b.account);
    });
    return list;
  }, [rows]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-2 sm:py-1.5 grid grid-rows-[auto_auto] gap-2">
            <CardTitle className="text-base">Consecutive Losing Days</CardTitle>
            {perStrategySorted.length > 0 && (
              <div className="text-xs text-muted-foreground px-0.5">
                Top strategies by streak sum:{" "}
                {perStrategySorted
                  .slice(0, 3)
                  .map((s) => `${s.strategy} (${s.value})`)
                  .join(", ")}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-md border bg-card/60 px-2.5 py-1 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: "var(--muted-foreground)" }}
            />
            <span className="text-muted-foreground">Total / Accounts</span>
            <span className="font-semibold text-foreground">
              {total} / {rows.length}
            </span>
          </span>
          {loading && (
            <span className="text-xs text-muted-foreground">Loading…</span>
          )}
          {error && (
            <span className="text-xs text-red-500">Error: {error}</span>
          )}
        </div>

        {!rows.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No data.
          </div>
        ) : variant === "list" ? (
          <TooltipProvider delayDuration={100}>
            <ul className="space-y-2">
              {sortedRows.map((r) => {
                const valueColor = r.color;
                const isLosing = r.current > 0;

                return (
                  <li
                    key={r.account}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
                    style={{
                      boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${valueColor} 22%, transparent)`,
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
                        style={{ color: valueColor }}
                      >
                        {r.current}
                      </span>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-default">
                            <StatusPill
                              crossed={isLosing}
                              color={valueColor}
                              label={isLosing ? "Losing" : "OK"}
                            />
                          </div>
                        </TooltipTrigger>

                        <TooltipContent
                          align="end"
                          side="top"
                          className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
                        >
                          <div className="mb-1 font-semibold">{r.account}</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-1">
                            <span className="text-muted-foreground">
                              Current
                            </span>
                            <span style={{ color: valueColor }}>
                              {r.current}
                            </span>
                            <span className="text-muted-foreground">Max</span>
                            <span style={{ color: valueColor }}>{r.max}</span>
                          </div>

                          {r.days.length > 0 ? (
                            <div className="max-w-[260px]">
                              <div className="mb-1 text-muted-foreground">
                                Losing days
                              </div>
                              <ul className="space-y-0.5">
                                {r.days.slice(0, 10).map(({ day, pnl }) => (
                                  <li
                                    key={day}
                                    className="flex items-center justify-between"
                                  >
                                    <span className="text-[11px] text-muted-foreground">
                                      {day}
                                    </span>
                                    <span
                                      className="text-[11px] font-medium"
                                      style={{ color: valueColor }}
                                    >
                                      {typeof pnl === "number"
                                        ? niceUsd(pnl)
                                        : "—"}
                                    </span>
                                  </li>
                                ))}
                                {r.days.length > 10 && (
                                  <li className="text-[11px] text-muted-foreground">
                                    … {r.days.length - 10} more
                                  </li>
                                )}
                              </ul>
                            </div>
                          ) : (
                            <div className="text-[11px] text-muted-foreground">
                              No losing days in the selected window.
                            </div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </li>
                );
              })}
            </ul>
          </TooltipProvider>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
              {sortedRows.map((r) => {
                const valueColor = r.color;
                const isLosing = r.current > 0;

                return (
                  <Tooltip key={r.account}>
                    <div
                      className="rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow"
                      style={{
                        boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${valueColor} 24%, transparent)`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-1 px-3 pt-2">
                        <div className="break-words text-sm font-medium leading-snug">
                          {r.account}
                        </div>
                        <TooltipTrigger asChild>
                          <div className="shrink-0">
                            <StatusPill
                              crossed={isLosing}
                              color={valueColor}
                              label={isLosing ? "Losing" : "OK"}
                            />
                          </div>
                        </TooltipTrigger>
                      </div>
                      <div className="px-3 pb-3 pt-1">
                        <div className="flex items-center justify-center gap-2">
                          <div
                            className="text-3xl font-bold leading-none tracking-tight sm:text-4xl"
                            style={{ color: valueColor }}
                          >
                            {r.current}
                          </div>
                        </div>
                      </div>
                    </div>

                    <TooltipContent
                      align="end"
                      side="top"
                      className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
                    >
                      <div className="mb-1 font-semibold">{r.account}</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-1">
                        <span className="text-muted-foreground">Current</span>
                        <span style={{ color: valueColor }}>{r.current}</span>
                        <span className="text-muted-foreground">Max</span>
                        <span style={{ color: valueColor }}>{r.max}</span>
                      </div>
                      {r.days.length > 0 ? (
                        <div className="max-w-[260px]">
                          <div className="mb-1 text-muted-foreground">
                            Losing days
                          </div>
                          <ul className="space-y-0.5">
                            {r.days.slice(0, 10).map(({ day, pnl }) => (
                              <li
                                key={day}
                                className="flex items-center justify-between"
                              >
                                <span className="text-[11px] text-muted-foreground">
                                  {day}
                                </span>
                                <span
                                  className="text-[11px] font-medium"
                                  style={{ color: valueColor }}
                                >
                                  {typeof pnl === "number" ? niceUsd(pnl) : "—"}
                                </span>
                              </li>
                            ))}
                            {r.days.length > 10 && (
                              <li className="text-[11px] text-muted-foreground">
                                … {r.days.length - 10} more
                              </li>
                            )}
                          </ul>
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground">
                          No losing days in the selected window.
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
