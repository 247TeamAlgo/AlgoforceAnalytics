// app/api/v1/1-performance_metrics/calculators/account_returns.ts
import type { Pool } from "mysql2/promise";
import type { Redis } from "ioredis";

import { getSQLTradesPool } from "@/lib/db/sql";
import { redis as getRedis } from "@/lib/db/redis";
import { readBaselineUsd } from "@/lib/baseline";

import type { ISODate, Bucket, MetricsSlim } from "../performance_metric_types";
import {
  ACCOUNTS_INFO,
  getAccountInfo,
  tableCandidatesFor,
  type AccountInfo,
} from "./accounts_json";
import {
  selectFromFirstExistingTable,
  findEarliestDateForTable,
  type TradeRow,
} from "./sql_fetch";
import {
  loadTradesheetPairMap,
  loadUpnlSum,
  type PairMap,
} from "./redis_parsers";
import {
  buildDailySeries,
  drawdownMagnitude,
  equityFromDaily,
  losingStreaksFromDaily,
} from "./series_builders";
import { totalPnlPerPair } from "./total_pnl_per_pair";
import { totalPnlPerSymbol } from "./total_pnl_per_symbol";

/* ---------------------------- numeric helper --------------------------- */
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/* -------------------------- baselines policy --------------------------- */
export class BaselineMissingError extends Error {
  public readonly accounts: string[];
  constructor(accounts: string[]) {
    super(`Missing baseline for: ${accounts.join(", ")}`);
    this.accounts = accounts;
    this.name = "BaselineMissingError";
  }
}

/* ------------------------- window helpers ------------------------------ */
export async function computeEarliestWindowStartUTC(
  pool: Pool,
  accounts: AccountInfo[],
  endIso: ISODate
): Promise<ISODate | null> {
  let minD: string | null = null;
  for (const a of accounts) {
    for (const t of tableCandidatesFor(a)) {
      try {
        const d = await findEarliestDateForTable(pool, t, endIso);
        if (d && (!minD || d < minD)) minD = d;
        break; // found an existing table
      } catch (err: unknown) {
        const msg = String((err as Error)?.message || "");
        if (msg.includes("ER_NO_SUCH_TABLE") || msg.includes("doesn't exist")) {
          continue;
        }
        throw err;
      }
    }
  }
  return (minD as ISODate | null) ?? null;
}

/* ---------------------------- groupers -------------------------------- */
function groupDailyAndBuckets(
  trades: TradeRow[],
  pairMap: PairMap
): {
  byDay: Map<string, { gross: number; fees: number; net: number }>;
  perSymbolItems: Array<{ symbol: string; net: number }>;
  perPairItems: Array<{ pair: string; net: number }>;
} {
  const byDay = new Map<string, { gross: number; fees: number; net: number }>();
  const perSymbolItems: Array<{ symbol: string; net: number }> = [];
  const perPairItems: Array<{ pair: string; net: number }> = [];

  for (const t of trades) {
    const realized = num(t.realizedPnl);
    const fees = num(t.commission);
    const net = realized - fees;

    // UTC date YYYY-MM-DD (time is UTC in DB)
    const day = (t.time ?? "").slice(0, 10);
    const sym = (t.symbol ?? "").toString().toUpperCase();
    const oid = (t.orderId ?? "").toString();

    // daily
    const cur = byDay.get(day) ?? { gross: 0, fees: 0, net: 0 };
    cur.gross += realized;
    cur.fees += fees;
    cur.net += net;
    byDay.set(day, cur);

    // symbol buckets
    if (sym) perSymbolItems.push({ symbol: sym, net });

    // pair buckets (map via tradesheet; fallback to symbol)
    const pair = pairMap.get(oid) || sym || "UNMAPPED";
    perPairItems.push({ pair, net });
  }

  return { byDay, perSymbolItems, perPairItems };
}

