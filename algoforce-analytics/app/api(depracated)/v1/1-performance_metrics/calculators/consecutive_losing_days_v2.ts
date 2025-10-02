/* eslint-disable no-console */
// import 'dotenv/config';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';

type Side = 'BUY' | 'SELL';
type PositionSide = 'LONG' | 'SHORT' | 'BOTH';

export interface TradeRow {
  symbol: string;
  id: number;
  orderId: number;
  side: Side;
  price: number;
  qty: number;
  realizedPnl: number;   // net of commission (realizedPnl - commission)
  commission: number;    // original commission as received from DB
  time: Date;            // parsed and validated
  positionSide: PositionSide;
  account: string;
}

interface TradeRowRaw {
  symbol: string;
  id: number | string;
  orderId: number | string;
  side: string;
  price: number | string;
  qty: number | string;
  realizedPnl: number | string | null;
  commission: number | string | null;
  time: string | Date | null;
  positionSide: string;
}

export interface DailyRow {
  day: string;     // YYYY-MM-DD
  net_pnl: number; // sum over that bucket
}

export interface LossStreak {
  current: number;
  max: number;
}

const MYSQL_DSN: string = process.env.TRADES_DSN ?? "mysql+mysqldb://247team:password@192.168.50.238:3306/trades";

function assertIsSide(v: string): asserts v is Side {
  if (v !== 'BUY' && v !== 'SELL') throw new Error(`Invalid side: ${v}`);
}

function assertIsPositionSide(v: string): asserts v is PositionSide {
  if (v !== 'LONG' && v !== 'SHORT' && v !== 'BOTH') {
    throw new Error(`Invalid positionSide: ${v}`);
  }
}

function toNumberSafe(val: number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : 0;
}

function isValidDate(d: Date): boolean {
  return Number.isFinite(d.getTime());
}

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function eachDayInclusive(startYmd: string, endYmd: string): string[] {
  const [sy, sm, sd] = startYmd.split('-').map((x) => Number(x));
  const [ey, em, ed] = endYmd.split('-').map((x) => Number(x));
  const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  const end = new Date(ey, em - 1, ed, 0, 0, 0, 0);
  if (!isValidDate(start) || !isValidDate(end)) {
    throw new Error(`Invalid day range: ${startYmd}..${endYmd}`);
  }
  if (start.getTime() > end.getTime()) return [];
  const out: string[] = [];
  for (
    let d = new Date(start.getTime());
    d.getTime() <= end.getTime();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    out.push(ymd(d));
  }
  return out;
}

export async function makePool(dsn: string = MYSQL_DSN): Promise<Pool> {
  // DSN like: mysql://user:pass@host:3306/dbname
  return createPool({
    uri: dsn,
    connectionLimit: 4,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
}

/** Basic identifier whitelist — use real allow-listing in production if you have multiple known tables. */
function validateIdentifier(identifier: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return identifier;
}

export async function readAccountTrades(
  pool: Pool,
  account: string,
  startDt: string,
  endDt: string,
): Promise<TradeRow[]> {
  const safeTable = validateIdentifier(account);

  const sql =
    `SELECT symbol, id, orderId, side, price, qty, realizedPnl, commission, time, positionSide ` +
    `FROM \`${safeTable}\` WHERE time >= ? AND time <= ?`;

  const [rows] = await pool.execute<(TradeRowRaw & RowDataPacket)[]>(sql, [startDt, endDt]);

  if (!rows || rows.length === 0) {
    return [];
  }

  const parsed: TradeRow[] = rows
    .map((r) => {
      const time =
        typeof r.time === 'string'
          ? new Date(r.time.replace(' ', 'T'))
          : r.time instanceof Date
            ? r.time
            : new Date(NaN);
      if (!isValidDate(time)) return null;

      assertIsSide(String(r.side));
      assertIsPositionSide(String(r.positionSide));

      const realized = toNumberSafe(r.realizedPnl);
      const fees = toNumberSafe(r.commission);
      const realizedNet = realized - fees;

      return {
        symbol: String(r.symbol),
        id: Number(r.id),
        orderId: Number(r.orderId),
        side: r.side,
        price: toNumberSafe(r.price),
        qty: toNumberSafe(r.qty),
        realizedPnl: realizedNet,
        commission: fees,
        time,
        positionSide: r.positionSide,
        account: safeTable,
      };
    })
    .filter((x): x is TradeRow => x !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  return parsed;
}

export function dailyNetWithBoundary(
  trades: ReadonlyArray<TradeRow>,
  opts: {
    startDay: string;      // 'YYYY-MM-DD'
    endDay: string;        // 'YYYY-MM-DD'
    dayStartHour?: number; // default 8
  },
): DailyRow[] {
  const { startDay, endDay, dayStartHour = 8 } = opts;

  const fullCalendar = eachDayInclusive(startDay, endDay);
  if (trades.length === 0) {
    return fullCalendar.map((day) => ({ day, net_pnl: 0 }));
  }

  const bucket = new Map<string, number>();
  for (const t of trades) {
    const shifted = new Date(t.time.getTime() - dayStartHour * 60 * 60 * 1000);
    const key = ymd(shifted);
    bucket.set(key, (bucket.get(key) ?? 0) + t.realizedPnl);
  }

  return fullCalendar.map((day) => ({
    day,
    net_pnl: Number(bucket.get(day) ?? 0),
  }));
}

export function maxConsecutiveLosses(
  daily: ReadonlyArray<DailyRow>,
  opts: { includeZero?: boolean } = {},
): LossStreak {
  const includeZero = opts.includeZero ?? false;
  let max = 0;
  let current = 0;
  for (const { net_pnl } of daily) {
    const isLoss = includeZero ? net_pnl <= 0 : net_pnl < 0;
    if (isLoss) {
      current += 1;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  console.log({current, max});
  return { current, max };
}

export async function getStreak(
  account: string,
  startISO: string,
  endISO: string,
): Promise<LossStreak> {
  const startDt = `${startISO} 00:00:00`;
  const endDt = `${endISO} 23:59:59`;

  const pool = await makePool();
  try {
    const trades = await readAccountTrades(pool, account, startDt, endDt);
    const daily = dailyNetWithBoundary(trades, {
      startDay: startISO,
      endDay: endISO,
      dayStartHour: 8,
    });
    return maxConsecutiveLosses(daily, { includeZero: false });
  } finally {
    await pool.end();
  }
}