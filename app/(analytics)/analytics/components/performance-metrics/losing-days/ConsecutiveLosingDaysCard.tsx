// app/(analytics)/analytics/components/performance-metrics/losing-days/LosingDaysCard.tsx
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
import {
  ApiPayload,
  AccountMini,
  LosingDaysPayload,
  Row,
  ThresholdLevel,
} from "./types";
import { niceUsd, tallyByStrategyMap, toRows } from "./helpers";

/* -------------------------------- theme -------------------------------- */

const PRIMARY_FG = "hsl(var(--primary-foreground))";
const MUTED_FG = "hsl(var(--muted-foreground))";
const BORDER = "hsl(var(--border))";

/* ------------------------------- fetch hook ------------------------------- */

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
        setData(json?.losingDays as unknown as LosingDaysPayload);
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

/* ------------------------------- status pill ------------------------------ */

function StatusPill({ losing, color }: { losing: boolean; color: string }) {
  const base =
    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] leading-none";
  if (losing) {
    // Losing: vivid color to signal risk.
    return (
      <span
        className={base}
        style={{
          color: PRIMARY_FG,
          backgroundColor: color,
          borderColor: color,
        }}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Losing</span>
      </span>
    );
  }
  // Normal: very subdued — dim the whole badge.
  return (
    <span
      className={`${base} opacity-60`}
      style={{
        color: MUTED_FG,
        backgroundColor: "transparent",
        borderColor: BORDER,
      }}
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      <span className="text-muted-foreground">OK</span>
    </span>
  );
}

/* ------------- unified badge + tooltip (always show details) -------------- */

