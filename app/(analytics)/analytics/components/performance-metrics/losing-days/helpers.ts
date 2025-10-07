import { ThresholdLevel, LosingDaysPayload, Row } from "./types";

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function niceUsd(n: number): string {
  const s = n < 0 ? "-" : "";
  return `${s}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeDays(
  days: Record<string, number | undefined> | undefined
): ReadonlyArray<{ day: string; pnl: number }> {
  if (!days) return [];
  const out: Array<{ day: string; pnl: number }> = [];
  for (const [day, pnl] of Object.entries(days)) {
    if (typeof pnl === "number" && Number.isFinite(pnl)) {
      out.push({ day, pnl });
    }
  }
  // most-recent first
  out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return out;
}

/**
 * Build rows from API payload. Includes a "total" row from the 'combined' key.
 * No 'max' anywhere. Pure function.
 */
export function toRows(
  apiLosingDays: LosingDaysPayload | undefined,
  levels: ThresholdLevel[],
  levelColors: string[],
  defaultColor: string
): Row[] {
  const payload: LosingDaysPayload = apiLosingDays ?? {};
  const ordered = [...levels].sort(
    (a: ThresholdLevel, b: ThresholdLevel) => a.value - b.value
  );
  const bounds: number[] = ordered.map((l) => l.value);

  const rows: Row[] = [];

  // 1) per-account rows (exclude 'combined')
  for (const [key, entry] of Object.entries(payload)) {
    if (key === "combined") continue;
    const currentRaw =
      typeof entry?.consecutive === "number"
        ? Math.floor(entry.consecutive)
        : 0;
    const current = clamp(Math.max(0, currentRaw), 0, Number.MAX_SAFE_INTEGER);

    let idx = -1;
    for (let i = 0; i < bounds.length; i += 1) {
      if (current >= bounds[i]!) idx = i;
      else break;
    }
    const color = idx >= 0 ? (levelColors[idx] ?? defaultColor) : defaultColor;

    rows.push({
      account: key,
      current,
      crossedIndex: idx,
      color,
      notify: current >= (bounds[0] ?? Number.POSITIVE_INFINITY),
      days: normalizeDays(entry?.days),
      isTotal: false,
    });
  }

  // 2) total row from 'combined'
  if (payload.combined) {
    const e = payload.combined;
    const currentRaw =
      typeof e.consecutive === "number" ? Math.floor(e.consecutive) : 0;
    const current = clamp(Math.max(0, currentRaw), 0, Number.MAX_SAFE_INTEGER);

    let idx = -1;
    for (let i = 0; i < bounds.length; i += 1) {
      if (current >= bounds[i]!) idx = i;
      else break;
    }
    const color = idx >= 0 ? (levelColors[idx] ?? defaultColor) : defaultColor;

    rows.push({
      account: "total",
      current,
      crossedIndex: idx,
      color,
      notify: current >= (bounds[0] ?? Number.POSITIVE_INFINITY),
      days: normalizeDays(e.days),
      isTotal: true,
    });
  }

  // sort: always push TOTAL to the bottom; otherwise by current desc then alpha
  rows.sort((a: Row, b: Row) => {
    if (a.isTotal && !b.isTotal) return 1; // a after b
    if (!a.isTotal && b.isTotal) return -1; // a before b
    const d = b.current - a.current;
    if (d !== 0) return d;
    return a.account.localeCompare(b.account);
  });

  return rows;
}

/** Sum current streaks by strategy and overall. */
export function tallyByStrategyMap(
  rows: readonly Row[],
  mapping: Record<string, string>
): { perStrategy: Record<string, number>; total: number } {
  const perStrategy: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    total += r.current;
    const strategy = mapping[r.account];
    if (!strategy) continue;
    perStrategy[strategy] = (perStrategy[strategy] ?? 0) + r.current;
  }
  return { perStrategy, total };
}
