import { getSQLTradesPool } from "../../../../../lib/db/sql";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getTableName } from "./accounts_json";
import { localMidnightToUtc, offsetHHMMSS, tzOffsetHours } from "./time_tz";
import { DailyRow } from "../metrics/types";

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

export async function earliestLocalDateForAccount(
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

export async function latestLocalDateForAccount(
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

export async function fetchMTD(
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

export async function fetchTradeCount(accountKey: string): Promise<number> {
  const table = await getTableName(accountKey);
  const pool: Pool = getSQLTradesPool();
  const [rows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS c FROM \`${table}\``
  );
  return Number(rows?.[0]?.c ?? 0);
}

interface DailyAggRow extends RowDataPacket {
  day_local: string;
  gross_pnl: number | null;
  fees: number | null;
  net_pnl: number | null;
}

/** Server SQL helper used by prob_dd_exceed and metrics */
export async function fetchDailyRows(
  accountKey: string,
  tz: string,
  startLocalISO: string,
  endLocalISO: string
): Promise<DailyRow[]> {
  const pool = getSQLTradesPool();
  const offHrs = tzOffsetHours(tz);
  const offStr = offsetHHMMSS(offHrs);
  const utcStart = localMidnightToUtc(startLocalISO, offHrs);
  const utcEnd = localMidnightToUtc(endLocalISO, offHrs);
  const table = accountKey.toLowerCase();

  const sql = `
    SELECT
      DATE(ADDTIME(time, ?))         AS day_local,
      SUM(realizedPnl)               AS gross_pnl,
      SUM(commission)                AS fees,
      SUM(realizedPnl - commission)  AS net_pnl
    FROM \`${table}\`
    WHERE time >= ? AND time < ?
    GROUP BY 1
    ORDER BY 1`;
  const [rows] = await pool.query<DailyAggRow[]>(sql, [offStr, utcStart, utcEnd]);

  return (rows ?? []).map((r) => ({
    day: (r.day_local ?? "").slice(0, 10),
    gross_pnl: Number(r.gross_pnl ?? 0),
    fees: Number(r.fees ?? 0),
    net_pnl: Number(r.net_pnl ?? 0),
  }));
}