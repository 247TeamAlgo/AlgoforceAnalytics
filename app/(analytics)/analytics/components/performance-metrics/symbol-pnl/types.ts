export type Bucket = {
  label: string; // e.g., "BTCUSDT"
  total: number; // realized net PnL (USD)
  accounts?: Record<string, number>; // optional per-row breakdown (if caller already computed it)
};

/**
 * Raw symbol breakdown map (from API).
 * Example: symbols["BNBUSDT"] = { fund2: 12.3, fund3: -1.1, TOTAL: 11.2 }
 * Keys include account ids and possibly 'TOTAL'/'total'.
 */
export type SymbolBreakdown = Record<string, number>;
export type SymbolBreakdownMap = Record<string, SymbolBreakdown>;
