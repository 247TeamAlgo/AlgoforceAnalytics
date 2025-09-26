// lib/metrics.ts

import type { Pool, RowDataPacket } from "mysql2/promise";
import { readAccounts, type Account } from "@/lib/jsonStore";
import { readBaselineUsd } from "@/lib/baseline";
import type {
  MetricConfig,
  DailyRow,
  MetricsPayload,
  DailyReturnDollars,
  Streaks
} from "./types";
import { getSQLTradesPool } from "./db/sql";
import {
  rollBalances,
  equitySeries,
  drawdownStats,
  fetchDailyRows,
  resolveAsOf,
  // addDaysISO,
} from "./metrics_core";
import { getLosingStreakRows } from "../app/(analytics)/analytics_adem_1_josh/losing_streak";
import { probDDExceed } from "@/app/(analytics)/analytics_adem_1_josh/prob_dd_exceed";
import { computeRunProbabilities } from "@/app/(analytics)/analytics_adem_1_josh/prob_loss_k";
import { getHitRatioRows } from "@/app/(analytics)/analytics_adem_1_josh/hit_ratio";
import { PairRow } from "@/app/(analytics)/analytics_adem_5/types";
import { fetchAllPairRowsFromRedis } from "@/app/(analytics)/analytics_adem_5/utils";
import { computeConcentrationRisk, computePairExposures, computeSymbolExposures } from "@/app/(analytics)/analytics_adem_5/exposure";
import { computePairCorrelationMatrix } from "@/app/(analytics)/analytics_adem_5/correlationMatrix";

/* ========================== time helpers (tz-safe) ========================== */