/* ----------------------- per-account calculator ------------------------ */
export async function buildAccountMetricsSlim(opts: {
  redisName: string;
  startIso: ISODate; // inclusive UTC date
  endIso: ISODate; // inclusive UTC date
}): Promise<{
  metrics: MetricsSlim;
  perSymbol: Bucket[];
  perPair: Bucket[];
}> {
  const pool: Pool = getSQLTradesPool();
  const r: Redis = getRedis();

  const info = getAccountInfo(opts.redisName);
  if (!info) throw new Error(`Unknown account: ${opts.redisName}`);

  // enforce baseline existence (fail fast)
  let initial_balance: number;
  try {
    initial_balance = readBaselineUsd(opts.redisName);
  } catch {
    throw new BaselineMissingError([opts.redisName]);
  }

  // fetch trades table (try redisName then binanceName)
  const tableCandidates = tableCandidatesFor(info);
  const trades = await selectFromFirstExistingTable(
    pool,
    tableCandidates,
    `${opts.startIso} 00:00:00`,
    `${opts.endIso} 23:59:59`
  );

  // redis: orderId->pair, and UPNL to tack onto end date
  const pairMap = await loadTradesheetPairMap(r, info.redisName);
  const upnl = await loadUpnlSum(r, info.redisName);

  // aggregates
  const { byDay, perSymbolItems, perPairItems } = groupDailyAndBuckets(
    trades,
    pairMap
  );
  const daily = buildDailySeries(opts.startIso, opts.endIso, byDay, upnl);
  const equity = equityFromDaily(initial_balance, daily);

  // KPIs
  const drawdown_mag = drawdownMagnitude(equity);
  const streaks = losingStreaksFromDaily(daily);

  const per_symbol = totalPnlPerSymbol(perSymbolItems);
  const per_pair = totalPnlPerPair(perPairItems);

  const endEquity = equity.length
    ? equity[equity.length - 1]!
    : initial_balance;
  const total_return_pct_over_window =
    initial_balance > 0
      ? Number(
          (((endEquity - initial_balance) / initial_balance) * 100).toFixed(2)
        )
      : null;

  const metrics: MetricsSlim = {
    initial_balance,
    window_start: opts.startIso,
    window_end: opts.endIso,
    total_return_pct_over_window,
    drawdown_mag,
    streaks,
    daily,
    pnl_per_symbol: per_symbol,
    pnl_per_pair: per_pair,
  };

  return { metrics, perSymbol: per_symbol, perPair: per_pair };
}

/* --------------------------- merged calculator ------------------------- */
export function mergeMetricsSlim(
  perAccount: Record<string, MetricsSlim>
): MetricsSlim {
  const keys = Object.keys(perAccount);
  if (!keys.length) {
    return {
      initial_balance: 0,
      window_start: "1970-01-01",
      window_end: "1970-01-01",
      total_return_pct_over_window: null,
      drawdown_mag: 0,
      streaks: { current: 0, max: 0 },
      daily: [],
      pnl_per_symbol: [],
      pnl_per_pair: [],
    };
  }

  const first = perAccount[keys[0] as string]!;
  const start = first.window_start;
  const end = first.window_end;

  const byDay = new Map<string, { gross: number; fees: number; net: number }>();
  let initial = 0;

  for (const k of keys) {
    const m = perAccount[k]!;
    initial += m.initial_balance;
    for (const r of m.daily) {
      const agg = byDay.get(r.day) ?? { gross: 0, fees: 0, net: 0 };
      agg.gross += r.gross_pnl;
      agg.fees += r.fees;
      agg.net += r.net_pnl;
      byDay.set(r.day, agg);
    }
  }

  // calendarize via first.daily (already full range)
  const daily = first.daily.map((r) => {
    const a = byDay.get(r.day) ?? { gross: 0, fees: 0, net: 0 };
    return {
      day: r.day,
      gross_pnl: Number(a.gross.toFixed(2)),
      fees: Number(a.fees.toFixed(2)),
      net_pnl: Number(a.net.toFixed(2)),
    };
  });

  const eq = equityFromDaily(initial, daily);
  const drawdown_mag = drawdownMagnitude(eq);
  const streaks = losingStreaksFromDaily(daily);

  // buckets: sum by label
  const mergeBuckets = (
    items: Array<{ label: string; total: number }>
  ): Array<{ label: string; total: number }> => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.label, (m.get(it.label) ?? 0) + it.total);
    return Array.from(m.entries()).map(([label, total]) => ({
      label,
      total: Number(total.toFixed(2)),
    }));
  };

  const allSym: Array<{ label: string; total: number }> = [];
  const allPair: Array<{ label: string; total: number }> = [];
  for (const k of keys) {
    allSym.push(...perAccount[k]!.pnl_per_symbol);
    allPair.push(...perAccount[k]!.pnl_per_pair);
  }

  const merged: MetricsSlim = {
    initial_balance: initial,
    window_start: start,
    window_end: end,
    total_return_pct_over_window:
      initial > 0
        ? Number(
            ((((eq.at(-1) ?? initial) - initial) / initial) * 100).toFixed(2)
          )
        : null,
    drawdown_mag,
    streaks,
    daily,
    pnl_per_symbol: mergeBuckets(allSym),
    pnl_per_pair: mergeBuckets(allPair),
  };

  return merged;
}

/* --------------------- utility for earliest window --------------------- */
export async function earliestStartForAccounts(
  endIso: ISODate,
  redisNames: string[]
): Promise<ISODate | null> {
  const pool: Pool = getSQLTradesPool();
  const infos = redisNames
    .map((k) => ACCOUNTS_INFO.find((a) => a.redisName === k))
    .filter((a): a is AccountInfo => Boolean(a));

  return computeEarliestWindowStartUTC(pool, infos, endIso);
}
