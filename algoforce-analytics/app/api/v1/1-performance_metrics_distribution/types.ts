// app/analytics_adem_1/types.ts
// NUMBER OF CONSECUTIVE LOSING DAYS
export type DateEntry = {
  key: string;
  date: Date;
  value: unknown;
};
export type TraversalEntry = {
  key: string;
  date: string;          // ISO 8601
  value: unknown;
  currentStreak: number; // running negative streak up to this element
  maxStreak: number;     // max negative streak seen so far
  meets_threshold: boolean;
};
export type ProfitPoint = {
  key: string;   // original key (with date)
  date: string;  // ISO 8601
  profit: number | null;
};
export type StreakStep = {
  currentStreak: number;
  maxStreak: number;
};
export type StreakSummary = {
  numNegativeStreaks: number;   // number of distinct negative runs
  maxNegativeStreak: number;    // longest run length
  meetsThreshold: boolean; // whether maxNegativeStreak >= threshold
};
export type DayAggregate = {
  day: string;   // YYYY-MM-DD (UTC)
  total: number; // sum of profits for the day
};
export type WeekAggregate = {
  week: string;  // YYYY-Www (ISO week, UTC)
  total: number; // sum of profits for the week
};
export type ProfitAnalysis = {
  // Per-element profit series (raw)
//   series: ProfitPoint[];
  // Daily running streaks per day + summary
//   daily: Array<DayAggregate & StreakStep>;
  dailySummary: StreakSummary;
  // Weekly running streaks per week + summary
//   weekly: Array<WeekAggregate & StreakStep>;
  weeklySummary: StreakSummary;
  // Element-level summary (parallel to traversal’s running stats)
  elementSummary: StreakSummary;
};
// Range filter
export type RangeBound = Date | string | "min" | "max";
export type RangeSelector = {
  start?: RangeBound; // default "min"
  end?: RangeBound;   // default "max"
};

// PROBABILITY OF LOSING MORE THAN K DAYS/WEEKS IN A ROW
export type RunProbabilities = {
  k: number;    // required run length (≥ k)
  N: number;    // horizon length
  q: number;    // loss rate (Bernoulli parameter) estimated from data
  empirical: number; // empirical fraction of starts with ≥ k losses
  iid: number;       // iid Bernoulli model probability within N
};

export type RunProbabilityPayload = {
  daily: RunProbabilities;
  weekly: RunProbabilities;
};

// HIT RATIO
export type WinLossCounts = {
  wins: number;
  losses: number;
  zeros: number;  // exactly zero (excluded from rate denom)
  total: number;  // wins + losses + zeros
};

export type WinLossRates = WinLossCounts & {
  winRate: number;  // wins / (wins + losses)
  lossRate: number; // losses / (wins + losses)
};

export type WinLossPayload = {
  perTrade: WinLossRates; // each element
  perDay: WinLossRates;   // aggregate per UTC day, sign of total
  perWeek: WinLossRates;  // aggregate per ISO week, sign of total
};