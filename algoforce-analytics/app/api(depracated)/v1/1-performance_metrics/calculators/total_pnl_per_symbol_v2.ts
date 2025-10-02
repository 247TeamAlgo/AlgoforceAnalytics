/* eslint-disable no-console */
import 'dotenv/config';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { createClient, RedisClientType } from 'redis';

// ---------- Static inputs ----------
const initialBalance: Record<string, number> = {
  mirrorx1: 78171.45,
  mirrorx2: 78879.04,
  mirrorx3: 94077.01,
  mirrorx4: 93032.39,
  team: 94856.10,
  office: 66293.43,
  algoforce1: 96663.75,
  algoforce5: 66464.70,
  fund2: 46544.94,
  fund3: 47669.61,
};

const withdrawal: Record<string, number> = {
  mirrorx1: 3500.0,
  mirrorx2: 3500.0,
  mirrorx3: 3500.0,
  mirrorx4: 3500.0,
  team: 3500.0,
  office: 1500.0,
  algoforce1: 3500.0,
  algoforce5: 1500.0,
  fund2: 0.0,
  fund3: 0.0,
};

const previousPnl: Record<string, number> = {
  mirrorx1: 0.0,
  mirrorx2: 0.0,
  mirrorx3: 0.0,
  mirrorx4: 0.0,
  team: 0.0,
  office: 0.0,
  algoforce1: 0.0,
  algoforce5: 0.0,
  fund2: 0.0,
  fund3: 0.0,
};

// ---------- Env / config ----------
const MYSQL_DSN: string = process.env.TRADES_DSN ?? 'REDACTED';
const REDIS_URL: string | undefined = process.env.REDIS_URL;
const REDIS_HOST: string = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT: number = Number(process.env.REDIS_PORT ?? '6379');

// ---------- Types ----------
type Side = 'BUY' | 'SELL';
type PositionSide = 'LONG' | 'SHORT' | 'BOTH';

