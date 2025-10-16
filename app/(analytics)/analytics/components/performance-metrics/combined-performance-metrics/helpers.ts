// Unified palette + small helpers used across metrics cards

export type MetricsColors = {
  railBg: string;
  guide: string;
  realized: string;
  margin: string;
  upnl: string;
  pos: string;
  neg: string;
};

export const METRICS_COLORS: MetricsColors = {
  railBg: "rgba(148,163,184,0.14)", // neutral rail (works in dark/light)
  guide: "var(--muted-foreground)", // dashed guides / axes
  realized: "hsl(210 90% 55%)", // blue
  margin: "hsl(28  96% 56%)", // orange
  upnl: "hsl(45  94% 55%)", // gold
  pos: "hsl(152 62% 50%)", // green (positive PnL)
  neg: "hsl(0   84% 62%)", // red   (negative PnL)
};

export const REALIZED_COLOR = METRICS_COLORS.realized;
export const MARGIN_COLOR = METRICS_COLORS.margin;

/** Diverging heat for drawdown thresholds: amber -> orange -> red. */
export function makeDrawdownLevelColors(n: number): string[] {
  if (n <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 1 : i / (n - 1);
    const hue = Math.round(35 - 35 * t); // 35 -> 0
    const sat = Math.round(96 - 8 * t); // 96% -> 88%
    const lig = Math.round(58 - 16 * t); // 58% -> 42%
    out.push(`hsl(${hue} ${sat}% ${lig}%)`);
  }
  return out;
}

/** Sum selected accounts into an equity series across [startDay, endDay] (inclusive). */
export function computeSeriesOverWindow(
  byDay: Record<string, Record<string, number>>,
  accounts: string[],
  startDay: string,
  endDay: string
): { eq: number[] } {
  const days = Object.keys(byDay).sort();
  const eq: number[] = [];

  for (let i = 0; i < days.length; i += 1) {
    const d = days[i]!;
    if (startDay && d < startDay) continue;
    if (endDay && d > endDay) continue;

    const row = byDay[d] ?? {};
    let s = 0;
    if (accounts.length) {
      for (let j = 0; j < accounts.length; j += 1) {
        const k = accounts[j]!;
        s += Number(row[k] ?? 0);
      }
    } else {
      s = Number(row.total ?? 0);
    }
    eq.push(s);
  }

  return { eq };
}

export function toNum(n: unknown, fallback = 0): number {
  if (typeof n === "number") return Number.isFinite(n) ? n : fallback;
  if (typeof n === "string") {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }
  return fallback;
}

export function pct4(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${(v * 100).toFixed(4)}%`;
}

export function usd2(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function sumSelectedFromRow(
  row: Record<string, unknown> | undefined,
  accounts: readonly string[]
): number {
  if (!row) return 0;
  let s = 0;
  for (const acc of accounts) if (row[acc] != null) s += toNum(row[acc], 0);
  return s;
}

export function nearestKeyAtOrBefore(
  keys: string[],
  target: string
): string | null {
  if (!keys.length) return null;
  const i = keys.findIndex((k) => k > target);
  if (i === -1) return keys[keys.length - 1]!;
  if (i === 0) return null;
  return keys[i - 1]!;
}

export function nearestKeyAtOrAfter(
  keys: string[],
  target: string
): string | null {
  if (!keys.length) return null;
  const i = keys.findIndex((k) => k >= target);
  return i === -1 ? null : keys[i]!;
}
