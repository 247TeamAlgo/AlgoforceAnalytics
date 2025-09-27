// src/metrics/dailyPnl.ts
/* eslint-disable no-console */
import { type Pool, RowDataPacket } from "mysql2/promise";
import { getSQLTradesPool } from "@/lib/db/sql"; // adjust path if needed
import { getTableName } from "./accounts_json";
import { tzOffsetHours } from "./z_time_tz";   // adjust path if needed

// ---------- Types ----------
export interface TradeRowRaw extends RowDataPacket {
  symbol: string;
  id: number | string | null;
  orderId: number | string | null;
  side: string | null;
  price: number | string | null;
  qty: number | string | null;
  realizedPnl: number | string | null;
  commission: number | string | null;
  time: Date | string | null;
  positionSide: string | null;
}

export interface AccountTrade {
  symbol: string;
  id: number;
  orderId: number;
  side: string;
  price: number;
  qty: number;
  realizedPnl: number; // net of commission
  commission: number;
  time: Date;          // UTC
  positionSide: string;
  account: string;
}


export interface DailyPnlRow {
  date_from_8am: string;      // YYYY-MM-DD (local day after shift)
  daily_realizedpnl: number;  // rounded to 2 decimals
}

// ---------- Helpers ----------
function toNumber(x: number | string | null | undefined): number {
  if (x === null || x === undefined) return 0;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toDateUTC(x: Date | string | null): Date | null {
  if (x == null) return null;
  const d = x instanceof Date ? x : new Date(x);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const mm = m < 10 ? `0${m}` : `${m}`;
  const dd = day < 10 ? `0${day}` : `${day}`;
  return `${y}-${mm}-${dd}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------- Core: fetch, aggregate, streak ----------
export async function readAccountTrades(params: {
  accountKey: string;
  startISO: string; // inclusive
  endISO: string;   // inclusive
}): Promise<AccountTrade[]> {
  const { accountKey, startISO, endISO } = params;
  const table = await getTableName(accountKey);
  const pool: Pool = getSQLTradesPool();

  const sql = `
    SELECT symbol, id, orderId, side, price, qty, realizedPnl, commission, time, positionSide
    FROM \`${table}\`
    WHERE time >= ? AND time <= ?
  `;

  const [rows] = await pool.query<TradeRowRaw[]>(sql, [startISO, endISO]);
  if (!rows || rows.length === 0) return [];

  const cleaned: AccountTrade[] = rows
    .map((r) => {
      const t = toDateUTC(r.time);
      if (!t) return null;
      const commission = toNumber(r.commission);
      const realizedGross = toNumber(r.realizedPnl);
      const realizedNet = realizedGross - commission;
      return {
        symbol: r.symbol ?? "",
        id: Number(r.id ?? 0),
        orderId: Number(r.orderId ?? 0),
        side: r.side ?? "",
        price: toNumber(r.price),
        qty: toNumber(r.qty),
        realizedPnl: realizedNet,
        commission,
        time: t,
        positionSide: r.positionSide ?? "",
        account: accountKey,
      } as AccountTrade;
    })
    .filter((x): x is AccountTrade => x !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  return cleaned;
}

/**
 * Sum realizedPnl per local “trading day” with a custom start hour (default 08:00).
 * Locality is approximated via a fixed offset from tzOffsetHours(tz) at runtime,
 * matching your SQL pattern (i.e., no per-timestamp DST correction).
 */
export function realizedpnlDailySum(
  trades: AccountTrade[],
  tz: string,
  dayStartHour: number = 8,
): DailyPnlRow[] {
  if (trades.length === 0) return [];

  const tzHours = tzOffsetHours(tz); // e.g., Europe/Zurich -> +2 in summer
  const shiftMs = (tzHours - dayStartHour) * 60 * 60 * 1000;

  const byDate = new Map<string, number>();
  for (const t of trades) {
    const key = isoDateUTC(new Date(t.time.getTime() + shiftMs));
    byDate.set(key, (byDate.get(key) ?? 0) + t.realizedPnl);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date_from_8am, sum]) => ({
      date_from_8am,
      daily_realizedpnl: round2(sum),
    }));
}

/** O(n) longest consecutive negatives. Set includeZero=true to count <= 0. */
export function countMaxNegStreak(values: readonly number[], includeZero: boolean = false): number {
  let streak = 0;
  let best = 0;
  for (const v of values) {
    const neg = includeZero ? v <= 0 : v < 0;
    streak = neg ? streak + 1 : 0;
    if (streak > best) best = streak;
  }
  return best;
}

// ---------- Example (keep or delete) ----------
export async function consecutiveLosingDays(accountKey: string,
  startISO: string, endISO: string):
    Promise<{ daily: DailyPnlRow[]; streak: number }> {
      const trades = await readAccountTrades({
        accountKey: accountKey,
        startISO: startISO,
        endISO: endISO,
      });
      const daily = realizedpnlDailySum(trades, "Asia/Manila", 8);

      // If you want to “reverse for testing the tallying only”, mirror pandas:
      // const reversed = [...daily].reverse();
      console.table(daily);
      const streak = countMaxNegStreak(daily.map((d) => d.daily_realizedpnl), false) - 1;
      // console.log(`Max loss streak = ${streak}`);
      return {daily, streak}
}