interface TradeRowRaw extends RowDataPacket {
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

interface NetTrade {
  symbol: string;
  account: string;
  time: Date;
  realizedPnl: number; // net of commission
}

interface LiveItem {
  unrealizedProfit: number | string | null | undefined;
}
type LivePayload = LiveItem[] | { list: LiveItem[] };

interface PivotRow {
  symbol: string;
  values: Record<string, number>; // dynamic account columns
  TOTAL: number;
}

// ---------- Utilities ----------
function toNumberSafe(val: number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : 0;
}

function isValidDate(d: Date): boolean {
  return Number.isFinite(d.getTime());
}

function validateIdentifier(identifier: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return identifier;
}

function startEndToSqlBounds(startISO: string, endISO: string): { startDt: string; endDt: string } {
  return { startDt: `${startISO} 00:00:00`, endDt: `${endISO} 23:59:59` };
}

// ---------- MySQL ----------
async function makePool(dsn: string = MYSQL_DSN): Promise<Pool> {
  return createPool({
    uri: dsn,
    connectionLimit: 4,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
}

async function loadAccountNetTrades(
  pool: Pool,
  account: string,
  startISO: string,
  endISO: string,
): Promise<NetTrade[]> {
  const safeTable = validateIdentifier(account);
  const { startDt, endDt } = startEndToSqlBounds(startISO, endISO);

  const sql =
    `SELECT symbol, id, orderId, side, price, qty, realizedPnl, commission, time, positionSide ` +
    `FROM \`${safeTable}\` WHERE time >= ? AND time <= ?`;

  const [rows] = await pool.execute<TradeRowRaw[]>(sql, [startDt, endDt]);
  if (!rows || rows.length === 0) return [];

  const out: NetTrade[] = [];
  for (const r of rows) {
    const time =
      typeof r.time === 'string'
        ? new Date(r.time.replace(' ', 'T'))
        : r.time instanceof Date
          ? r.time
          : new Date(NaN);
    if (!isValidDate(time)) continue;

    const realized = toNumberSafe(r.realizedPnl);
    const fees = toNumberSafe(r.commission);

    out.push({
      symbol: String(r.symbol),
      account: safeTable,
      time,
      realizedPnl: realized - fees,
    });
  }
  out.sort((a, b) => a.time.getTime() - b.time.getTime());
  return out;
}

// ---------- Redis ----------
function makeRedisClient(): RedisClientType {
  if (REDIS_URL && REDIS_URL.length > 0) return createClient({ url: REDIS_URL });
  return createClient({ socket: { host: REDIS_HOST, port: REDIS_PORT } });
}

async function getRedisJSON<T>(client: RedisClientType, key: string): Promise<T | null> {
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Failed to parse Redis JSON for key "${key}": ${(err as Error).message}`);
  }
}

async function walletBalanceUPnL(client: RedisClientType, account: string): Promise<number> {
  const key = `${account}_live`;
  const payload = await getRedisJSON<LivePayload>(client, key);
  if (!payload) return 0;

  const list: LiveItem[] = Array.isArray(payload) ? payload : payload.list;
  if (!Array.isArray(list)) return 0;

  let sum = 0;
  for (const item of list) {
    sum += toNumberSafe(item.unrealizedProfit);
  }
  return sum;
}

// ---------- Per-symbol pivot ----------
function pivotPerSymbol(rows: ReadonlyArray<NetTrade>): { pivot: PivotRow[]; accounts: string[] } {
  const bySymAcc = new Map<string, number>(); // key: `${symbol}||${account}`
  const accountsSet = new Set<string>();
  const symbolsSet = new Set<string>();

  for (const r of rows) {
    const key = `${r.symbol}||${r.account}`;
    bySymAcc.set(key, (bySymAcc.get(key) ?? 0) + r.realizedPnl);
    accountsSet.add(r.account);
    symbolsSet.add(r.symbol);
  }

  const accounts = Array.from(accountsSet).sort();
  const symbols = Array.from(symbolsSet).sort();

  const pivot: PivotRow[] = [];
  for (const symbol of symbols) {
    const values: Record<string, number> = {};
    let total = 0;
    for (const acc of accounts) {
      const v = bySymAcc.get(`${symbol}||${acc}`) ?? 0;
      values[acc] = v;
      total += v;
    }
    pivot.push({ symbol, values, TOTAL: total });
  }
  return { pivot, accounts };
}

// ---------- Pretty print ----------
function printPivot(title: string, pivot: PivotRow[], accounts: string[]): void {
  if (pivot.length === 0) {
    console.log(`${title}: <empty>`);
    return;
  }

  // column widths
  let symbolWidth = 'symbol'.length;
  let totalWidth = 'TOTAL'.length;
  const accWidth: Record<string, number> = {};
  for (const acc of accounts) accWidth[acc] = accWidth[acc] ?? acc.length;

  for (const row of pivot) {
    symbolWidth = Math.max(symbolWidth, row.symbol.length);
    for (const acc of accounts) {
      const w = row.values[acc]?.toFixed(2).length ?? 1;
      accWidth[acc] = Math.max(accWidth[acc], w);
    }
    totalWidth = Math.max(totalWidth, row.TOTAL.toFixed(2).length);
  }

  const pad = (v: string, w: number) => v + ' '.repeat(Math.max(0, w - v.length));

  console.log(title);
  console.log(
    [pad('symbol', symbolWidth), ...accounts.map((a) => pad(a, accWidth[a])), pad('TOTAL', totalWidth)].join(' | ')
  );
  console.log(
    [
      '-'.repeat(symbolWidth),
      ...accounts.map((a) => '-'.repeat(accWidth[a])),
      '-'.repeat(totalWidth),
    ].join('-+-')
  );
  for (const row of pivot) {
    const cells = [
      pad(row.symbol, symbolWidth),
      ...accounts.map((a) => pad((row.values[a] ?? 0).toFixed(2), accWidth[a])),
      pad(row.TOTAL.toFixed(2), totalWidth),
    ];
    console.log(cells.join(' | '));
  }
}

// ---------- Example main ----------
async function main(): Promise<void> {
  const account = 'fund2';
  const startIso = '2025-09-01';
  const endIso = '2025-09-30';

  const pool = await makePool();
  const redis = makeRedisClient();

  try {
    await redis.connect();

    const initBal =
      (initialBalance[account] ?? 0) -
      (withdrawal[account] ?? 0) +
      (previousPnl[account] ?? 0);
    console.log(`Initial equity (${account}) = ${initBal.toFixed(2)}`);

    const upnl = await walletBalanceUPnL(redis, account);
    console.log(`Current UPnL (${account}) from Redis = ${upnl.toFixed(2)}`);

    const trades = await loadAccountNetTrades(pool, account, startIso, endIso);

    const { pivot, accounts } = pivotPerSymbol(trades);
    printPivot('Per Symbol PnL', pivot, accounts);
  } finally {
    await pool.end().catch(() => {});
    await redis.quit().catch(() => {});
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
