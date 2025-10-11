// app/(analytics)/analytics/components/performance-metrics/regular-returns/RegularReturnsCard2.tsx
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

/* ------------------------------- types -------------------------------- */

type Range = "Daily" | "Weekly" | "Monthly";

type SeriesPoint = {
  key: string; // "YYYY-MM-DD 08:00"
  labelDate: Date; // midnight of the day/week/month bucket
  value: number; // return fraction [-1..+1]
};

type RecordMap = Record<string, number>;

type MemoState = {
  record: RecordMap;
  daily: SeriesPoint[];
  domainStart?: Date;
  domainEnd?: Date;
};

/* --------------------------- date utilities --------------------------- */

const CUT_HOUR = 8;

function normalizeDate(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}
function formatKeyWithCut(dateLabel: Date, cutHour: number): string {
  const y = dateLabel.getFullYear();
  const m = `${dateLabel.getMonth() + 1}`.padStart(2, "0");
  const d = `${dateLabel.getDate()}`.padStart(2, "0");
  const hh = `${cutHour}`.padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:00`;
}
function lastCompleteLabel(now: Date, cutHour: number): Date | null {
  const today = normalizeDate(now);
  const todayCut = new Date(today);
  todayCut.setHours(cutHour, 0, 0, 0);
  return now.getTime() >= todayCut.getTime()
    ? addDays(today, -1)
    : addDays(today, -2);
}
function startOfWeekMonday(d: Date): Date {
  const x = normalizeDate(d);
  const mondayOffset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x;
}
function startOfMonth(d: Date): Date {
  const x = normalizeDate(d);
  x.setDate(1);
  return x;
}

/* --------------------------- seeded randomness --------------------------- */

function hashStringTo32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seededRand01(seed: string): number {
  let x = hashStringTo32(seed) || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}
function seededSignedPercent(seed: string, maxAbs: number): number {
  const u = seededRand01(seed);
  return (u * 2 - 1) * maxAbs;
}

/* --------------------------- series generation --------------------------- */

function buildDailySeries(
  last3MonthsStart: Date,
  lastLabel: Date,
  cutHour: number
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let cur = normalizeDate(last3MonthsStart);
  if (cur > lastLabel) return out;
  while (cur <= lastLabel) {
    const key = formatKeyWithCut(cur, cutHour);
    const value = seededSignedPercent(key, 0.08); // ±8%
    out.push({ key, labelDate: new Date(cur), value });
    cur = addDays(cur, 1);
  }
  return out;
}

function groupAverage(
  pts: SeriesPoint[],
  grouper: (d: Date) => { key: string; labelDate: Date },
  cutHour: number
): SeriesPoint[] {
  const acc = new Map<string, { sum: number; n: number; labelDate: Date }>();
  for (const p of pts) {
    const g = grouper(p.labelDate);
    const cur = acc.get(g.key);
    if (cur) {
      cur.sum += p.value;
      cur.n += 1;
    } else {
      acc.set(g.key, { sum: p.value, n: 1, labelDate: g.labelDate });
    }
  }
  const out: SeriesPoint[] = [];
  for (const [k, v] of acc.entries()) {
    const avg = v.n > 0 ? v.sum / v.n : 0;
    const key = `${k} ${String(cutHour).padStart(2, "0")}:00`;
    out.push({ key, labelDate: v.labelDate, value: avg });
  }
  out.sort((a, b) => a.labelDate.getTime() - b.labelDate.getTime());
  return out;
}

/* ------------------------------ formatting ------------------------------ */

function pct1(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function fmtShortLabel(range: Range, d: Date): string {
  if (range === "Daily")
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (range === "Weekly")
    return `Wk of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
function periodStart(range: Range, base: Date): Date {
  if (range === "Daily") {
    const s = new Date(base);
    s.setHours(CUT_HOUR, 0, 0, 0);
    return s;
  }
  if (range === "Weekly") {
    const s = startOfWeekMonday(base);
    s.setHours(CUT_HOUR, 0, 0, 0);
    return s;
  }
  const s = startOfMonth(base);
  s.setHours(CUT_HOUR, 0, 0, 0);
  return s;
}
function periodEnd(range: Range, start: Date): Date {
  if (range === "Daily") return addDays(start, 1);
  if (range === "Weekly") return addDays(start, 7);
  return addMonths(start, 1);
}
function fmtRange(start: Date, end: Date): string {
  const s = start.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const e = end.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${s} → ${e}`;
}
function toInputValueLocal(dt: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  const y = dt.getFullYear();
  const m = pad(dt.getMonth() + 1);
  const d = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mm = pad(dt.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/* --------------------------------- view --------------------------------- */

export default function RegularReturnsCard2(): React.ReactNode {
  const [range, setRange] = useState<Range>("Daily");

  const memo = useMemo<MemoState>(() => {
    const now = new Date();
    const lastLabel = lastCompleteLabel(now, CUT_HOUR);
    if (!lastLabel) return { record: {}, daily: [] };

    const threeMonthsAgo = addMonths(lastLabel, -3);
    const daily = buildDailySeries(threeMonthsAgo, lastLabel, CUT_HOUR);

    const rec: RecordMap = {};
    for (const p of daily) rec[p.key] = p.value;

    const domainStart = periodStart("Daily", daily[0]!.labelDate);
    const domainEnd = periodEnd("Daily", daily[daily.length - 1]!.labelDate);

    return { record: rec, daily, domainStart, domainEnd };
  }, []);

  const dailySeries = memo.daily;
  const record = memo.record;
  const domainStart = memo.domainStart;
  const domainEnd = memo.domainEnd;

  /* ---- date range state + validation ---- */
  const [startAt, setStartAt] = useState<Date | null>(domainStart ?? null);
  const [endAt, setEndAt] = useState<Date | null>(domainEnd ?? null);

  function parseLocalInput(v: string): Date | null {
    if (!v) return null;
    const [date, time] = v.split("T");
    const [Y, M, D] = date.split("-").map(Number);
    const [h, m] = time.split(":").map(Number);
    const dt = new Date(Y, M - 1, D, h, m, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  function handleStartChange(v: string): void {
    const dt = parseLocalInput(v);
    if (dt) setStartAt(dt);
  }
  function handleEndChange(v: string): void {
    const dt = parseLocalInput(v);
    if (dt) setEndAt(dt);
  }

  const rangeError: string | null = useMemo(() => {
    if (!domainStart || !domainEnd || !startAt || !endAt) return null;
    if (startAt.getTime() < domainStart.getTime())
      return "Start is earlier than available data.";
    if (endAt.getTime() > domainEnd.getTime())
      return "End is later than available data.";
    if (startAt.getTime() >= endAt.getTime())
      return "Start must be before end.";
    return null;
  }, [startAt, endAt, domainStart, domainEnd]);

  // Filter base daily series within [startAt, endAt)
  const dailyFiltered: SeriesPoint[] = useMemo(() => {
    if (!startAt || !endAt || rangeError) return dailySeries;
    return dailySeries.filter((p) => {
      const s = periodStart("Daily", p.labelDate);
      return s.getTime() >= startAt.getTime() && s.getTime() < endAt.getTime();
    });
  }, [dailySeries, startAt, endAt, rangeError]);

  // Aggregate by current range
  const displayed: SeriesPoint[] = useMemo(() => {
    if (dailyFiltered.length === 0) return [];
    if (range === "Daily") return dailyFiltered;
    if (range === "Weekly") {
      return groupAverage(
        dailyFiltered,
        (d: Date) => {
          const wkStart = startOfWeekMonday(d);
          return {
            key: formatKeyWithCut(wkStart, CUT_HOUR),
            labelDate: wkStart,
          };
        },
        CUT_HOUR
      );
    }
    return groupAverage(
      dailyFiltered,
      (d: Date) => {
        const monStart = startOfMonth(d);
        return {
          key: formatKeyWithCut(monStart, CUT_HOUR),
          labelDate: monStart,
        };
      },
      CUT_HOUR
    );
  }, [dailyFiltered, range]);

  const maxAbs: number = useMemo(() => {
    let m = 0;
    for (const p of displayed) m = Math.max(m, Math.abs(p.value));
    return Math.max(m, 0.01);
  }, [displayed]);

  // X tick sampling: keep labels readable (≤ ~10)
  const maxXTicks = 10;
  const step = Math.max(1, Math.ceil(displayed.length / maxXTicks));

  // Layout
  const PLOT_H = 280;
  const GUTTER_LEFT = 56;
  const GUTTER_RIGHT = 10;
  const GUTTER_TOP = 10;
  const GUTTER_BOTTOM = 44;

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-2 pb-3 sm:py-2">
          <CardTitle className="text-base">
            Regular Returns - Bar Graph
          </CardTitle>

          {/* Controls */}
          <div className="mt-2 flex flex-wrap items-center gap-4">
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
                onChange={(e) => setRange(e.target.value as Range)}
                className="appearance-none rounded-md border bg-background px-3 py-1 pr-9 text-sm w-auto max-w-full"
                aria-label="Select return range"
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
              {/* tighter chevron to right edge */}
              <ChevronDown
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="rr-start"
                className="text-sm text-muted-foreground"
              >
                From
              </label>
              <input
                id="rr-start"
                type="datetime-local"
                value={startAt && domainStart ? toInputValueLocal(startAt) : ""}
                min={domainStart ? toInputValueLocal(domainStart) : undefined}
                max={domainEnd ? toInputValueLocal(domainEnd) : undefined}
                onChange={(e) => handleStartChange(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              />
              <label htmlFor="rr-end" className="text-sm text-muted-foreground">
                To
              </label>
              <input
                id="rr-end"
                type="datetime-local"
                value={endAt && domainEnd ? toInputValueLocal(endAt) : ""}
                min={domainStart ? toInputValueLocal(domainStart) : undefined}
                max={domainEnd ? toInputValueLocal(domainEnd) : undefined}
                onChange={(e) => handleEndChange(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>

          {rangeError ? (
            <div className="mt-1 text-xs text-red-500">{rangeError}</div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4">
        {displayed.length === 0 ? (
          <div className="text-sm text-muted-foreground px-4 py-12">
            No data.
          </div>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className="w-full">
              <div
                className="relative w-full rounded-md border bg-card"
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
                  <div className="absolute inset-x-0 top-1/2 border-t border-border/60" />

                  {/* Bars in grid */}
                  <div
                    className="relative h-full grid items-end gap-[4px]"
                    style={{
                      gridTemplateColumns: `repeat(${displayed.length}, minmax(0,1fr))`,
                    }}
                  >
                    {displayed.map((p) => {
                      const hFrac = Math.min(Math.abs(p.value) / maxAbs, 1);
                      const halfHeightPct = `${(hFrac * 50).toFixed(2)}%`;
                      const isPos = p.value >= 0;
                      const color = isPos
                        ? "hsl(142 72% 45%)"
                        : "hsl(0 72% 51%)";
                      const pStart = periodStart(range, p.labelDate);
                      const pEnd = periodEnd(range, pStart);

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
                                aria-label={`${pct1(p.value)} • ${
                                  range === "Daily"
                                    ? `${pStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} (8:00 → next 8:00)`
                                    : fmtRange(pStart, pEnd)
                                }`}
                              >
                                <div
                                  className="w-full rounded-sm"
                                  style={{
                                    height: "100%",
                                    background: color,
                                    opacity: 0.9,
                                  }}
                                />
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            align="center"
                            side="top"
                            className="p-2 rounded-md border bg-popover text-popover-foreground shadow-md text-xs"
                          >
                            <div className="font-medium">{pct1(p.value)}</div>
                            <div className="text-muted-foreground">
                              {range === "Daily"
                                ? `${pStart.toLocaleString(undefined, { month: "short", day: "numeric" })} (8:00 → next 8:00)`
                                : fmtRange(pStart, pEnd)}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>

                {/* Y-axis */}
                <div
                  className="absolute text-[11px] text-muted-foreground"
                  style={{
                    left: 6,
                    top: GUTTER_TOP,
                    bottom: GUTTER_BOTTOM,
                    width: GUTTER_LEFT - 8,
                  }}
                >
                  <div className="absolute left-0 right-0" style={{ top: 0 }}>
                    <div className="flex items-center justify-end pr-1">
                      +{pct1(maxAbs)}
                    </div>
                  </div>
                  <div
                    className="absolute left-0 right-0"
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  >
                    <div className="flex items-center justify-end pr-1">0%</div>
                  </div>
                  <div
                    className="absolute left-0 right-0"
                    style={{ bottom: 0 }}
                  >
                    <div className="flex items-center justify-end pr-1">
                      −{pct1(maxAbs)}
                    </div>
                  </div>
                  <div
                    className="absolute left-0 bottom-0 top-0 flex items-center justify-center"
                    style={{
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                    }}
                  >
                    <span className="text-[10px]">Return %</span>
                  </div>
                </div>

                {/* X-axis labels — CENTERED on bars; sampling to avoid cramming */}
                <div
                  className="absolute text-[11px] text-muted-foreground"
                  style={{
                    left: GUTTER_LEFT,
                    right: GUTTER_RIGHT,
                    bottom: 6,
                    height: 18,
                  }}
                >
                  <div className="relative w-full h-full">
                    {displayed.map((p, i) => {
                      const show = i % step === 0 || i === displayed.length - 1;
                      if (!show) return null;
                      // position at bar center
                      const xPct = ((i + 0.5) / displayed.length) * 100;
                      const txt = fmtShortLabel(range, p.labelDate);
                      return (
                        <div
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

        {/* keep record referenced for lints */}
        <span className="sr-only">{Object.keys(record).length} points</span>
      </CardContent>
    </Card>
  );
}
