// app/(analytics)/analytics/components/performance-metrics/symbol-net/types.ts
export type Bucket = {
  label: string; // e.g., "BTCUSDT"
  total: number; // realized net PnL (USD)
  accounts?: Record<string, number>; // optional breakdown for tooltips
};

/** Optional per-symbol percentage (if you have a real ROI map). */
export type PercentMap = Record<string, number>;
