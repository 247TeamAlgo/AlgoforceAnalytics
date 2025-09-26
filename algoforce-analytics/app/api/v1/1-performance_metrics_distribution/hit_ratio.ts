// app/api/analytics_adem_1_josh/hit_ratio.ts
import "server-only";

import { promises as fs } from "fs";
import path from "path";
import {
  extractAndSort,
  filterByRange,
} from "@/app/(analytics)/analytics_adem_1_josh/utils";
import type { RangeBound } from "@/app/(analytics)/analytics_adem_1_josh/types";
import type { DateEntry, WinLossCounts, WinLossPayload, WinLossRates } from "./types";

/* ===================== Public row shape (aligned w/ losing_streak) ===================== */
export type HitRatioRow = {
  account: string;

  // Per trade (aligned name to losing_streak's "perReport")
  perReport_wins: number;
  perReport_losses: number;
  perReport_zeros: number;
  perReport_total: number;
  perReport_winRate: number;   // 0..1
  perReport_lossRate: number;  // 0..1

  // Per day (last-of-day sign)
  perDay_wins: number;
  perDay_losses: number;
  perDay_zeros: number;
  perDay_total: number;
  perDay_winRate: number;      // 0..1
  perDay_lossRate: number;     // 0..1

  // Per week (last-of-week sign)
  perWeek_wins: number;
  perWeek_losses: number;
  perWeek_zeros: number;
  perWeek_total: number;
  perWeek_winRate: number;     // 0..1
  perWeek_lossRate: number;    // 0..1
};

/* =============================== Internals (unchanged math) =============================== */

function finalizeRates(counts: WinLossCounts): WinLossRates {
  const denom = counts.wins + counts.losses;
  const winRate = denom > 0 ? counts.wins / denom : 0;
  const lossRate = denom > 0 ? counts.losses / denom : 0;
  return { ...counts, winRate, lossRate };
}

function parseProfit(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const raw = obj["Profit"];
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw === "string") {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/** ---------- ISO day/week helpers (UTC) ---------- */
function isoDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() || 7)));
  return d.getUTCFullYear();
}
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;
  return Math.ceil(diffDays / 7);
}
function isoWeekKey(date: Date): string {
  const y = getISOWeekYear(date);
  const w = getISOWeekNumber(date);
  return `${y}-W${w.toString().padStart(2, "0")}`;
}

/** ---------- Core selectors (last-of-day / last-of-week) ---------- */
function lastOfDayValues(sorted: DateEntry[]): number[] {
  const lastByDay = new Map<string, number | null>();
  for (const e of sorted) {
    lastByDay.set(isoDayKey(e.date), parseProfit(e.value));
  }
  const days = Array.from(lastByDay.keys()).sort();
  const result: number[] = [];
  for (const d of days) {
    const p = lastByDay.get(d);
    if (p === null || p === undefined) continue; // skip missing/NaN
    result.push(p);
  }
  return result;
}

function lastOfWeekValues(sorted: DateEntry[]): number[] {
  const lastByWeek = new Map<string, number | null>();
  for (const e of sorted) {
    lastByWeek.set(isoWeekKey(e.date), parseProfit(e.value));
  }
  const weeks = Array.from(lastByWeek.keys()).sort();
  const result: number[] = [];
  for (const w of weeks) {
    const p = lastByWeek.get(w);
    if (p === null || p === undefined) continue;
    result.push(p);
  }
  return result;
}

