// app/analytics_adem_1/utils.ts
// NUMBER OF CONSECUTIVE LOSING DAYS
import {
  DateEntry,
  TraversalEntry,
  ProfitPoint,
  ProfitAnalysis,
  StreakStep,
  StreakSummary,
  DayAggregate,
  WeekAggregate,
  RangeSelector,
  RangeBound,
} from "./types";

/** ---------- Parsing ---------- */
function parseProfit(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const raw = obj["Profit"];
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw === "string") {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/** ---------- Core ---------- */
export function extractAndSort(data: Record<string, unknown>): DateEntry[] {
  const entries: DateEntry[] = [];

  for (const [key, value] of Object.entries(data)) {
    // Assumes "ID MM/DD/YYYY, HH:MM"
    const parts = key.split(" ");
    const datetimeStr = parts.slice(1).join(" ");
    const d = new Date(datetimeStr);

    if (!Number.isNaN(d.getTime())) entries.push({ key, date: d, value });
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  return entries;
}

export function traverseWithStreaks(sorted: DateEntry[]): TraversalEntry[] {
  let currentStreak = 0;
  let maxStreak = 0;
  const threshold = 4; // configurable
  const result: TraversalEntry[] = [];

  for (const entry of sorted) {
    const profit = parseProfit(entry.value);

    if (profit !== null && profit < 0) {
      currentStreak += 1;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }

    result.push({
      key: entry.key,
      date: entry.date.toISOString(),
      value: entry.value,
      currentStreak,
      maxStreak,
      meets_threshold: maxStreak >= threshold,
    });
  }

  return result;
}

/** ---------- ISO day/week helpers (UTC) ---------- */
function isoDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() || 7)));
  return d.getUTCFullYear();
}
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;
  return Math.ceil(diffDays / 7);
}
function isoWeekKey(date: Date): string {
  const y = getISOWeekYear(date);
  const w = getISOWeekNumber(date);
  return `${y}-W${w.toString().padStart(2, "0")}`;
}

/** ---------- Generic streak engine over an ordered numeric series ---------- */
type StreakPoint = { label: string; value: number | null };

function computeStreakSeries(points: StreakPoint[]): {
  steps: Array<StreakPoint & StreakStep>;
  summary: StreakSummary;
} {
  const steps: Array<StreakPoint & StreakStep> = [];
  let currentStreak = 0;
  let maxStreak = 0;
  let numNegativeStreaks = 0;
  let inRun = false;

  for (const p of points) {
    const v = p.value;
    if (v !== null && Number.isFinite(v) && v < 0) {
      currentStreak += 1;
      if (!inRun) {
        inRun = true;
        numNegativeStreaks += 1;
      }
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
      inRun = false;
    }
    steps.push({ ...p, currentStreak, maxStreak });
  }

  const threshold = 4; // configurable
  const meetsThreshold = maxStreak >= threshold;
  return {
    steps,
    summary: { numNegativeStreaks, maxNegativeStreak: maxStreak, meetsThreshold },
  };
}

/** ---------- Selectors: last-of-day / last-of-week aggregates ---------- */
function lastOfDayAggregate(sorted: DateEntry[]): DayAggregate[] {
  const lastByDay = new Map<string, number | null>();
  for (const e of sorted) {
    const p = parseProfit(e.value);
    lastByDay.set(isoDayKey(e.date), p); // overwrite → last seen for the day
  }
  const days = Array.from(lastByDay.keys()).sort();
  const result: DayAggregate[] = [];
  for (const d of days) {
    const p = lastByDay.get(d);
    if (p === null || p === undefined) continue;
    result.push({ day: d, total: p }); // "total" now means last-of-day value
  }
  return result;
}

function lastOfWeekAggregate(sorted: DateEntry[]): WeekAggregate[] {
  const lastByWeek = new Map<string, number | null>();
  for (const e of sorted) {
    const p = parseProfit(e.value);
    lastByWeek.set(isoWeekKey(e.date), p); // overwrite → last seen for the week
  }
  const weeks = Array.from(lastByWeek.keys()).sort();
  const result: WeekAggregate[] = [];
  for (const w of weeks) {
    const p = lastByWeek.get(w);
    if (p === null || p === undefined) continue;
    result.push({ week: w, total: p }); // "total" now means last-of-week value
  }
  return result;
}

/** ---------- Analytics: element, last-of-day, last-of-week ---------- */
export function analyzeProfitSeries(sorted: DateEntry[]): ProfitAnalysis {
  // Per-element profit series (aligned with sorted order)
  const series: ProfitPoint[] = sorted.map((e) => ({
    key: e.key,
    date: e.date.toISOString(),
    profit: parseProfit(e.value),
  }));

  // Last-of-day and last-of-week
  const dailyAgg = lastOfDayAggregate(sorted);
  const weeklyAgg = lastOfWeekAggregate(sorted);

  // Streaks at each granularity
  const elementLevel = computeStreakSeries(series.map((s) => ({ label: s.key, value: s.profit })));
  const dailyLevel = computeStreakSeries(dailyAgg.map((d) => ({ label: d.day, value: d.total })));
  const weeklyLevel = computeStreakSeries(weeklyAgg.map((w) => ({ label: w.week, value: w.total })));

  return {
    // series: series,
    // daily: dailyLevel.steps.map((d) => ({ day: d.label, total: d.value ?? 0, currentStreak: d.currentStreak, maxStreak: d.maxStreak })),
    dailySummary: dailyLevel.summary,
    // weekly: weeklyLevel.steps.map((w) => ({ week: w.label, total: w.value ?? 0, currentStreak: w.currentStreak, maxStreak: w.maxStreak })),
    weeklySummary: weeklyLevel.summary,
    elementSummary: elementLevel.summary,
  };
}

/** ---------- Range filtering over an already-sorted array ---------- */
function normalizeBound(bound: RangeBound | undefined, fallback: Date): Date {
  if (bound === undefined) return fallback;
  if (bound === "min" || bound === "max") return fallback;
  if (bound instanceof Date) return Number.isNaN(bound.getTime()) ? fallback : bound;
  const d = new Date(bound);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/**
 * Filters an already-sorted DateEntry[] to [start, end] inclusive.
 * Options:
 *  - start/end can be Date, ISO string, "min", or "max".
 *  - Defaults: start="min", end="max".
 * Assumes `sorted` is ascending by `date`.
 */
export function filterByRange(sorted: DateEntry[], range: RangeSelector = {}): DateEntry[] {
  if (sorted.length === 0) return [];

  const dataMin = sorted[0].date;
  const dataMax = sorted[sorted.length - 1].date;

  const startDate =
    range.start === undefined || range.start === "min"
      ? dataMin
      : range.start === "max"
      ? dataMax
      : normalizeBound(range.start, dataMin);

  const endDate =
    range.end === undefined || range.end === "max"
      ? dataMax
      : range.end === "min"
      ? dataMin
      : normalizeBound(range.end, dataMax);

  if (startDate.getTime() > endDate.getTime()) return [];

  return sorted.filter(
    (e) => e.date.getTime() >= startDate.getTime() && e.date.getTime() <= endDate.getTime()
  );
}
