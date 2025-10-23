"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Range = "Daily" | "Weekly";

export type RegularReturnsPayload = Record<
  string, // "YYYY-MM-DD"
  Record<string, number> // { fund2: 12.3, fund3: -1.2, total: 11.1 }
>;

type PerformanceWindow = {
  mode: "MTD" | "WTD" | "Custom";
  startDay: string; // "YYYY-MM-DD"
  endDay: string;   // "YYYY-MM-DD"
};

type Props = {
  accounts: string[];
  data: RegularReturnsPayload;
  /** Pass payload.meta.window from the API so the subtitle matches MTD exactly */
  window?: PerformanceWindow;
};

type Point = {
  key: string;
  labelDate: Date;
  total: number;
  per: Record<string, number>;
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const CUT_HOUR = 8;

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const off = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - off);
  return x;
}
function fmtDailyLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtWeeklyLabel(wkStart: Date): string {
  const end = addDays(wkStart, 7);
  const s = wkStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${s} → ${e}`;
}
function usd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(v);
  const body = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(abs);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${body}`;
}

/** Neutral badge with tooltip listing accounts */
function AccountsBadge({ accounts }: { accounts: string[] }) {
  const count = accounts.length;
  const label = `Accounts (${count})`;
  const tooltip =
    accounts.length > 0 ? accounts.join(" • ") : "No accounts selected";

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-2 rounded-md border bg-card/60 px-2.5 py-1 text-xs cursor-default">
            <span className="text-muted-foreground">Accounts</span>
            <span className="font-semibold text-foreground">{count}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function RegularReturnsCard2({
  accounts,
  data,
  window,
}: Props): React.ReactNode {
  const [range, setRange] = useState<Range>("Daily");

  /* 1) Normalize payload → daily points (entire MTD window; no custom pickers) */
  const dailyPoints = useMemo<Point[]>(() => {
    const pts: Point[] = [];
    const orderedKeys = Object.keys(data).sort(); // "YYYY-MM-DD" asc
    for (const day of orderedKeys) {
      const [Y, M, D] = day.split("-").map(Number);
      if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) continue;
      const atCut = new Date(Y, (M as number) - 1, D as number, CUT_HOUR, 0, 0, 0);
      const row = data[day] ?? {};
      const total = Number(row.total ?? 0);
      const per: Record<string, number> = {};
      for (const a of accounts) per[a] = Number(row[a] ?? 0);
      pts.push({
        key: `${day} ${String(CUT_HOUR).padStart(2, "0")}:00`,
        labelDate: new Date(atCut.getFullYear(), atCut.getMonth(), atCut.getDate()),
        total,
        per,
      });
    }
    return pts;
  }, [data, accounts]);

  /* 2) Weekly aggregation (sum dollars) */
  const displayed: Point[] = useMemo(() => {
    if (range === "Daily") return dailyPoints;

    const map = new Map<
      string,
      { labelDate: Date; total: number; per: Record<string, number> }
    >();

    for (const p of dailyPoints) {
      const wk = startOfWeekMonday(p.labelDate);
      const k = wk.toISOString().slice(0, 10);
      const cur = map.get(k);
      if (!cur) {
        map.set(k, { labelDate: wk, total: p.total, per: { ...p.per } });
      } else {
        cur.total += p.total;
        for (const a of accounts) cur.per[a] = (cur.per[a] ?? 0) + (p.per[a] ?? 0);
      }
    }

    const out: Point[] = [];
    for (const [k, v] of map.entries()) {
      out.push({
        key: `${k} ${String(CUT_HOUR).padStart(2, "0")}:00`,
        labelDate: v.labelDate,
        total: v.total,
        per: v.per,
      });
    }
    out.sort((a, b) => a.labelDate.getTime() - b.labelDate.getTime());
    return out;
  }, [dailyPoints, range, accounts]);

  /* 3) Scales and layout */
  const maxAbs: number = useMemo(() => {
    let m = 0;
    for (const p of displayed) m = Math.max(m, Math.abs(p.total));
    return Math.max(m, 1e-6);
  }, [displayed]);

  const PLOT_H = 280;
  const GUTTER_LEFT = 56;
  const GUTTER_RIGHT = 10;
  const GUTTER_TOP = 10;
  const GUTTER_BOTTOM = 44;

  const maxXTicks = 10;
  const step = Math.max(1, Math.ceil(displayed.length / maxXTicks));

  /* 4) Subtitle label matches Month-to-Date window */
  const windowLabel: string = useMemo(() => {
    if (window?.startDay && window?.endDay) {
      return `${window.startDay} → ${window.endDay}`;
    }
    // Fallback: infer from first/last payload keys
    const keys = Object.keys(data).sort();
    if (keys.length >= 1) {
      const first = keys[0]!;
      const last = keys[keys.length - 1]!;
      return `${first} → ${last}`;
    }
    return "—";
  }, [window?.startDay, window?.endDay, data]);

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-2 pb-3 sm:py-2">
          <CardTitle className="text-base">Daily/Weekly Returns ($)</CardTitle>
          <div className="mt-1 text-sm text-muted-foreground">{windowLabel}</div>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            {/* Range only (date pickers removed) */}
            <label
              htmlFor="rr-bar-range"
              className="text-sm text-muted-foreground"
            >
              Range
            </label>
            <div className="relative">
              <select
                id="rr-bar-range"
                value={range}
                onChange={(e) => (e.target.value === "Weekly" ? setRange("Weekly") : setRange("Daily"))}
                className="appearance-none rounded-md border bg-background px-3 py-1 pr-9 text-sm w-auto max-w-full"
                aria-label="Select return range"
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>

            {/* NEW: Accounts badge (no color icon) */}
            <AccountsBadge accounts={accounts} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4">
        {displayed.length === 0 ? (
          <div className="text-sm text-muted-foreground px-4 py-12">No data.</div>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className="w-full">
              <div
                className="relative w-full rounded-md border bg-card overflow-hidden"
                style={{ height: PLOT_H }}
              >
                {/* Plot area */}
                <div
                  className="absolute"
                  style={{
                    left: GUTTER_LEFT,
                    right: GUTTER_RIGHT,
                    top: GUTTER_TOP,
                    bottom: GUTTER_BOTTOM,
                  }}
                >
                  {/* Zero line */}
                  <div className="absolute inset-x-0 top-1/2 border-t-2 border-border/80" />

                  {/* Horizontal guides */}
                  {([0.25, 0.5, 0.75] as const).map((f) => (
                    <React.Fragment key={`ht-${f}`}>
                      <div
                        className="absolute inset-x-0 border-t border-dashed border-border/70"
                        style={{ top: `${50 - f * 50}%` }}
                        aria-hidden
                      />
                      <div
                        className="absolute inset-x-0 border-t border-dashed border-border/70"
                        style={{ top: `${50 + f * 50}%` }}
                        aria-hidden
                      />
                    </React.Fragment>
                  ))}

                  {/* Bars */}
                  <div
                    className="relative h-full grid items-end gap-[4px]"
                    style={{
                      gridTemplateColumns: `repeat(${displayed.length}, minmax(0,1fr))`,
                    }}
                  >
                    {displayed.map((p) => {
                      const hFrac = Math.min(Math.abs(p.total) / maxAbs, 1);
                      const halfHeightPct = `${(hFrac * 50).toFixed(2)}%`;
                      const isPos = p.total >= 0;
                      const color = isPos ? "hsl(142 72% 45%)" : "hsl(0 72% 51%)";
                      const lbl =
                        range === "Daily"
                          ? fmtDailyLabel(p.labelDate)
                          : fmtWeeklyLabel(startOfWeekMonday(p.labelDate));

                      return (
                        <Tooltip key={p.key}>
                          <TooltipTrigger asChild>
                            <div className="relative h-full">
                              <div
                                className="absolute left-0 right-0"
                                style={{
                                  bottom: isPos ? "50%" : undefined,
                                  top: isPos ? undefined : "50%",
                                  height: halfHeightPct,
                                }}
                                aria-label={`${usd(p.total)} • ${lbl} (8:00 cut)`}
                              >
                                <div
                                  className="w-full"
                                  style={{ height: "100%", background: color, opacity: 0.9 }}
                                />
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            align="center"
                            side="top"
                            className="p-2 rounded-md border bg-popover text-popover-foreground shadow-md text-xs"
                          >
                            <div className="font-medium">{usd(p.total)}</div>
                            <div className="text-muted-foreground mb-1">
                              {lbl} (8:00 cut)
                            </div>
                            <div className="grid grid-cols-1 gap-0.5">
                              {accounts.map((a) => (
                                <div
                                  key={`${p.key}-${a}`}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <span className="text-muted-foreground">{a}</span>
                                  <span className="font-mono">{usd(p.per[a] ?? 0)}</span>
                                </div>
                              ))}
                              <div className="mt-1 h-px w-full bg-border/60" />
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">total</span>
                                <span className="font-mono">{usd(p.total)}</span>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>

                  {/* Vertical ticks aligned to shown X labels */}
                  <div className="pointer-events-none absolute inset-0" aria-hidden>
                    {displayed.map((p, i) => {
                      const show = i % step === 0 || i === displayed.length - 1;
                      if (!show) return null;
                      const xPct = ((i + 0.5) / displayed.length) * 100;
                      return (
                        <div
                          key={`vt-${p.key}`}
                          className="absolute"
                          style={{
                            left: `${xPct}%`,
                            bottom: 0,
                            height: 10,
                            width: 0,
                            borderLeft: "2px solid var(--border)",
                            transform: "translateX(-1px)",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Y-axis (inside border) */}
                <div
                  className="absolute text-[11px] text-muted-foreground"
                  style={{ left: 10, top: 10, bottom: 44, width: 56 - 8 }}
                >
                  <div className="absolute left-0 right-0" style={{ top: 2 }}>
                    <div className="flex items-center justify-end pl-10">+{usd(maxAbs)}</div>
                  </div>
                  <div
                    className="absolute left-0 right-0"
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  >
                    <div className="flex items-center justify-end pr-1">0</div>
                  </div>
                  <div className="absolute left-0 right-0" style={{ bottom: 2 }}>
                    <div className="flex items-center justify-end pl-1">−{usd(maxAbs)}</div>
                  </div>
                  <div
                    className="absolute left-0 bottom-0 top-0 flex items-center justify-center pr-2"
                    style={{ writingMode: "vertical-rl", transform: "rotate(270deg)" }}
                  >
                    <span className="text-[10px]">Dollars</span>
                  </div>
                </div>

                {/* X-axis labels */}
                <div
                  className="absolute text-[11px] text-muted-foreground"
                  style={{ left: GUTTER_LEFT, right: GUTTER_RIGHT, bottom: 6, height: 18 }}
                >
                  <div className="relative w-full h-full">
                    {displayed.map((p, i) => {
                      const show = i % step === 0 || i === displayed.length - 1;
                      if (!show) return null;
                      const xPct = ((i + 0.5) / displayed.length) * 100;
                      const txt =
                        range === "Daily"
                          ? fmtDailyLabel(p.labelDate)
                          : fmtWeeklyLabel(startOfWeekMonday(p.labelDate));
                      return (
                        <div
                          suppressHydrationWarning
                          key={`xlabel-${p.key}`}
                          className="absolute -translate-x-1/2 whitespace-nowrap text-center"
                          style={{ left: `${xPct}%`, bottom: 0 }}
                        >
                          {txt}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </TooltipProvider>
        )}
      </CardContent>

      {/* Accessibility */}
      <span className="sr-only">{displayed.length} bars</span>
    </Card>
  );
}
