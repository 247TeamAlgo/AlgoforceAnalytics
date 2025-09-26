// app/analytics/perf/utils/format.ts
export const pct = (x: number, dp = 2) => `${(x * 100).toFixed(dp)}%`;
export const dec = (x: number | null | undefined, dp = 2) =>
  typeof x === "number" && Number.isFinite(x) ? x.toFixed(dp) : "—";
