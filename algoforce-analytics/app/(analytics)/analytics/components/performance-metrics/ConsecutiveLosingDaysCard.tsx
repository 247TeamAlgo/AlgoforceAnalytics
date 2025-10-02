// ConsecutiveLosingDaysThresholdsCard.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import * as React from "react";
import type { MetricsSlim } from "../../lib/performance_metric_types";

/* ---------------- types ---------------- */
type ThresholdLevel = { value: number; label?: string }; // value in DAYS

type Row = {
  account: string;
  current: number;        // current losing streak (days)
  max: number;            // kept for future use; not rendered
  crossedIndex: number;   // -1 if none
  color: string;          // accent color based on highest crossed threshold
};

const CURRENT_HEX = "#39A0ED";

/* ---------------- utils ---------------- */
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
}: {
  perAccounts?: Record<string, MetricsSlim>;
  levels?: ThresholdLevel[];
  levelColors?: string[];
  defaultBarColor?: string;
}) {
  const rows = React.useMemo(
    () => buildRows(perAccounts, levels, levelColors, defaultBarColor),
    [perAccounts, levels, levelColors, defaultBarColor]
  );

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 border-b">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Consecutive Losing Days</CardTitle>
          {!!rows.length && (
            <Badge variant="secondary" className="shrink-0">
              {rows.length} account{rows.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4">
        {!rows.length ? (
          <div className="text-sm text-muted-foreground py-10 text-center">
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
              .sort((a, b) => b.current - a.current || a.account.localeCompare(b.account))
              .map((r) => {
                const crossed = r.crossedIndex >= 0;
                return (
                  <div
                    key={r.account}
                    className="
                      rounded-xl border bg-card text-card-foreground shadow-sm
                      hover:shadow transition-shadow
                    "
                    style={{
                      boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${r.color} 24%, transparent)`,
                    }}
                  >
                    {/* NAME: no truncation; allow wrapping */}
                    <div className="flex items-start justify-between gap-1 px-3 pt-2">
                      <div
                        className="text-sm font-medium leading-snug whitespace-normal break-words"
                        title={r.account}
                      >
                        {r.account}
                      </div>
                      <Badge
                        variant={crossed ? "destructive" : "outline"}
                        className="gap-1 shrink-0"
                        style={crossed ? { backgroundColor: r.color, borderColor: r.color } : undefined}
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
                          className="text-3xl sm:text-4xl font-bold tracking-tight leading-none"
                          style={{ color: r.color }}
                          aria-label={`Current losing days: ${r.current}`}
                          title={`${r.current} consecutive losing day${r.current === 1 ? "" : "s"}`}
                        >
                          {r.current}
                        </div>
                      </div>

                      {/* Max streak removed as requested */}
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
