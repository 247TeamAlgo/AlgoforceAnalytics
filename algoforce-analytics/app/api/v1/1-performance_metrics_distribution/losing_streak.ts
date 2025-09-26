// app/analytics_adem_1_josh/losing_streak.ts
import "server-only";
import { promises as fs } from "fs";
import path from "path";
import {
  extractAndSort,
  analyzeProfitSeries,
  filterByRange,
} from "@/app/(analytics)/analytics_adem_1_josh/utils";
import type { RangeBound } from "@/app/(analytics)/analytics_adem_1_josh/types";

export type LosingStreakRow = {
  account: string;
  perReport_numNegativeStreak: number;
  perReport_maxNegativeStreak: number;
  perReport_meetsThreshold: number;
  perDay_numNegativeStreak: number;
  perDay_maxNegativeStreak: number;
  perDay_meetsThreshold: number;
  perWeek_numNegativeStreak: number;
  perWeek_maxNegativeStreak: number;
  perWeek_meetsThreshold: number;
};

async function preprocessJson(account: string) {
  try {
    // const filePath = path.join(process.cwd(), "data", `${account.toUpperCase()}.json`);
    const filePath = path.join(process.cwd(),  `data/${account.toUpperCase()}.json`);
    // cheap existence check avoids throwing on read
    await fs.access(filePath);
    const raw = await fs.readFile(filePath, "utf-8");
    const jsonData: Record<string, unknown> = JSON.parse(raw);
    const sorted = extractAndSort(jsonData);
    return sorted.length ? sorted : undefined;
  } catch {
    return undefined; // swallow and let caller skip this account
  }
}

/** Accepts a single account or list. */
export async function getLosingStreakRows(
  accounts: string | string[],
  opts?: { start?: RangeBound; end?: RangeBound }
): Promise<LosingStreakRow[]> {
  const start = (opts?.start ?? undefined) as RangeBound | undefined;
  const end = (opts?.end ?? undefined) as RangeBound | undefined;

  const list = Array.isArray(accounts) ? accounts : [accounts];
  const uniq = Array.from(new Set(list.map(a => (a ?? "").trim()).filter(Boolean)));

  const out: LosingStreakRow[] = [];
  for (const acct of uniq) {
    const sorted = await preprocessJson(acct);
    if (!sorted) continue;

    const filtered = filterByRange(sorted, { start, end });
    if (filtered.length === 0) continue;

    const a = analyzeProfitSeries(filtered);
    const perReport = a.elementSummary;
    // console.log(`[TEST] perReport = ${perReport.numNegativeStreaks} ${perReport.maxNegativeStreak} ${perReport.meetsThreshold}`)
    const perDay = a.dailySummary;
    // console.log(`[TEST] perDay = ${perReport.numNegativeStreaks} ${perReport.maxNegativeStreak} ${perReport.meetsThreshold}`)
    const perWeek = a.weeklySummary;
    // console.log(`[TEST] perWeek = ${perReport.numNegativeStreaks} ${perReport.maxNegativeStreak} ${perReport.meetsThreshold}`)

    out.push({
      account: acct,
      perReport_numNegativeStreak: perReport.numNegativeStreaks,
      perReport_maxNegativeStreak: perReport.maxNegativeStreak,
      perReport_meetsThreshold: perReport.meetsThreshold ? 1 : 0,
      perDay_numNegativeStreak: perDay.numNegativeStreaks,
      perDay_maxNegativeStreak: perDay.maxNegativeStreak,
      perDay_meetsThreshold: perDay.meetsThreshold ? 1 : 0,
      perWeek_numNegativeStreak: perWeek.numNegativeStreaks,
      perWeek_maxNegativeStreak: perWeek.maxNegativeStreak,
      perWeek_meetsThreshold: perWeek.meetsThreshold ? 1 : 0,
    });
  }
  return out;
}
