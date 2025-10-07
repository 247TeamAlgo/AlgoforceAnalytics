// app/(analytics)/analytics/components/performance-metrics/losing-days/types.ts
export type ThresholdLevel = { value: number; label?: string };

export type LosingDaysEntry = {
  consecutive?: number;
  days?: Record<string, number | undefined>;
};

export type LosingDaysPayload = Record<string, LosingDaysEntry>;

export type ApiPayload = {
  losingDays?: LosingDaysPayload;
};

export type AccountMini = { redisName: string; strategy?: string | null };

export type Row = {
  account: string;            // "fund3" or "total"
  current: number;            // consecutive losing days
  crossedIndex: number;       // index into levels; -1 if none
  color: string;              // chosen level color or default
  notify: boolean;            // true when current >= first threshold
  days: ReadonlyArray<{ day: string; pnl: number }>;
  isTotal: boolean;           // true if the "total" row
};
