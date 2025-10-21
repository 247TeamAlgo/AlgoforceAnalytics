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

type Range = "Daily" | "Weekly";

type RegularReturnsPayload = Record<
  string, // "YYYY-MM-DD"
  Record<string, number> // { fund2: 12.3, fund3: -1.2, total: 11.1 }
>;

type Props = {
  accounts: string[];
  data: RegularReturnsPayload;
};

type Point = {
  key: string;
  labelDate: Date;
  total: number;
  per: Record<string, number>;
};

const CUT_HOUR = 8;

/* --------------------------- date utilities --------------------------- */
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
function startOfWeekMonday(d: Date): Date {
  const x = normalizeDate(d);
  const off = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - off);
  return x;
}
function toInputValueLocal(dt: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  const y = dt.getFullYear(),
    m = pad(dt.getMonth() + 1),
    d = pad(dt.getDate());
  const hh = pad(dt.getHours()),
    mm = pad(dt.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}
function parseLocalInput(v: string): Date | null {
  if (!v) return null;
  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
function sessionKey(dateOnly: Date): string {
  const y = dateOnly.getFullYear();
  const m = `${dateOnly.getMonth() + 1}`.padStart(2, "0");
  const d = `${dateOnly.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d} ${String(CUT_HOUR).padStart(2, "0")}:00`;
}

/* ------------------------------ formatting ------------------------------ */
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
function fmtDailyLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtWeeklyLabel(wkStart: Date): string {
  const end = addDays(wkStart, 7);
  const s = wkStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const e = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${s} → ${e}`;
}

/* ------------------------------ component ------------------------------ */
export default function RegularReturnsCard2({
  accounts,
  data,
}: Props): React.ReactNode {
  const [range, setRange] = useState<Range>("Daily");

  // 1) Normalize payload -> daily points
  const { dailyPoints, labelDates, payloadDatesSet } = useMemo(() => {
    const pts: Point[] = [];
    const labels: Date[] = [];

    const orderedKeys = Object.keys(data).sort();
    for (const day of orderedKeys) {
      const [Y, M, D] = day.split("-").map((t) => Number(t));
      if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D))
        continue;
      const atCut = new Date(Y, M - 1, D, CUT_HOUR, 0, 0, 0);

      const row = data[day] ?? {};
      const total = Number(row.total ?? 0);
      const per: Record<string, number> = {};
      for (const a of accounts) per[a] = Number(row[a] ?? 0);

      pts.push({
        key: sessionKey(atCut),
        labelDate: normalizeDate(atCut),
        total,
        per,
      });
      labels.push(normalizeDate(atCut));
    }

    const set = new Set<string>(orderedKeys);
    return { dailyPoints: pts, labelDates: labels, payloadDatesSet: set };
  }, [data, accounts]);

  // 2) Domain limits
  const domainStart: Date | null = useMemo(() => {
    if (labelDates.length === 0) return null;
    const s = new Date(labelDates[0]);
    s.setHours(CUT_HOUR, 0, 0, 0);
    return s;
  }, [labelDates]);

  const domainEnd: Date | null = useMemo(() => {
    if (labelDates.length === 0) return null;
    const e = new Date(labelDates[labelDates.length - 1]);
    e.setHours(CUT_HOUR, 0, 0, 0);
    return addDays(e, 1);
  }, [labelDates]);

  // 3) Date pickers
  const [startAt, setStartAt] = useState<Date | null>(domainStart);
  const [endAt, setEndAt] = useState<Date | null>(domainEnd);

  function coerceToCut(dt: Date | null): Date | null {
    if (!dt) return null;
    const x = new Date(dt);
    x.setHours(CUT_HOUR, 0, 0, 0);
    return x;
  }

  function handleStartChange(v: string): void {
    const dt = coerceToCut(parseLocalInput(v));
    setStartAt(dt);
  }
  function handleEndChange(v: string): void {
    const dt = coerceToCut(parseLocalInput(v));
    setEndAt(dt);
  }

  // 4) Validation
  const rangeError: string | null = useMemo(() => {
    if (!domainStart || !domainEnd || !startAt || !endAt) return null;
    if (startAt.getTime() < domainStart.getTime())
      return "Start is earlier than available data.";
    if (endAt.getTime() > domainEnd.getTime())
      return "End is later than available data.";
    if (startAt.getTime() >= endAt.getTime())
      return "Start must be before end.";

    if (range === "Daily") {
      const sKey = toDateKey(startAt);
      const eKeyMinus = toDateKey(addDays(endAt, -1));
      if (!payloadDatesSet.has(sKey))
        return `Start not in payload sessions (${sKey}).`;
      if (!payloadDatesSet.has(eKeyMinus))
        return `End not in payload sessions (${eKeyMinus}).`;
    }
    return null;
  }, [startAt, endAt, domainStart, domainEnd, range, payloadDatesSet]);

  function toDateKey(dt: Date): string {
    const y = dt.getFullYear();
    const m = `${dt.getMonth() + 1}`.padStart(2, "0");
    const d = `${dt.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 5) Filter for window
  const dailyFiltered: Point[] = useMemo(() => {
    if (!startAt || !endAt) return dailyPoints;
    if (rangeError) return dailyPoints;

    return dailyPoints.filter((p) => {
      const pStart = new Date(p.labelDate);
      pStart.setHours(CUT_HOUR, 0, 0, 0);
      return (
        pStart.getTime() >= startAt.getTime() &&
        pStart.getTime() < endAt.getTime()
      );
    });
  }, [dailyPoints, startAt, endAt, rangeError]);

  // 6) Weekly grouping (sum dollars)
  const displayed: Point[] = useMemo(() => {
    if (range === "Daily") return dailyFiltered;

    const map = new Map<
      string,
      { labelDate: Date; total: number; per: Record<string, number> }
    >();
    for (const p of dailyFiltered) {
      const wk = startOfWeekMonday(p.labelDate);
      const k = toDateKey(wk);
      const cur = map.get(k);
      if (!cur) {
        map.set(k, {
          labelDate: wk,
          total: p.total,
          per: { ...p.per },
        });
      } else {
        cur.total += p.total;
        for (const a of accounts)
          cur.per[a] = (cur.per[a] ?? 0) + (p.per[a] ?? 0);
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
  }, [dailyFiltered, range, accounts]);

  // Y scale (USD totals)
  const maxAbs: number = useMemo(() => {
    let m = 0;
    for (const p of displayed) m = Math.max(m, Math.abs(p.total));
    return Math.max(m, 1e-6);
  }, [displayed]);

  // Layout
  const PLOT_H = 280;
  const GUTTER_LEFT = 56;
  const GUTTER_RIGHT = 10;
  const GUTTER_TOP = 10;
  const GUTTER_BOTTOM = 44;

  const maxXTicks = 10;
  const step = Math.max(1, Math.ceil(displayed.length / maxXTicks));

  return (
    <Card className="py-0">
      <CardHeader className="border-b !p-0">
        <div className="px-6 pt-2 pb-3 sm:py-2">
          <CardTitle className="text-base">Daily/Weekly Returns ($)</CardTitle>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            {/* Range */}
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
              </select>
              <ChevronDown
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>

            {/* Date range — 08:00 cut, validated to payload days */}
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
                step={60}
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
                step={60}
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

                  {/* NEW: horizontal ticks at ±25/50/75% (quite visible) */}
                  {([0.25, 0.5, 0.75] as const).map((f) => (
                    <React.Fragment key={`ht-${f}`}>
                      {/* +f */}
                      <div
                        className="absolute inset-x-0 border-t border-dashed border-border/70"
                        style={{ top: `${50 - f * 50}%` }}
                        aria-hidden
                      />
                      {/* -f */}
                      <div
                        className="absolute inset-x-0 border-t border-dashed border-border/70"
                        style={{ top: `${50 + f * 50}%` }}
                        aria-hidden
                      />
                    </React.Fragment>
                  ))}

                  {/* Bars (CHANGED: square corners, no rounding) */}
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
                      const color = isPos
                        ? "hsl(142 72% 45%)"
                        : "hsl(0 72% 51%)";
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
                                  className="w-full" // no rounded corners
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
                                  <span className="text-muted-foreground">
                                    {a}
                                  </span>
                                  <span className="font-mono">
                                    {usd(p.per[a] ?? 0)}
                                  </span>
                                </div>
                              ))}
                              <div className="mt-1 h-px w-full bg-border/60" />
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  total
                                </span>
                                <span className="font-mono">
                                  {usd(p.total)}
                                </span>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>

                  {/* NEW: vertical ticks aligned to shown X labels */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    aria-hidden
                  >
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

                {/* Y-axis (kept inside border) */}
                <div
                  className="absolute text-[11px] text-muted-foreground"
                  style={{
                    left: 10,
                    top: 10,
                    bottom: 44,
                    width: 56 - 8,
                  }}
                >
                  <div className="absolute left-0 right-0" style={{ top: 2 }}>
                    <div className="flex items-center justify-end pl-10">
                      +{usd(maxAbs)}
                    </div>
                  </div>
                  <div
                    className="absolute left-0 right-0"
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  >
                    <div className="flex items-center justify-end pr-1">0</div>
                  </div>
                  <div
                    className="absolute left-0 right-0"
                    style={{ bottom: 2 }}
                  >
                    <div className="flex items-center justify-end pl-1">
                      −{usd(maxAbs)}
                    </div>
                  </div>
                  <div
                    className="absolute left-0 bottom-0 top-0 flex items-center justify-center pr-2"
                    style={{
                      writingMode: "vertical-rl",
                      transform: "rotate(270deg)",
                    }}
                  >
                    <span className="text-[10px]">Dollars</span>
                  </div>
                </div>

                {/* X-axis labels */}
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