function startOfMonthISO(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
function addDaysISODate(iso: string, n: number): string {
  return addDays(new Date(`${iso}T00:00:00`), n)
    .toISOString()
    .slice(0, 10);
}

// export function addDaysISO(d: Date, n: number): string {
//   return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
// }
function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function localTodayISO(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
// export function resolveAsOf(runDate: string | undefined, tz: string): Date {
//   // 00:00 "local" day (just the calendar anchor; we won’t rely on JS tz math)
//   return new Date(`${runDate ?? localTodayISO(tz)}T00:00:00`);
// }
function diffDaysInclusive(aISO: string, bISO: string): number {
  const a = new Date(`${aISO}T00:00:00Z`).getTime();
  const b = new Date(`${bISO}T00:00:00Z`).getTime();
  return Math.abs(Math.round((b - a) / 86_400_000)) + 1;
}

/** Minimal offset map to avoid MySQL tz tables. */
function tzOffsetHours(tz: string): number {
  const t = tz.toLowerCase().trim();
  if (
    t.includes("asia/manila") ||
    t.includes("asia/kuala_lumpur") ||
    t.includes("malay peninsula standard time") ||
    t.includes("kuala lumpur") ||
    t.includes("manila")
  )
    return 8;
  return 0;
}
function offsetHHMMSS(hours: number): string {
  const sign = hours >= 0 ? "" : "-";
  const hh = Math.abs(hours).toString().padStart(2, "0");
  return `${sign}${hh}:00:00`;
}
/** Convert a local-day midnight to a UTC timestamp string for MySQL. */
function localMidnightToUtc(dateISO: string, offsetHours: number): string {
  const ms = Date.parse(`${dateISO}T00:00:00Z`) - offsetHours * 3600_000;
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

/* ========================== math helpers ========================== */

// export function rollBalances(daily: DailyRow[], initial: number): RolledRow[] {
//   let cur = initial;
//   return (daily ?? []).map((r) => {
//     const start_balance = cur;
//     cur += r.net_pnl;
//     const end_balance = cur;
//     const daily_return_pct =
//       start_balance !== 0 ? (r.net_pnl / start_balance) * 100 : null;
//     return { ...r, start_balance, end_balance, daily_return_pct };
//   });
// }
// export function equitySeries(rows: RolledRow[]): EquityPoint[] {
//   return rows.map((r) => ({ day: r.day, equity: r.end_balance }));
// }
// export function drawdownStats(eq: EquityPoint[]): {
//   block: DrawdownBlock;
//   period: DrawdownPeriod;
// } {
//   if (!eq.length) {
//     return {
//       block: {
//         max_drawdown_pct: null,
//         max_drawdown_peak_day: null,
//         current_drawdown_pct: null,
//         current_drawdown_days: 0,
//       },
//       period: { peak_day: null, trough_day: null, recovery_day: null },
//     };
//   }
//   let peak = eq[0].equity;
//   let peakDay = eq[0].day;
//   let maxDD = 0;
//   let troughDay = eq[0].day;

//   const ddSeries = eq.map((p) => {
//     if (p.equity > peak) {
//       peak = p.equity;
//       peakDay = p.day;
//     }
//     const dd = peak !== 0 ? ((p.equity - peak) / peak) * 100 : 0;
//     if (dd < maxDD) {
//       maxDD = dd;
//       troughDay = p.day;
//     }
//     return { ...p, dd };
//   });

//   const current = ddSeries[ddSeries.length - 1];
//   let currentDays = 0;
//   for (let i = ddSeries.length - 1; i >= 0; i--) {
//     if (ddSeries[i].dd < 0) currentDays++;
//     else break;
//   }

//   let recoveryDay: string | null = null;
//   const idxPeak = eq.findIndex((e) => e.day === peakDay);
//   const peakVal = eq[idxPeak]?.equity ?? 0;
//   for (let i = idxPeak + 1; i < eq.length; i++) {
//     if (eq[i].equity >= peakVal) {
//       recoveryDay = eq[i].day;
//       break;
//     }
//   }

//   return {
//     block: {
//       max_drawdown_pct: Number(maxDD.toFixed(6)),
//       max_drawdown_peak_day: peakDay,
//       current_drawdown_pct: Number(current.dd.toFixed(6)),
//       current_drawdown_days: currentDays,
//     },
//     period: {
//       peak_day: peakDay,
//       trough_day: troughDay,
//       recovery_day: recoveryDay,
//     },
//   };
// }
function consecutiveLosingDays(daily: DailyRow[], threshold = 4): Streaks {
  let maxStreak = 0;
  let cur = 0;
  for (const r of daily ?? []) {
    if (r.net_pnl < 0) {
      cur++;
      if (cur > maxStreak) maxStreak = cur;
    } else cur = 0;
  }
  let currentStreak = 0;
  for (let i = (daily?.length ?? 0) - 1; i >= 0; i--) {
    if (daily![i].net_pnl < 0) currentStreak++;
    else break;
  }
  return {
    consecutive_losing_days: {
      max_streak: maxStreak,
      meets_threshold: maxStreak >= threshold,
      current_streak: currentStreak,
    },
  };
}

/* ========================== SQL helpers (no CONVERT_TZ) ========================== */

interface MtdRow extends RowDataPacket {
  mtd_net_pnl: number | null;
  mtd_fees: number | null;
}
interface CountRow extends RowDataPacket {
  c: number;
}
interface MinRow extends RowDataPacket {
  day_local: string | null;
}

let accCache: { byKey: Map<string, Account>; last: number } | null = null;
async function getAccountByKey(key: string): Promise<Account | undefined> {
  const now = Date.now();
  if (!accCache || now - accCache.last > 10_000) {
    const all = await readAccounts();
    accCache = {
      byKey: new Map(all.map((a) => [a.redisName.toLowerCase(), a])),
      last: now,
    };
  }
  return accCache.byKey.get(key.toLowerCase());
}
async function getTableName(key: string): Promise<string> {
  const acc = await getAccountByKey(key);
  return (acc?.binanceName || key).toLowerCase();
}

async function earliestLocalDateForAccount(
  accountKey: string,
  tz: string
): Promise<string | null> {
  const table = await getTableName(accountKey);
  const pool: Pool = getSQLTradesPool();
  const off = offsetHHMMSS(tzOffsetHours(tz));
  const [rows] = await pool.query<MinRow[]>(
    `SELECT DATE(ADDTIME(MIN(time), ?)) AS day_local FROM \`${table}\``,
    [off]
  );
  const iso = rows?.[0]?.day_local ?? null;
  return iso ? iso.slice(0, 10) : null;
}
async function latestLocalDateForAccount(
  accountKey: string,
  tz: string
): Promise<string | null> {
  const table = await getTableName(accountKey);
  const pool: Pool = getSQLTradesPool();
  const off = offsetHHMMSS(tzOffsetHours(tz));
  const [rows] = await pool.query<MinRow[]>(
    `SELECT DATE(ADDTIME(MAX(time), ?)) AS day_local FROM \`${table}\``,
    [off]
  );
  const iso = rows?.[0]?.day_local ?? null;
  return iso ? iso.slice(0, 10) : null;
}
export async function findEarliestLocalDateForAccounts(
  accounts: string[],
  tz: string
): Promise<string | null> {
  const all = await Promise.all(
    accounts.map((a) => earliestLocalDateForAccount(a, tz))
  );
  const dates = all.filter((x): x is string => !!x).sort();
  return dates[0] ?? null;
}
export async function findLatestLocalDateForAccounts(
  accounts: string[],
  tz: string
): Promise<string | null> {
  const all = await Promise.all(
    accounts.map((a) => latestLocalDateForAccount(a, tz))
  );
  const dates = all.filter((x): x is string => !!x).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** Fetch daily aggregates between LOCAL [startLocalISO, endLocalISO) */
// export async function fetchDailyRows(
//   accountKey: string,
//   tz: string,
//   startLocalISO: string,
//   endLocalISO: string
// ): Promise<DailyRow[]> {
//   const table = await getTableName(accountKey);
//   const pool: Pool = getSQLTradesPool();

//   const offHrs = tzOffsetHours(tz);
//   const offStr = offsetHHMMSS(offHrs);

//   const utcStart = localMidnightToUtc(startLocalISO, offHrs);
//   const utcEnd = localMidnightToUtc(endLocalISO, offHrs);

//   const sql = `
//     SELECT
//       DATE(ADDTIME(time, ?))         AS day_local,
//       SUM(realizedPnl)               AS gross_pnl,
//       SUM(commission)                AS fees,
//       SUM(realizedPnl - commission)  AS net_pnl
//     FROM \`${table}\`
//     WHERE time >= ? AND time < ?
//     GROUP BY 1
//     ORDER BY 1`;
//   const [rows] = await pool.query<DailyAggRow[]>(sql, [
//     offStr,
//     utcStart,
//     utcEnd,
//   ]);

//   return (rows ?? []).map((r) => ({
//     day: (r.day_local ?? "").slice(0, 10),
//     gross_pnl: Number(r.gross_pnl ?? 0),
//     fees: Number(r.fees ?? 0),
//     net_pnl: Number(r.net_pnl ?? 0),
//   }));
// }

async function fetchMTD(
  accountKey: string,
  tz: string,
  monthStartLocalISO: string,
  nextMonthStartLocalISO: string
): Promise<{ mtd_net_pnl: number; mtd_fees: number }> {
  const table = await getTableName(accountKey);
  const pool: Pool = getSQLTradesPool();

  const offHrs = tzOffsetHours(tz);
  const utcStart = localMidnightToUtc(monthStartLocalISO, offHrs);
  const utcEnd = localMidnightToUtc(nextMonthStartLocalISO, offHrs);

  const sql = `
    SELECT
      SUM(realizedPnl) - SUM(commission) AS mtd_net_pnl,
      SUM(commission)                     AS mtd_fees
    FROM \`${table}\`
    WHERE time >= ? AND time < ?`;
  const [rows] = await pool.query<MtdRow[]>(sql, [utcStart, utcEnd]);
  const r = rows?.[0];
  return {
    mtd_net_pnl: Number(r?.mtd_net_pnl ?? 0),
    mtd_fees: Number(r?.mtd_fees ?? 0),
  };
}

async function fetchWinRates(
  accountKey: string
): Promise<{
  rolling_30d_win_rate_pct: number | null;
  win_rate_from_run_start_pct: number | null;
}> {
  const table = await getTableName(accountKey);
  const pool: Pool = getSQLTradesPool();
  const [rowsAll] = await pool.query<RowDataPacket[]>(
    `SELECT 100.0 * SUM( (realizedPnl - commission) > 0 ) / COUNT(*) AS win_rate_all FROM \`${table}\``
  );
  const wrAll = rowsAll?.[0]?.win_rate_all as number | null | undefined;

  return {
    rolling_30d_win_rate_pct: null, // filled by caller when needed
    win_rate_from_run_start_pct: wrAll != null ? Number(wrAll) : null,
  };
}

async function fetchTradeCount(accountKey: string): Promise<number> {
  const table = await getTableName(accountKey);
  const pool: Pool = getSQLTradesPool();
  const [rows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS c FROM \`${table}\``
  );
  return Number(rows?.[0]?.c ?? 0);
}

/* ========================== main per-account ========================== */

export async function computeAccountMetrics(
  accountKey: string,
  cfg: MetricConfig
): Promise<MetricsPayload> {
  const tz = cfg.tz || "Asia/Manila";

  // Resolve desired start/end (date-range takes precedence over legacy)
  let startISO = cfg.startDate;
  let endISO = cfg.endDate;

  if (!startISO || !endISO) {
    if (cfg.earliest && !startISO) {
      startISO =
        (await earliestLocalDateForAccount(accountKey, tz)) ??
        localTodayISO(tz);
    }
    if (!endISO) endISO = localTodayISO(tz);

    if (!startISO && cfg.lastNDays && cfg.runDate) {
      const asOf = resolveAsOf(cfg.runDate, tz);
      endISO = fmtISO(asOf);
      startISO = addDaysISODate(endISO, -(cfg.lastNDays - 1));
    } else if (!startISO && !endISO) {
      endISO = localTodayISO(tz);
      startISO = endISO;
    }
  }

  // Normalize order
  if (startISO! > endISO) [startISO, endISO] = [endISO, startISO];

  // Clamp end to latest available local day for this account (handles “2026” future)
  const latestForAcc = await latestLocalDateForAccount(accountKey, tz);
  if (latestForAcc && endISO! > latestForAcc) endISO = latestForAcc;
  // Also ensure start <= end after clamping
  if (startISO! > endISO!) startISO = endISO;

  // Fetch using [start, end+1)
  const endExclusive = addDaysISODate(endISO!, +1);
  const initial_balance = readBaselineUsd(accountKey);

  // Window
  const dailyWindow = await fetchDailyRows(
    accountKey,
    tz,
    startISO!,
    endExclusive
  );
  const rolled = rollBalances(dailyWindow, initial_balance);
  const daily_return_dollars: DailyReturnDollars[] = rolled.map((r) => ({
    day: r.day,
    daily_profit_loss_usd: Number(r.net_pnl.toFixed(8)),
  }));

  // MTD relative to endISO's month
  const endAsDate = new Date(`${endISO}T00:00:00`);
  const monthStartLocalISO = startOfMonthISO(endAsDate);
  const nextMonthStartLocalISO = startOfMonthISO(
    new Date(endAsDate.getFullYear(), endAsDate.getMonth() + 1, 1)
  );
  const { mtd_net_pnl, mtd_fees } = await fetchMTD(
    accountKey,
    tz,
    monthStartLocalISO,
    nextMonthStartLocalISO
  );
  const mtdDaily = await fetchDailyRows(
    accountKey,
    tz,
    monthStartLocalISO,
    endExclusive
  );
  const mtdRolled = rollBalances(mtdDaily, initial_balance);
  const mtd_return_pct =
    mtdRolled.length > 0
      ? (mtdRolled[mtdRolled.length - 1].end_balance /
          mtdRolled[0].start_balance -
          1) *
        100
      : null;

  // Drawdowns
  const eqAll = equitySeries(
    rollBalances(
      await fetchDailyRows(accountKey, tz, "1970-01-01", endExclusive),
      initial_balance
    )
  );
  const { block: ddAll, period: ddPeriod } = drawdownStats(eqAll);
  const { block: ddMtd } = drawdownStats(equitySeries(mtdRolled));

  // Win rates
  const wrAll = await fetchWinRates(accountKey);
  const start30ISO = addDaysISODate(endISO!, -29);
  const last30 = await fetchDailyRows(accountKey, tz, start30ISO, endExclusive);
  const posDays = last30.filter((d) => d.net_pnl > 0).length;
  const wr30 = last30.length ? (100 * posDays) / last30.length : null;

  const tradesCount = await fetchTradeCount(accountKey);
  const streaks = consecutiveLosingDays(
    mtdDaily.length ? mtdDaily : dailyWindow,
    4
  );

  let total_return_pct_over_window: number | null = null;
  if (rolled.length) {
    const a = rolled[0].start_balance;
    const b = rolled[rolled.length - 1].end_balance;
    total_return_pct_over_window = a !== 0 ? (b / a - 1) * 100 : null;
  }

  const last_n_days = diffDaysInclusive(startISO!, endISO!);
  const runDateUsed = endISO;

  // Whatsapp basis for performance and distribution
  const whatsapp_losing_streak = await getLosingStreakRows(accountKey);
  const prob_dd_exceed_cfg = { X_list: Array.from({ length: 10 }, (_, i) => (i + 0.3) / 100) }; // Eventually this should be editable in frontend with whatever method
  const whatsapp_prob_dd_exceed = await probDDExceed(accountKey, prob_dd_exceed_cfg);
  const prob_loss_k_cfg = { X_list: Array.from({ length: 10 }, (_, i) => (i + 1)) };
  const whatsapp_prob_loss_k = await computeRunProbabilities(accountKey, prob_loss_k_cfg.X_list)
  const whatsapp_hit_ratio = await getHitRatioRows(accountKey);

  return {
    config: { initial_balance, run_date: runDateUsed || "", last_n_days },
    daily_return_last_n_days: {
      window_start: startISO || "",
      window_end: endISO || "",
      daily_rows: rolled.map((r) => ({
        ...r,
        gross_pnl: Number(r.gross_pnl.toFixed(8)),
        fees: Number(r.fees.toFixed(8)),
        net_pnl: Number(r.net_pnl.toFixed(8)),
        start_balance: Number(r.start_balance.toFixed(8)),
        end_balance: Number(r.end_balance.toFixed(8)),
        daily_return_pct:
          r.daily_return_pct == null
            ? null
            : Number(r.daily_return_pct.toFixed(8)),
      })),
      total_return_pct_over_window:
        total_return_pct_over_window == null
          ? null
          : Number(total_return_pct_over_window.toFixed(8)),
    },
    month_to_date: {
      mtd_return_pct:
        mtd_return_pct == null ? null : Number(mtd_return_pct.toFixed(8)),
      mtd_return_usd: Number(mtd_net_pnl.toFixed(8)),
      mtd_total_fees_usd: Number(mtd_fees.toFixed(8)),
      mtd_drawdown_pct: ddMtd.current_drawdown_pct,
    },
    drawdowns: ddAll,
    drawdown_period: ddPeriod,
    win_rates: {
      rolling_30d_win_rate_pct: wr30 == null ? null : Number(wr30.toFixed(8)),
      win_rate_from_run_start_pct: wrAll.win_rate_from_run_start_pct,
    },
    counts: { number_of_trades_total: tradesCount },
    streaks,
    daily_return_dollars,
    mtd_return_dollars: Number(mtd_net_pnl.toFixed(8)),
    mtd_total_fees_dollars: Number(mtd_fees.toFixed(8)),
    initial_balance,
    whatsapp_losing_streak: whatsapp_losing_streak,
    whatsapp_prob_dd_exceed: whatsapp_prob_dd_exceed,
    whatsapp_prob_loss_k: whatsapp_prob_loss_k,
    whatsapp_hit_ratio: whatsapp_hit_ratio,
  };
}

/* ========================== merged/overall helpers ========================== */

export async function computeOverallMetrics(
  cfg: MetricConfig
): Promise<MetricsPayload> {
  const accounts = (await readAccounts())
    .filter((a) => a.monitored)
    .map((a) => a.redisName);
  return computeMergedMetricsForAccounts(accounts, cfg);
}

export async function computeMergedMetricsForAccounts(
  accounts: string[],
  cfg: MetricConfig
): Promise<MetricsPayload> {
  const tz = cfg.tz || "Asia/Manila";

  // Resolve a single common start if earliest=true and no explicit startDate
  const commonStart =
    cfg.earliest && !cfg.startDate
      ? ((await findEarliestLocalDateForAccounts(accounts, tz)) ??
        localTodayISO(tz))
      : cfg.startDate;

  // Clamp end to the latest available across accounts
  const requestedEnd = cfg.endDate ?? localTodayISO(tz);
  const scopeLatest =
    (await findLatestLocalDateForAccounts(accounts, tz)) ?? requestedEnd;
  const commonEnd = requestedEnd > scopeLatest ? scopeLatest : requestedEnd;

  // Ensure order
  let finalStart = commonStart ?? localTodayISO(tz);
  if (finalStart > commonEnd) finalStart = commonEnd;

  const per = await Promise.all(
    accounts.map((a) =>
      computeAccountMetrics(a, {
        ...cfg,
        startDate: finalStart,
        endDate: commonEnd,
        earliest: false,
      })
    )
  );

  // Aggregate daily rows by day label
  const byDay = new Map<string, { gross: number; fees: number; net: number }>();
  for (const acc of per) {
    for (const r of acc.daily_return_last_n_days.daily_rows) {
      const slot = byDay.get(r.day) ?? { gross: 0, fees: 0, net: 0 };
      slot.gross += r.gross_pnl;
      slot.fees += r.fees;
      slot.net += r.net_pnl;
      byDay.set(r.day, slot);
    }
  }
  const days = [...byDay.keys()].sort();
  const daily: DailyRow[] = days.map((d) => {
    const v = byDay.get(d)!;
    return { day: d, gross_pnl: v.gross, fees: v.fees, net_pnl: v.net };
  });

  const initial_balance = accounts.reduce((s, a) => s + readBaselineUsd(a), 0);
  const rolled = rollBalances(daily, initial_balance);
  const daily_return_dollars: DailyReturnDollars[] = rolled.map((r) => ({
    day: r.day,
    daily_profit_loss_usd: Number(r.net_pnl.toFixed(8)),
  }));

  const mtd_return_usd = per.reduce(
    (s, a) => s + a.month_to_date.mtd_return_usd,
    0
  );
  const mtd_total_fees_usd = per.reduce(
    (s, a) => s + a.month_to_date.mtd_total_fees_usd,
    0
  );
  const mtd_return_pct =
    initial_balance !== 0
      ? ((initial_balance + mtd_return_usd) / initial_balance - 1) * 100
      : null;

  const { block: ddAll, period: ddPeriod } = drawdownStats(
    equitySeries(rolled)
  );

  const totalTrades = per.reduce(
    (s, a) => s + a.counts.number_of_trades_total,
    0
  );
  const wrAllWeighted = totalTrades
    ? per.reduce(
        (s, a) =>
          s +
          (a.win_rates.win_rate_from_run_start_pct ?? 0) *
            a.counts.number_of_trades_total,
        0
      ) / totalTrades
    : null;
  const wr30Weighted = totalTrades
    ? per.reduce(
        (s, a) =>
          s +
          (a.win_rates.rolling_30d_win_rate_pct ?? 0) *
            a.counts.number_of_trades_total,
        0
      ) / totalTrades
    : null;

  let total_return_pct_over_window: number | null = null;
  if (rolled.length) {
    const a = rolled[0].start_balance;
    const b = rolled[rolled.length - 1].end_balance;
    total_return_pct_over_window = a !== 0 ? (b / a - 1) * 100 : null;
  }

  const last_n_days = diffDaysInclusive(finalStart, commonEnd);

  // Concentration & Leverage
  const rows: PairRow[] = await fetchAllPairRowsFromRedis();
  const symbolExposures = computeSymbolExposures(rows);
  const pairExposures   = computePairExposures(rows);
  const totalBalance = 100_000; // Hmmm where tf did chatgpt get this, def change it, rely to sql balance instead?
  const concentration = computeConcentrationRisk(pairExposures, totalBalance);
  const pairIds = Array.from(new Set(rows.map(r => r.pair)));
  const fakeSeries: Record<string, number[]> = Object.fromEntries(
    pairIds.map(id => [id, [] as number[]])
  );
  const corrMatrix = computePairCorrelationMatrix(pairIds, fakeSeries);

  return {
    config: { initial_balance, run_date: commonEnd, last_n_days },
    daily_return_last_n_days: {
      window_start: finalStart,
      window_end: commonEnd,
      daily_rows: rolled.map((r) => ({
        ...r,
        gross_pnl: Number(r.gross_pnl.toFixed(8)),
        fees: Number(r.fees.toFixed(8)),
        net_pnl: Number(r.net_pnl.toFixed(8)),
        start_balance: Number(r.start_balance.toFixed(8)),
        end_balance: Number(r.end_balance.toFixed(8)),
        daily_return_pct:
          r.daily_return_pct == null
            ? null
            : Number(r.daily_return_pct.toFixed(8)),
      })),
      total_return_pct_over_window:
        total_return_pct_over_window == null
          ? null
          : Number(total_return_pct_over_window.toFixed(8)),
    },
    month_to_date: {
      mtd_return_pct:
        mtd_return_pct == null ? null : Number(mtd_return_pct.toFixed(8)),
      mtd_return_usd: Number(mtd_return_usd.toFixed(8)),
      mtd_total_fees_usd: Number(mtd_total_fees_usd.toFixed(8)),
      mtd_drawdown_pct: ddAll.current_drawdown_pct,
    },
    drawdowns: ddAll,
    drawdown_period: ddPeriod,
    win_rates: {
      rolling_30d_win_rate_pct:
        wr30Weighted == null ? null : Number(wr30Weighted.toFixed(8)),
      win_rate_from_run_start_pct:
        wrAllWeighted == null ? null : Number(wrAllWeighted.toFixed(8)),
    },
    counts: { number_of_trades_total: totalTrades },
    streaks: consecutiveLosingDays(daily, 4),
    daily_return_dollars,
    mtd_return_dollars: Number(mtd_return_usd.toFixed(8)),
    mtd_total_fees_dollars: Number(mtd_total_fees_usd.toFixed(8)),
    initial_balance,
    symbolExposures: symbolExposures,
    pairExposures: pairExposures,
    concentration: concentration,
    corrMatrix: corrMatrix,
  };
}

/** Convenience for /api/metrics: returns { selected, merged, per_account } with a unified window */
export async function computeSelectedMetrics(
  selected: string[],
  cfg: MetricConfig
): Promise<{
  selected: string[];
  merged: MetricsPayload;
  per_account: Record<string, MetricsPayload>;
}> {
  const merged = await computeMergedMetricsForAccounts(selected, cfg);
  const start = merged.daily_return_last_n_days.window_start;
  const end = merged.daily_return_last_n_days.window_end;

  const perEntries = await Promise.all(
    selected.map(
      async (k) =>
        [
          k,
          await computeAccountMetrics(k, {
            ...cfg,
            startDate: start,
            endDate: end,
            earliest: false,
          }),
        ] as const
    )
  );
  const per_account: Record<string, MetricsPayload> =
    Object.fromEntries(perEntries);
  return { selected, merged, per_account };
}