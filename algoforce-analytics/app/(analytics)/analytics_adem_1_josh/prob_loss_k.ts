// app/analytics_adem_1/prob_loss_k.ts
import "server-only";

import { promises as fs } from "fs";
import path from "path";
import {
  extractAndSort,
  filterByRange,
} from "@/app/(analytics)/analytics_adem_1_josh/utils";
import type { RangeBound } from "@/app/(analytics)/analytics_adem_1_josh/types";

/* ============================= Types ============================= */

export type RunProbabilities = {
  k: number;   // run length threshold
  N: number;   // number of periods (days/weeks)
  q: number;   // empirical loss probability
  empirical: number; // fraction of starts yielding a run ≥ k (empirical flags)
  iid: number;       // IID Bernoulli(q) prob of ≥1 run of length ≥ k within N
};

export type RunProbRow = {
  account: string;
  daily: RunProbabilities[];   // one entry per k
  weekly: RunProbabilities[];  // one entry per k
};

/* ========================= Input normalization ========================= */

function normalizeAccounts(accounts: string | string[]): string[] {
  const list = Array.isArray(accounts) ? accounts : [accounts];
  return Array.from(
    new Set(list.map((s) => (s ?? "").trim()).filter(Boolean))
  );
}

/** Ensure k array is clean: integers >= 1, unique, sorted asc */
function normalizeKArray(kArr: number[] | number): number[] {
  const src = Array.isArray(kArr) ? kArr : [kArr];
  const cleaned = src
    .map((k) => Math.floor(Number(k)))
    .filter((k) => Number.isFinite(k) && k >= 1);
  return Array.from(new Set(cleaned)).sort((a, b) => a - b);
}

/* ========================= File/series helpers ========================= */

async function readSortedSeries(account: string) {
  try {
    const filePath = path.join(
      process.cwd(),
      "data",
      `${account.toUpperCase()}.json`
    );
    await fs.access(filePath);
    const raw = await fs.readFile(filePath, "utf-8");
    const json: Record<string, unknown> = JSON.parse(raw);
    const sorted = extractAndSort(json);
    return sorted.length ? sorted : undefined;
  } catch {
    return undefined;
  }
}

async function readFiltered(
  account: string,
  start?: RangeBound,
  end?: RangeBound
) {
  const sorted = await readSortedSeries(account);
  if (!sorted) return undefined;
  const filtered = filterByRange(sorted, { start, end });
  return filtered.length ? filtered : undefined;
}

/* ============================ Parsing utils ============================ */

function parseProfit(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object") {
    const raw = (value as Record<string, unknown>)["Profit"];
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw === "string") {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/* ======================== ISO day/week bucketing ======================== */

function isoDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getISOWeekYear(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}
function getISOWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays =
    Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;
  return Math.ceil(diffDays / 7);
}
function isoWeekKey(date: Date): string {
  const y = getISOWeekYear(date);
  const w = getISOWeekNumber(date);
  return `${y}-W${w.toString().padStart(2, "0")}`;
}

/** Build last-of-day loss flags from filtered series. */
function lastOfDayLossFlags(
  filtered: Array<{ date: Date; value: unknown }>
): boolean[] {
  const lastByDay = new Map<string, number | null>();
  for (const e of filtered)
    lastByDay.set(isoDayKey(e.date), parseProfit(e.value));
  const days = Array.from(lastByDay.keys()).sort();
  const flags: boolean[] = [];
  for (const d of days) {
    const p = lastByDay.get(d);
    if (p == null) continue;
    flags.push(p < 0);
  }
  return flags;
}

/** Build last-of-week loss flags from filtered series. */
function lastOfWeekLossFlags(
  filtered: Array<{ date: Date; value: unknown }>
): boolean[] {
  const lastByWeek = new Map<string, number | null>();
  for (const e of filtered)
    lastByWeek.set(isoWeekKey(e.date), parseProfit(e.value));
  const weeks = Array.from(lastByWeek.keys()).sort();
  const flags: boolean[] = [];
  for (const w of weeks) {
    const p = lastByWeek.get(w);
    if (p == null) continue;
    flags.push(p < 0);
  }
  return flags;
}

/* ======================= Run-probability engines ======================= */

// Empirical: fraction of start positions with ≥ k consecutive losses
function empiricalProbRunAtLeastK(
  loss: ReadonlyArray<boolean>,
  k: number
): number {
  const n = loss.length;
  if (k <= 0) return 1;
  if (n < k) return 0;
  let hits = 0;
  for (let i = 0; i <= n - k; i += 1) {
    if (!loss[i]) continue;
    let ok = true;
    for (let j = 0; j < k; j += 1) {
      if (!loss[i + j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits += 1;
  }
  return hits / (n - k + 1);
}

// IID Bernoulli(q): probability of at least one run ≥ k within N periods
function iidProbRunAtLeastKWithinN(
  N: number,
  k: number,
  q: number
): number {
  if (k <= 0) return 1;
  if (N < k) return 0;
  if (q <= 0) return 0;
  if (q >= 1) return 1;

  const dp: number[][] = Array.from({ length: N + 1 }, () =>
    Array<number>(k).fill(0)
  );
  dp[0][0] = 1;

  for (let n = 0; n < N; n += 1) {
    for (let r = 0; r < k; r += 1) {
      const pState = dp[n][r];
      if (pState === 0) continue;
      dp[n + 1][0] += pState * (1 - q); // win → reset run length
      const nextR = r + 1; // loss → increment run length
      if (nextR < k) dp[n + 1][nextR] += pState * q; // keep only sub-k states
    }
  }
  const noRun = dp[N].reduce((s, v) => s + v, 0);
  return 1 - noRun;
}

function makeRunProbabilities(
  lossFlags: boolean[],
  k: number
): RunProbabilities {
  const N = lossFlags.length;
  const q = N ? lossFlags.filter(Boolean).length / N : 0;
  return {
    k,
    N,
    q,
    empirical: empiricalProbRunAtLeastK(lossFlags, k),
    iid: iidProbRunAtLeastKWithinN(N, k, q),
  };
}

/* ============================== Public API ============================== */

/**
 * Accepts a single account or list, and an ARRAY of k values.
 * Returns one row per account; each row contains arrays of RunProbabilities
 * for each requested k, for both daily and weekly horizons.
 */
export async function computeRunProbabilities(
  accounts: string | string[],
  kArr: number[] | number, // allows single number too; normalized below
  opts?: { start?: RangeBound; end?: RangeBound }
): Promise<RunProbRow[]> {
  const start = (opts?.start ?? undefined) as RangeBound | undefined;
  const end = (opts?.end ?? undefined) as RangeBound | undefined;

  const keys = normalizeAccounts(accounts);
  const ks = normalizeKArray(kArr);

  const out: RunProbRow[] = [];

  for (const account of keys) {
    const filtered = await readFiltered(account, start, end);
    if (!filtered) continue;

    const dailyFlags = lastOfDayLossFlags(filtered);
    const weeklyFlags = lastOfWeekLossFlags(filtered);

    const daily: RunProbabilities[] = ks.map((k) =>
      makeRunProbabilities(dailyFlags, k)
    );
    const weekly: RunProbabilities[] = ks.map((k) =>
      makeRunProbabilities(weeklyFlags, k)
    );

    out.push({ account, daily, weekly });
  }

  return out;
}