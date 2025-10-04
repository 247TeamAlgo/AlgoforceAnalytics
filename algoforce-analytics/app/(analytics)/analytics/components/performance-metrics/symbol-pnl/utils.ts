export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function absMax(nums: number[]): number {
  let m = 0;
  for (const n of nums) {
    const v = Math.abs(Number(n) || 0);
    if (v > m) m = v;
  }
  return m;
}

export function fmtUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtPct(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  // show two decimals; keep sign
  return `${v.toFixed(2)}%`;
}