/** Old single-series API (kept for reuse/tests) */
export function computeWinLossRates(sorted: DateEntry[]): WinLossPayload {
  // Per-trade (element-level)
  let tradeWins = 0;
  let tradeLosses = 0;
  let tradeZeros = 0;
  for (const e of sorted) {
    const p = parseProfit(e.value);
    if (p == null) continue;
    if (p > 0) tradeWins += 1;
    else if (p < 0) tradeLosses += 1;
    else tradeZeros += 1;
  }
  const perTrade = finalizeRates({
    wins: tradeWins,
    losses: tradeLosses,
    zeros: tradeZeros,
    total: tradeWins + tradeLosses + tradeZeros,
  });

  // Per-day (last-of-day sign)
  const dayVals = lastOfDayValues(sorted);
  let dayWins = 0;
  let dayLosses = 0;
  let dayZeros = 0;
  for (const v of dayVals) {
    if (v > 0) dayWins += 1;
    else if (v < 0) dayLosses += 1;
    else dayZeros += 1;
  }
  const perDay = finalizeRates({
    wins: dayWins,
    losses: dayLosses,
    zeros: dayZeros,
    total: dayWins + dayLosses + dayZeros,
  });

  // Per-week (last-of-week sign)
  const weekVals = lastOfWeekValues(sorted);
  let weekWins = 0;
  let weekLosses = 0;
  let weekZeros = 0;
  for (const v of weekVals) {
    if (v > 0) weekWins += 1;
    else if (v < 0) weekLosses += 1;
    else weekZeros += 1;
  }
  const perWeek = finalizeRates({
    wins: weekWins,
    losses: weekLosses,
    zeros: weekZeros,
    total: weekWins + weekLosses + weekZeros,
  });

  return { perTrade, perDay, perWeek };
}

/* ============================ JSON preprocess (same style) ============================ */

async function preprocessJson(account: string) {
  try {
    const filePath = path.join(process.cwd(), "data", `${account.toUpperCase()}.json`);
    await fs.access(filePath); // cheap existence check
    const raw = await fs.readFile(filePath, "utf-8");
    const jsonData: Record<string, unknown> = JSON.parse(raw);
    const sorted = extractAndSort(jsonData);
    return sorted.length ? sorted : undefined;
  } catch {
    return undefined; // swallow and let caller skip this account
  }
}

/* ============================ Batched API (aligned) ============================ */

/**
 * Accepts a single account or list, optional range.
 * Iterates unique accounts, filters series, computes hit ratios,
 * and returns one row per account — just like getLosingStreakRows.
 */
export async function getHitRatioRows(
  accounts: string | string[],
  opts?: { start?: RangeBound; end?: RangeBound }
): Promise<HitRatioRow[]> {
  const start = (opts?.start ?? undefined) as RangeBound | undefined;
  const end = (opts?.end ?? undefined) as RangeBound | undefined;

  const list = Array.isArray(accounts) ? accounts : [accounts];
  const uniq = Array.from(new Set(list.map((a) => (a ?? "").trim()).filter(Boolean)));

  const out: HitRatioRow[] = [];

  for (const acct of uniq) {
    const sorted = await preprocessJson(acct);
    if (!sorted) continue;

    const filtered = filterByRange(sorted, { start, end });
    if (filtered.length === 0) continue;

    const wl = computeWinLossRates(filtered);

    out.push({
      account: acct,

      perReport_wins: wl.perTrade.wins,
      perReport_losses: wl.perTrade.losses,
      perReport_zeros: wl.perTrade.zeros,
      perReport_total: wl.perTrade.total,
      perReport_winRate: wl.perTrade.winRate,
      perReport_lossRate: wl.perTrade.lossRate,

      perDay_wins: wl.perDay.wins,
      perDay_losses: wl.perDay.losses,
      perDay_zeros: wl.perDay.zeros,
      perDay_total: wl.perDay.total,
      perDay_winRate: wl.perDay.winRate,
      perDay_lossRate: wl.perDay.lossRate,

      perWeek_wins: wl.perWeek.wins,
      perWeek_losses: wl.perWeek.losses,
      perWeek_zeros: wl.perWeek.zeros,
      perWeek_total: wl.perWeek.total,
      perWeek_winRate: wl.perWeek.winRate,
      perWeek_lossRate: wl.perWeek.lossRate,
    });
  }

  return out;
}