// lib/metrics_core.ts
// Cause of creation: the whatsapp prob_dd_exceed smth uses metrics of some sort which caused a circular dependency at the time, idk rn tho

import type { RowDataPacket } from "mysql2/promise";
import type {
  DailyRow,
  RolledRow,
  EquityPoint,
  DrawdownBlock,
  DrawdownPeriod,
} from "./types";
import { getSQLTradesPool } from "./db/sql";
import { getSQLOHLCPool } from "@/app/(analytics)/analytics_adem_3/utils";

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

export function addDaysISO(d: Date, n: number): string {
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}
export function resolveAsOf(runDate: string | undefined, tz: string): Date {
  return new Date(`${runDate ?? localTodayISO(tz)}T00:00:00`);
}

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
function localMidnightToUtc(dateISO: string, offsetHours: number): string {
  const ms = Date.parse(`${dateISO}T00:00:00Z`) - offsetHours * 3600_000;
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export function rollBalances(daily: DailyRow[], initial: number): RolledRow[] {
  let cur = initial;
  return (daily ?? []).map((r) => {
    const start_balance = cur;
    cur += r.net_pnl;
    const end_balance = cur;
    const daily_return_pct =
      start_balance !== 0 ? (r.net_pnl / start_balance) * 100 : null;
    return { ...r, start_balance, end_balance, daily_return_pct };
  });
}
export function equitySeries(rows: RolledRow[]): EquityPoint[] {
  return rows.map((r) => ({ day: r.day, equity: r.end_balance }));
}
export function drawdownStats(eq: EquityPoint[]): {
  block: DrawdownBlock;
  period: DrawdownPeriod;
} {
  if (!eq.length) {
    return {
      block: {
        max_drawdown_pct: null,
        max_drawdown_peak_day: null,
        current_drawdown_pct: null,
        current_drawdown_days: 0,
      },
      period: { peak_day: null, trough_day: null, recovery_day: null },
    };
  }
  let peak = eq[0].equity;
  let peakDay = eq[0].day;
  let maxDD = 0;
  let troughDay = eq[0].day;

  const ddSeries = eq.map((p) => {
    if (p.equity > peak) {
      peak = p.equity;
      peakDay = p.day;
    }
    const dd = peak !== 0 ? ((p.equity - peak) / peak) * 100 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      troughDay = p.day;
    }
    return { ...p, dd };
  });

  const current = ddSeries[ddSeries.length - 1];
  let currentDays = 0;
  for (let i = ddSeries.length - 1; i >= 0; i--) {
    if (ddSeries[i].dd < 0) currentDays++;
    else break;
  }

  let recoveryDay: string | null = null;
  const idxPeak = eq.findIndex((e) => e.day === peakDay);
  const peakVal = eq[idxPeak]?.equity ?? 0;
  for (let i = idxPeak + 1; i < eq.length; i++) {
    if (eq[i].equity >= peakVal) {
      recoveryDay = eq[i].day;
      break;
    }
  }

  return {
    block: {
      max_drawdown_pct: Number(maxDD.toFixed(6)),
      max_drawdown_peak_day: peakDay,
      current_drawdown_pct: Number(current.dd.toFixed(6)),
      current_drawdown_days: currentDays,
    },
    period: {
      peak_day: peakDay,
      trough_day: troughDay,
      recovery_day: recoveryDay,
    },
  };
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

/* -------------------- OHLC Section -------------------- */

export interface DailyAggOHLCRow extends RowDataPacket {
  datetime: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export type OhlcRow = {
  datetime: string; // UTC "YYYY-MM-DD HH:MM:SS"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Server SQL helper used for OHLC */
export async function fetchOHLCRows(
  tableOrSymbol: string,
  tz: string,
  startLocalISO: string,
  endLocalISO: string
): Promise<OhlcRow[]> {
  const pool = getSQLOHLCPool();

  const offHrs = tzOffsetHours(tz);
  const utcStart = localMidnightToUtc(startLocalISO, offHrs);
  const utcEnd = localMidnightToUtc(endLocalISO, offHrs);

  const sql = `
    SELECT datetime, open, high, low, close, volume
    FROM \`${tableOrSymbol.toLowerCase()}\`
    WHERE datetime >= ? AND datetime < ?
    ORDER BY datetime ASC
  `;

  const [rows] = await pool.query<DailyAggOHLCRow[]>(sql, [utcStart, utcEnd]);

  const out: OhlcRow[] = [];
  for (const r of rows ?? []) {
    const { datetime, open, high, low, close, volume } = r;
    if (
      datetime &&
      open != null &&
      high != null &&
      low != null &&
      close != null &&
      volume != null
    ) {
      out.push({
        datetime,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
      });
    }
  }
  return out;
}