function BadgeWithTooltip({
  isLosing,
  color,
  row,
}: {
  isLosing: boolean;
  color: string;
  row: Row;
}) {
  const hasLosing = row.days.length > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-default">
          <StatusPill losing={isLosing} color={color} />
        </div>
      </TooltipTrigger>

      <TooltipContent
        align="end"
        side="top"
        className="p-3 rounded-lg border bg-popover text-popover-foreground shadow-md text-xs"
      >
        <div className="mb-1 font-semibold">{row.account}</div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mb-1">
          <span className="text-muted-foreground">Current</span>
          <span style={{ color: isLosing ? color : MUTED_FG }}>
            {row.current}
          </span>
        </div>

        {hasLosing ? (
          <div className="max-w-[260px]">
            <div className="mb-1 text-muted-foreground">Losing days</div>
            <ul className="space-y-0.5">
              {row.days.slice(0, 10).map(({ day, pnl }) => (
                <li key={day} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {day}
                  </span>
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: isLosing ? color : MUTED_FG }}
                  >
                    {niceUsd(pnl)}
                  </span>
                </li>
              ))}
              {row.days.length > 10 && (
                <li className="text-[11px] text-muted-foreground">
                  … {row.days.length - 10} more
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
}

/* ---------------------------------- view ---------------------------------- */

function normalizeToFlatMap(src: unknown): LosingDaysPayload {
  const out: LosingDaysPayload = {};

  if (
    src &&
    typeof src === "object" &&
    ("perAccount" in (src as Record<string, unknown>) ||
      "combined" in (src as Record<string, unknown>))
  ) {
    const perAccount =
      (
        src as {
          perAccount?: Record<
            string,
            { consecutive?: number; days?: Record<string, number> }
          >;
        }
      ).perAccount ?? {};
    for (const [acc, v] of Object.entries(perAccount)) {
      out[acc] = {
        consecutive: Number(v?.consecutive ?? 0),
        days: (v?.days ?? {}) as Record<string, number>,
      };
    }
    const combined = (
      src as {
        combined?: { consecutive?: number; days?: Record<string, number> };
      }
    ).combined;
    if (combined) {
      out["combined"] = {
        consecutive: Number(combined.consecutive ?? 0),
        days: (combined.days ?? {}) as Record<string, number>,
      };
    }
    return out;
  }

  return (src as LosingDaysPayload) ?? {};
}

export default function LosingDaysCard({
  apiUrl,
  losingDays,
  accounts = [],
  levels = [
    { value: 4, label: "4d" },
    { value: 6, label: "6d" },
    { value: 8, label: "8d" },
    { value: 10, label: "10d" },
  ],
  levelColors = [
    "hsl(var(--primary))",
    "hsl(var(--primary))",
    "hsl(var(--primary))",
    "hsl(var(--primary))",
  ],
  defaultBarColor = METRICS_COLORS.margin,
  variant = "list",
  description = "Consecutive losing days by account. Hover badges for details.",
}: {
  apiUrl?: string;
  losingDays?: unknown;
  accounts?: AccountMini[];
  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
  variant?: "list" | "tiles";
  description?: string;
}) {
  const { data: fetched, loading, error } = useLosingDaysFromApi(apiUrl);

  const flatSource: LosingDaysPayload = useMemo(() => {
    const src = losingDays ?? fetched ?? {};
    return normalizeToFlatMap(src);
  }, [losingDays, fetched]);

  const rows: Row[] = useMemo(
    () =>
      toRows(
        flatSource,
        levels as ThresholdLevel[],
        levelColors,
        defaultBarColor
      ),
    [flatSource, levels, levelColors, defaultBarColor]
  );

  const accountToStrategyMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) {
      const strategy = (a?.strategy ?? "").toString().trim();
      if (strategy) map[a.redisName] = strategy;
    }
    return map;
  }, [accounts]);

  const { perStrategy } = useMemo(
    () =>
      tallyByStrategyMap(
        rows.filter((r) => !r.isTotal),
        accountToStrategyMap
      ),
    [rows, accountToStrategyMap]
  );

  const perStrategySorted = useMemo(() => {
    const entries = Object.entries(perStrategy) as Array<[string, number]>;
    return entries
      .map(([strategy, value]) => ({ strategy, value }))
      .sort(
        (a, b) => b.value - a.value || a.strategy.localeCompare(b.strategy)
      );
  }, [perStrategy]);

  const sortedRows = useMemo(() => rows.slice(), [rows]);

  const firstThreshold: number = useMemo(() => {
    const sorted = [...(levels as ThresholdLevel[])].sort(
      (a: ThresholdLevel, b: ThresholdLevel) => a.value - b.value
    );
    return sorted.length ? sorted[0]!.value : Number.POSITIVE_INFINITY;
  }, [levels]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 px-6 pt-2 sm:py-1.5 grid grid-rows-[auto_auto] gap-1.5">
            <CardTitle className="text-base">Lose Streak (Daily)</CardTitle>
            <div className="text-xs text-muted-foreground">{description}</div>
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
        {loading && (
          <div className="mb-2 text-xs text-muted-foreground">Loading…</div>
        )}
        {error && (
          <div className="mb-2 text-xs text-red-500">Error: {error}</div>
        )}

        {!rows.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No data.
          </div>
        ) : variant === "list" ? (
          <TooltipProvider delayDuration={100}>
            <ul className="space-y-2">
              {sortedRows.map((r) => {
                const valueColor = r.color;
                const isAtOrAboveThreshold = r.current >= firstThreshold;
                const displayName = r.isTotal ? "Combined" : r.account;

                return (
                  <li
                    key={r.account}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
                    style={
                      isAtOrAboveThreshold
                        ? {
                            boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${valueColor} 22%, transparent)`,
                          }
                        : undefined
                    }
                    title={displayName}
                  >
                    <div className="min-w-0">
                      {/* Account name stays strong */}
                      <div className="truncate text-sm font-medium">
                        {displayName}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Days count: never muted; highlight only when threshold is hit */}
                      <span
                        className="text-2xl font-bold leading-none tracking-tight"
                        style={{
                          color: isAtOrAboveThreshold ? valueColor : undefined,
                        }}
                      >
                        {r.current}
                      </span>

                      <BadgeWithTooltip
                        isLosing={isAtOrAboveThreshold}
                        color={valueColor}
                        row={{ ...r, account: displayName }}
                      />
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
                const isAtOrAboveThreshold = r.current >= firstThreshold;
                const displayName = r.isTotal ? "Combined" : r.account;

                return (
                  <div
                    key={r.account}
                    className="rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow"
                    style={
                      isAtOrAboveThreshold
                        ? {
                            boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${valueColor} 24%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-1 px-3 pt-2">
                      {/* Account name stays strong */}
                      <div className="break-words text-sm font-medium leading-snug">
                        {displayName}
                      </div>
                      <BadgeWithTooltip
                        isLosing={isAtOrAboveThreshold}
                        color={valueColor}
                        row={{ ...r, account: displayName }}
                      />
                    </div>
                    <div className="px-3 pb-3 pt-1">
                      <div className="flex items-center justify-center gap-2">
                        {/* Days count: never muted; highlight only when threshold is hit */}
                        <div
                          className="text-3xl font-bold leading-none tracking-tight sm:text-4xl"
                          style={{
                            color: isAtOrAboveThreshold ? valueColor : undefined,
                          }}
                        >
                          {r.current}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
