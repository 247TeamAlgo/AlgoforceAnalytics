export type Bucket = {
  label: string;  // e.g., "BTCUSDT"
  total: number;  // realized net PnL (USD)
};

/** Optional per-symbol percentage (if you have a real ROI map). */
export type PercentMap = Record<string, number>;
