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

export function usd6(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
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

/* series helpers */
export function computeSeriesOverWindow(
  balance: Record<string, Record<string, number>>,
  accounts: readonly string[],
  start: string,
  end: string
): { keys: string[]; eq: number[] } {
  const keys = Object.keys(balance || {}).sort();
  const startKey = nearestKeyAtOrAfter(keys, start);
  const endKey = nearestKeyAtOrBefore(keys, end);
  if (!startKey || !endKey) return { keys: [], eq: [] };
  const i0 = keys.indexOf(startKey);
  const i1 = keys.indexOf(endKey);
  const windowKeys = keys.slice(i0, i1 + 1);
  const eq = windowKeys.map((k) => sumSelectedFromRow(balance[k], accounts));
  return { keys: windowKeys, eq };
}

/* colors + chart config */
export const REALIZED_COLOR = "#39A0ED"; // blue
export const MARGIN_COLOR = "#8A5CF6"; // purple

export type ChartConfig = Record<string, { label: string; color: string }>;

export const chartCfg: ChartConfig = {
  pos: { label: "Realized", color: REALIZED_COLOR },
  neg: { label: "Margin", color: MARGIN_COLOR },
};
