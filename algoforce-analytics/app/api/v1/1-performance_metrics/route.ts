// app/api/v1/1-performance_metrics/route.ts
import { NextRequest, NextResponse } from "next/server";

import { redis as getRedis } from "@/lib/db/redis";
import { getSQLTradesPool } from "@/lib/db/sql";
import { readBaselineUsd } from "@/lib/baseline";

import {
  ACCOUNTS_INFO,
  getAccountInfo,
  type AccountInfo,
} from "./calculators/accounts_json";

import {
  selectFromFirstExistingTable,
  findEarliestDateForTable,
  type TradeRow,
} from "./calculators/sql_fetch";

import {
  loadTradesheetPairMap,
  loadTradesheetIndex, // ← NEW
  loadUpnlSum,
  loadUpnlPerSymbolMap,
  type PairMap,
} from "./calculators/redis_parsers";

import {
  buildDailySeries,
  // drawdownMagnitude,
  equityFromDaily,
} from "./calculators/series_builders";

import {
  ISODate,
  MetricsSlim,
  Bucket,
  MultiMetricsResponseSlim,
} from "./performance_metric_types";

import { getStreak, LossStreak } from "./calculators/consecutive_losing_days_v2"

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* -------------------------- helpers (dates/nums) ------------------------ */

function todayUTCISO(): ISODate {
  return new Date().toISOString().slice(0, 10) as ISODate;
}
function asISODateOrThrow(s: string | null): ISODate {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error("Invalid date format; expected YYYY-MM-DD");
  }
  return s as ISODate;
}

/** Safe numeric parse; returns 0 if NaN. */
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function hashETag(input: string): string {
  // FNV-1a
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return `"W/${h.toString(16)}"`; // weak ETag
}

type Hour0to23 =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23;

/** Parse ?dayStartHour=H (0..23); default 0. */
function parseDayStartHour(raw: string | null): Hour0to23 {
  const n = raw == null ? NaN : Number(raw);
  if (Number.isFinite(n)) {
    const h = Math.trunc(n);
    if (h >= 0 && h <= 23) return h as Hour0to23;
  }
  return 0;
}

/**
 * Local naive DATETIME "YYYY-MM-DD HH:MM:SS" → ISO day string,
 * after shifting back by `dayStartHour` to define calendar boundary.
 */
function isoDayFromLocalDatetime(
  ts: string,
  dayStartHour: Hour0to23 = 0
): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(ts)) {
    return ts.slice(0, 10) as ISODate;
  }
  const y = Number(ts.slice(0, 4));
  const m = Number(ts.slice(5, 7));
  const d = Number(ts.slice(8, 10));
  const hh = Number(ts.slice(11, 13));
  const mm = Number(ts.slice(14, 16));
  const ss = Number(ts.slice(17, 19));

  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  dt.setUTCHours(dt.getUTCHours() - dayStartHour);

  const yy = dt.getUTCFullYear();
  const mo = dt.getUTCMonth() + 1;
  const da = dt.getUTCDate();
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${yy}-${pad(mo)}-${pad(da)}` as ISODate;
}

/** Losing streaks where only strictly negative days count. */
function streaksFromDailyStrictNegative(daily: MetricsSlim["daily"]): {
  current: number;
  max: number;
} {
  let cur = 0;
  let max = 0;
  for (const r of daily) {
    const v = Number(r?.net_pnl ?? 0);
    if (v < 0) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return { current: cur, max };
}

function bucketsFrom<K extends string>(
  items: Array<{ label: K; total: number }>
): Bucket[] {
  const out = items.map((x) => ({
    label: x.label,
    total: Number(x.total.toFixed(2)),
  }));
  out.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return out;
}

function bucketsFromPairs(items: PairBucket[]): Bucket[] {
  type Agg = {
    total: number;
    reasons: Set<string>;
    unmapped: boolean;
    orderIds: Set<string>;
  };
  const m = new Map<string, Agg>();

  for (const it of items) {
    const key = it.label; // either PAIR or "[UNMAPPED] SYM"
    const agg = m.get(key) ?? {
      total: 0,
      reasons: new Set<string>(),
      unmapped: false,
      orderIds: new Set<string>(),
    };

    agg.total += it.total;

    if (it.source === "unmapped") {
      agg.unmapped = true;
      if (it.reason) agg.reasons.add(it.reason);
      if (it.orderId) agg.orderIds.add(it.orderId);
    }

    m.set(key, agg);
  }

  const out: Bucket[] = [];
  for (const [label, agg] of m.entries()) {
    let finalLabel = label;

    if (agg.unmapped) {
      const reasons = Array.from(agg.reasons);
      const reasonStr = reasons.length ? reasons.join(" | ") : "unknown";

      // include up to 5 orderIds, then ellipsis if more
      const ids = Array.from(agg.orderIds).slice(0, 5);
      const more = agg.orderIds.size > 5 ? "…" : "";
      const idsStr = ids.length ? `; orderIds: ${ids.join(",")}${more}` : "";

      finalLabel = `${label} — reason: ${reasonStr}${idsStr}`;
    }

    out.push({ label: finalLabel, total: Number(agg.total.toFixed(2)) });
  }

  out.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return out;
}


type PairBucket = {
  label: string;
  total: number;
  mapped: boolean;
  source: "direct" | "fuzzy" | "unmapped";
  reason?: string;   // for unmapped
  orderId?: string;  // ← NEW: keep per-fill orderId so we can summarize later
};


type TSIndex = Awaited<ReturnType<typeof loadTradesheetIndex>>["index"];

/** Pick closest tradesheet row by symbol + side sign + time proximity. */
function matchPairByTimeAndSide(
  sym: string,
  sideRaw: string | undefined,
  tsMs: number,
  idx: TSIndex,
  toleranceMs = 60_000
): string | null {
  if (!sym) return null;

  // BUY -> +1, SELL -> -1 (fallback 0)
  const sNorm = (sideRaw || "").toUpperCase();
  const sideSign = sNorm === "BUY" ? 1 : sNorm === "SELL" ? -1 : 0;

  let best: { pair: string; dt: number } | null = null;

  for (const row of idx) {
    let legSign = 0;
    if (sym === row.sym0) legSign = row.sign0;
    else if (sym === row.sym1) legSign = row.sign1;
    else continue;

    if (sideSign !== 0 && legSign !== 0 && sideSign !== legSign) {
      // side doesn't match leg direction (optional; remove if too strict)
      continue;
    }

    // distance to entry or exit (whichever closer, if present)
    const candidates: number[] = [];
    if (row.entryMs != null) candidates.push(Math.abs(tsMs - row.entryMs));
    if (row.exitMs != null) candidates.push(Math.abs(tsMs - row.exitMs));
    if (!candidates.length) continue;

    const dist = Math.min(...candidates);
    if (dist <= toleranceMs && (!best || dist < best.dt)) {
      best = { pair: row.pair, dt: dist };
    }
  }

  return best ? best.pair : null;
}

/**
 * Per-day sums and bucket items.
 */
function groupDailyAndBuckets(
  trades: TradeRow[],
  orderToPair: PairMap,
  tsIndex: TSIndex,
  dayStartHour: Hour0to23
): {
  byDay: Map<string, { gross: number; fees: number; net: number }>;
  perSymbolItems: Array<{ label: string; total: number }>;
  perPairItems: PairBucket[]; // rich items; we'll aggregate later
} {
  const byDay = new Map<string, { gross: number; fees: number; net: number }>();
  const perSymbolItems: Array<{ label: string; total: number }> = [];
  const perPairItems: PairBucket[] = [];

  // quick set of symbols present in tradesheet index
  const tsSymbols = new Set<string>();
  for (const row of tsIndex) {
    if (row.sym0) tsSymbols.add(row.sym0);
    if (row.sym1) tsSymbols.add(row.sym1);
  }

  for (const t of trades) {
    const realized = num((t as { realizedPnl?: unknown }).realizedPnl);
    const fees = num((t as { commission?: unknown }).commission);
    const net = realized - fees;

    const ts = String((t as { time?: unknown }).time ?? "");
    if (!ts) continue;
    const day = isoDayFromLocalDatetime(ts, dayStartHour);

    const sym = ((t as { symbol?: unknown }).symbol ?? "").toString().toUpperCase();
    const oid = ((t as { orderId?: unknown }).orderId ?? "").toString();
    const side = ((t as { side?: unknown }).side ?? "").toString();
    const ms = new Date(ts.replace(" ", "T") + "Z").getTime();

    const cur = byDay.get(day) ?? { gross: 0, fees: 0, net: 0 };
    cur.gross += realized;
    cur.fees += fees;
    cur.net += net;
    byDay.set(day, cur);

    if (sym) perSymbolItems.push({ label: sym, total: net });

    // 1) primary mapping via orderId
    let pair = (oid && orderToPair.get(oid)) || "";

    // 2) fallback fuzzy match
    let source: "direct" | "fuzzy" | "unmapped" = "unmapped";
    let reason: string | undefined;

    if (pair) {
      source = "direct";
    } else {
      const fuzzy = matchPairByTimeAndSide(sym, side, Number.isFinite(ms) ? ms : 0, tsIndex, 60_000);
      if (fuzzy) {
        pair = fuzzy;
        source = "fuzzy";
      } else {
        source = "unmapped";
        const reasons: string[] = [];
        if (!oid || !orderToPair.has(oid)) reasons.push("orderId not in tradesheet");
        if (!Number.isFinite(ms)) reasons.push("invalid timestamp");
        if (!side) reasons.push("missing side");
        if (!sym) reasons.push("missing symbol");
        else if (!tsSymbols.has(sym)) reasons.push("symbol not in tradesheet window");
        if (reasons.length === 0) reasons.push("no entry/exit within ±60s");
        reason = reasons.join("; ");
      }
    }

    perPairItems.push({
      label: pair ? pair : `[UNMAPPED] ${sym || "UNKNOWN"}`,
      total: net,
      mapped: !!pair,
      source,
      reason,
      orderId: oid || undefined,   // ← keep the orderId so we can show it later
    });
  }

  return { byDay, perSymbolItems, perPairItems };
}


async function earliestStartAcrossAccounts(
  endIso: ISODate,
  accounts: AccountInfo[]
): Promise<ISODate | null> {
  const pool = getSQLTradesPool();
  let minD: string | null = null;
  for (const a of accounts) {
    const candidates = [a.redisName, a.binanceName, a.dbName].filter(
      Boolean
    ) as string[];
    for (const t of candidates) {
      try {
        const d = await findEarliestDateForTable(pool, t, endIso);
        if (d && (!minD || d < minD)) minD = d;
        break;
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

// "YYYY-MM"
function monthKeyISOfromISODate(isoDay: ISODate): string {
  return isoDay.slice(0, 7);
}

/** Monthly max-drawdown *magnitude* (>= 0) with peak reset at each month. */
function drawdownMagnitudeByMonth(
  daily: ReadonlyArray<{ day: ISODate }>,
  equity: readonly number[]
): Readonly<Record<string, number>> {
  if (daily.length !== equity.length) {
    throw new Error(`length mismatch: daily=${daily.length} equity=${equity.length}`);
  }

  const out: Record<string, number> = {};
  if (daily.length === 0) return out;

  let curMonth = monthKeyISOfromISODate(daily[0]!.day);
  let peak = Number.NEGATIVE_INFINITY;
  let minDD = 0; // most negative within the month (<= 0)

  const commit = (mon: string): void => {
    out[mon] = peak > 0 && Number.isFinite(peak) ? Math.abs(minDD) : 0;
  };

  for (let i = 0; i < daily.length; i++) {
    const mon = monthKeyISOfromISODate(daily[i]!.day);
    const v = equity[i]!;

    if (mon !== curMonth) {
      commit(curMonth);                 // finalize previous month
      curMonth = mon;                   // reset state for new month
      peak = Number.NEGATIVE_INFINITY;
      minDD = 0;
    }

    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;         // signed (<= 0)
      if (dd < minDD) minDD = dd;
    }
  }

  commit(curMonth); // last month
  return out;
}

/** Convenience: current month’s drawdown magnitude (>= 0). */
function currentMonthDrawdownMagnitude(
  daily: ReadonlyArray<{ day: ISODate }>,
  equity: readonly number[]
): number {
  if (daily.length === 0) return 0;
  const byMonth = drawdownMagnitudeByMonth(daily, equity);
  const lastMonth = monthKeyISOfromISODate(daily[daily.length - 1]!.day);
  return byMonth[lastMonth] ?? 0;
}

/** Current month key "YYYY-MM". */
function lastMonthKeyFromDaily(daily: ReadonlyArray<{ day: ISODate }>): string | null {
  if (!daily.length) return null;
  return daily[daily.length - 1]!.day.slice(0, 7);
}

/** Current-month return in percent from an equity level series.
 * Uses the first equity value in the current month as baseline,
 * i.e. (lastEq - firstEq) / firstEq * 100.
 */
function currentMonthReturnPct(
  daily: ReadonlyArray<{ day: ISODate }>,
  equity: readonly number[]
): number | null {
  if (daily.length === 0 || daily.length !== equity.length) return null;
  const lastMonth = lastMonthKeyFromDaily(daily);
  if (!lastMonth) return null;

  // find first index in current month
  let firstIdx = -1;
  for (let i = 0; i < daily.length; i++) {
    if (daily[i]!.day.slice(0, 7) === lastMonth) {
      firstIdx = i;
      break;
    }
  }
  if (firstIdx < 0) return null;

  const firstEq = equity[firstIdx]!;
  const lastEq = equity[equity.length - 1]!;
  if (!(firstEq > 0)) return null;

  const pct = ((lastEq - firstEq) / firstEq) * 100;
  return Number(pct.toFixed(2));
}

function recomputeFromDaily(
  initial: number,
  dailyIn: MetricsSlim["daily"]
): Pick<
  MetricsSlim,
  "drawdown_mag" | "streaks" | "total_return_pct_over_window"
> {
  const daily = [...dailyIn].sort((a, b) => a.day.localeCompare(b.day));

  // Equity level across the window (do NOT reset across months here).
  const eq = equityFromDaily(initial, daily);

  // MTD drawdown magnitude (peak resets each month).
  const drawdown_mag = currentMonthDrawdownMagnitude(daily, eq);

  const streaks = streaksFromDailyStrictNegative(daily);

  // MTD return (first vs last equity within the current month).
  const total_return_pct_over_window = currentMonthReturnPct(daily, eq);

  return { drawdown_mag, streaks, total_return_pct_over_window };
}


/* ───────────────────── pair resolver: SQL fills ⇄ tradesheet rows ───────────────────── */

type TSRow = {
  pair: string;
  entry_dt?: string | null;
  exit_dt?: string | null; // ← NEW
  qty_0?: number | string | null;
  qty_1?: number | string | null;
  entry_order_0?: string | number | null;
  entry_order_1?: string | number | null;
  exit_order_0?: string | number | null; // ← NEW
  exit_order_1?: string | number | null; // ← NEW
};

function splitPairSymbols(pair: string): [string, string] {
  const [a, b] = (pair || "").split("_");
  return [(a || "").toUpperCase(), (b || "").toUpperCase()];
}
function sideForQty(q: number): "BUY" | "SELL" {
  return q >= 0 ? "BUY" : "SELL";
}
function parseISOorLike(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
function toNumStrict(x: unknown): number {
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  if (typeof x === "string") {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
/** Safe read of trade side; tolerates different casing/keys. Defaults to BUY. */
function readSideFromTrade(tr: TradeRow): "BUY" | "SELL" {
  const raw =
    (tr as unknown as Record<string, unknown>)?.side ??
    (tr as unknown as Record<string, unknown>)?.Side ??
    (tr as unknown as Record<string, unknown>)?.orderSide ??
    (tr as unknown as Record<string, unknown>)?.SIDE ??
    "";
  const s = String(raw || "").toUpperCase();
  return s === "SELL" ? "SELL" : "BUY";
}

/** Safe read of trade quantity; tolerates different column names. */
function readQtyFromTrade(tr: TradeRow): number {
  const k = tr as unknown as Record<string, unknown>;
  return toNumStrict(
    k.qty ??
      k.executedQty ??
      k.execQty ??
      k.quantity ??
      k.Qty ??
      k.baseQty ??
      k.baseQuantity
  );
}

/** Load tradesheet rows from `${redisName}_tradesheet` supporting multiple shapes. */
async function loadTradesheetRows(
  r: ReturnType<typeof getRedis>,
  redisName: string
): Promise<TSRow[]> {
  const raw = await r.get(`${redisName}_tradesheet`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw as string);
    if (Array.isArray(parsed?.tradeslist)) return parsed.tradeslist as TSRow[];
    if (Array.isArray(parsed)) return parsed as TSRow[];
    if (parsed && typeof parsed === "object") {
      return Object.values(parsed) as TSRow[];
    }
  } catch {
    /* ignore parse errors -> empty */
  }
  return [];
}

/**
 * Start from tradesheet’s direct orderId->pair (entry_order_*)
 * and AUGMENT with a fuzzy matcher so chunked fills (different orderIds)
 * near entry_dt are also mapped to the same pair.
 */
function buildAugmentedOrderIdToPair(
  sqlTrades: TradeRow[],
  tsRows: TSRow[],
  opts?: {
    windowSec?: number; // +/- time window around entry_dt (default 10s)
    gapSec?: number; // max gap between chained fills when walking back (default 2s)
    qtyTolPct?: number; // tolerance between chained sum(qty) and target abs(qty) (default 5%)
  }
): Map<string, string> {
  const windowMs = Math.max(1, Math.trunc((opts?.windowSec ?? 10) * 1000));
  const gapMs = Math.max(0, Math.trunc((opts?.gapSec ?? 2) * 1000));
  const qtyTol = Math.max(0, Number(opts?.qtyTolPct ?? 0.05));

  const map = new Map<string, string>(); // orderId -> PAIR(UPPER)

  // 1) direct mapping from tradesheet entry order ids
  for (const r of tsRows) {
    const pairU = (r.pair || "").toUpperCase();
    if (!pairU) continue;
    for (const key of [
      "entry_order_0",
      "entry_order_1",
      "exit_order_0",
      "exit_order_1",
    ] as const) {
      const v = r[key];
      if (v !== null && v !== undefined && String(v).length) {
        map.set(String(v), pairU);
      }
    }
  }

  // 2) index SQL fills by symbol+side, sorted by time
  type Fill = {
    idx: number;
    timeMs: number;
    side: "BUY" | "SELL";
    symbol: string;
    orderId: string;
    qty: number;
  };
  const bySymSide = new Map<string, Fill[]>();
  for (let i = 0; i < sqlTrades.length; i += 1) {
    const t = sqlTrades[i]!;
    const symbol = String(
      (t as unknown as Record<string, unknown>)?.symbol || ""
    ).toUpperCase();
    const side = readSideFromTrade(t);
    const timeMs =
      parseISOorLike(String((t as unknown as Record<string, unknown>)?.time)) ??
      NaN;
    const orderId = String(
      (t as unknown as Record<string, unknown>)?.orderId ?? ""
    );
    const qty = readQtyFromTrade(t);
    if (!symbol || !Number.isFinite(timeMs) || !orderId) continue;
    const key = `${symbol}|${side}`;
    const arr = bySymSide.get(key) ?? [];
    arr.push({ idx: i, timeMs, side, symbol, orderId, qty });
    bySymSide.set(key, arr);
  }

  for (const arr of bySymSide.values()) arr.sort((a, b) => a.timeMs - b.timeMs);

  // helper: chain fills backwards from an anchor until qty target is (roughly) met
  function collectBackwards(
    arr: Fill[],
    startIdx: number,
    targetQtyAbs: number
  ): Fill[] {
    const out: Fill[] = [];
    let acc = 0;
    let lastMs = arr[startIdx]!.timeMs;
    for (let k = startIdx; k >= 0; k -= 1) {
      const f = arr[k]!;
      if (lastMs - f.timeMs > gapMs) break; // too big a gap
      out.push(f);
      acc += Math.abs(f.qty);
      lastMs = f.timeMs;
      if (acc >= targetQtyAbs * (1 - qtyTol)) break; // “good enough”
    }
    return out;
  }

  // 3) augment with fuzzy matches from each tradesheet leg
  for (const ts of tsRows) {
    const pairU = (ts.pair || "").toUpperCase();
    if (!pairU) continue;

    const entryMsNum = parseISOorLike(ts.entry_dt);
    const exitMsNum = parseISOorLike(ts.exit_dt);

    // Use any available anchors (entry and/or exit)
    const anchors = [entryMsNum, exitMsNum].filter(
      (x): x is number => x != null
    );
    if (anchors.length === 0) continue;

    const [s0, s1] = splitPairSymbols(ts.pair || "");
    const q0 = toNumStrict(ts.qty_0);
    const q1 = toNumStrict(ts.qty_1);

    const legs: Array<{ sym: string; side: "BUY" | "SELL"; qtyAbs: number }> =
      [];
    if (s0 && q0)
      legs.push({ sym: s0, side: sideForQty(q0), qtyAbs: Math.abs(q0) });
    if (s1 && q1)
      legs.push({ sym: s1, side: sideForQty(q1), qtyAbs: Math.abs(q1) });

    for (const leg of legs) {
      const key = `${leg.sym}|${leg.side}`;
      const arr = bySymSide.get(key);
      if (!arr || arr.length === 0) continue;

      for (const anchorMs of anchors) {
        // find the latest fill within [anchorMs - windowMs, anchorMs + windowMs]
        let anchorIdx = -1;
        for (let i = arr.length - 1; i >= 0; i -= 1) {
          const dt = arr[i]!.timeMs;
          if (dt >= anchorMs - windowMs && dt <= anchorMs + windowMs) {
            anchorIdx = i;
            break;
          }
          if (dt < anchorMs - windowMs) break;
        }
        if (anchorIdx < 0) continue;

        const chain = collectBackwards(arr, anchorIdx, leg.qtyAbs);
        for (const f of chain) map.set(f.orderId, pairU);
      }
    }
  }

  return map;
}

/* ------------------------ core builder (inline) ------------------------- */
async function buildAccountMetrics(
  info: AccountInfo,
  startIso: ISODate,
  endIso: ISODate,
  includeUpnlOnEnd: boolean,
  dayStartHour: Hour0to23
): Promise<MetricsSlim> {
  const pool = getSQLTradesPool();
  const r = getRedis();

  const initial_balance = readBaselineUsd(info.redisName);
  if (!Number.isFinite(initial_balance)) {
    throw new Error(`Baseline for ${info.redisName} is not numeric`);
  }

  const tableCandidates = [
    info.redisName,
    info.binanceName,
    info.dbName,
  ].filter(Boolean) as string[];

  const startTs = `${startIso} 00:00:00`;
  const endTs = `${endIso} 23:59:59`;

  // 1) SQL trades within date range
  const trades = await selectFromFirstExistingTable(
    pool,
    tableCandidates,
    startTs,
    endTs
  );

  // 2) Load tradesheet rows (for pair, entry_dt, qtys, entry_order_* etc.)
  const tsRows = await loadTradesheetRows(r, info.redisName);

  // 3) Start from direct orderId->pair map (entry_order_*) and augment with fuzzy time/qty matching
  const directMap = await loadTradesheetPairMap(r, info.redisName);
  const augmentedMap = buildAugmentedOrderIdToPair(trades, tsRows, {
    windowSec: 10, // +/- 10 seconds around entry_dt
    gapSec: 2, // chain contiguous fills with gaps <= 2 seconds
    qtyTolPct: 0.05, // accept within 5% of target abs(qty)
  });
  // ensure direct matches stay (or overwrite fuzzy, if present)
  for (const [k, v] of directMap.entries()) augmentedMap.set(k, v);

  // 4) Optional UPNL goes only to last day equity (not into realized buckets)
  const upnl = includeUpnlOnEnd ? await loadUpnlSum(r, info.redisName) : 0;
  const { index: tsIndex, orderToPair } = await loadTradesheetIndex(
    r,
    info.redisName
  );

  const { byDay, perSymbolItems, perPairItems } = groupDailyAndBuckets(
    trades,
    orderToPair,
    tsIndex,
    dayStartHour
  );

  const daily = buildDailySeries(startIso, endIso, byDay, upnl);
  const { drawdown_mag, streaks, total_return_pct_over_window } =
    recomputeFromDaily(initial_balance, daily);

  console.log(`${info.redisName}, ${startTs}, ${endTs}`)
  const streaks_v2: LossStreak = await getStreak(info.redisName, startIso=startIso, endIso=endIso);

  return {
    initial_balance,
    window_start: startIso,
    window_end: endIso,
    total_return_pct_over_window,
    drawdown_mag,
    // streaks,
    streaks: streaks_v2,
    daily,
    pnl_per_symbol: bucketsFrom(perSymbolItems), // REALIZED only
    pnl_per_pair: bucketsFromPairs(perPairItems), // ← includes unmapped reasons in label
  };
}

function mergeMetrics(perAccount: Record<string, MetricsSlim>): MetricsSlim {
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

  const daily = first.daily.map((r) => {
    const a = byDay.get(r.day) ?? { gross: 0, fees: 0, net: 0 };
    return {
      day: r.day,
      gross_pnl: Number(a.gross.toFixed(2)),
      fees: Number(a.fees.toFixed(2)),
      net_pnl: Number(a.net.toFixed(2)),
    };
  });

  daily.sort((a, b) => a.day.localeCompare(b.day));

  const { drawdown_mag, streaks, total_return_pct_over_window } =
    recomputeFromDaily(initial, daily);

  const mergeBucketList = (list: Bucket[]): Bucket[] => {
    const m = new Map<string, number>();
    for (const b of list) m.set(b.label, (m.get(b.label) ?? 0) + b.total);
    const out = Array.from(m.entries()).map(([label, total]) => ({
      label,
      total: Number(total.toFixed(2)),
    }));
    out.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    return out;
  };
  const allSym: Bucket[] = keys.flatMap((k) => perAccount[k]!.pnl_per_symbol);
  const allPair: Bucket[] = keys.flatMap((k) => perAccount[k]!.pnl_per_pair);

  return {
    initial_balance: initial,
    window_start: start,
    window_end: end,
    total_return_pct_over_window,
    drawdown_mag,
    streaks,
    daily,
    pnl_per_symbol: mergeBucketList(allSym), // REALIZED only
    pnl_per_pair: mergeBucketList(allPair), // REALIZED only
  };
}

/* --------------------------------- GET ---------------------------------- */

type DebugTailItem = { day: ISODate; net: number };
type DebugInfo = {
  day_start_hour: number;
  window: { start: ISODate; end: ISODate };
  tails: Record<string, DebugTailItem[]>;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const rqp = req.nextUrl.searchParams;

    const accountsParam = (rqp.get("accounts") || "").trim();
    let accountIds = accountsParam
      ? accountsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (!accountIds.length) {
      if (Array.isArray(ACCOUNTS_INFO)) {
        accountIds = ACCOUNTS_INFO.filter((a) => a?.monitored).map(
          (a) => a.redisName
        );
      } else {
        return NextResponse.json(
          {
            error: "No accounts were provided and ACCOUNTS_INFO is unavailable",
          },
          { status: 400 }
        );
      }
    }

    const includeUpnl =
      rqp.get("includeUpnl") === "1" || rqp.get("includeUpnl") === "true";

    const earliestFlag =
      rqp.get("earliest") === "true" || rqp.get("earliest") === "1";
    const startDateRaw = rqp.get("startDate");
    const endDateRaw = rqp.get("endDate") ?? todayUTCISO();
    const dayStartHour = parseDayStartHour(rqp.get("dayStartHour"));
    const debugFlag = rqp.get("debug") === "1";

    const endIso = asISODateOrThrow(endDateRaw);
    let startIso: ISODate | null = startDateRaw
      ? asISODateOrThrow(startDateRaw)
      : null;

    const validInfos: AccountInfo[] = [];
    const ignored: string[] = [];
    for (const k of accountIds) {
      const info = getAccountInfo(k);
      if (!info) ignored.push(k);
      else validInfos.push(info);
    }
    if (!validInfos.length) {
      return NextResponse.json(
        { error: "No valid accounts in request", ignored },
        { status: 400 }
      );
    }

    for (const info of validInfos) {
      const v = readBaselineUsd(info.redisName);
      if (!Number.isFinite(v)) {
        return NextResponse.json(
          { error: `Baseline for ${info.redisName} is not numeric` },
          { status: 400 }
        );
      }
    }

    if (!startIso && earliestFlag) {
      const earliest = await earliestStartAcrossAccounts(endIso, validInfos);
      startIso = earliest ?? endIso;
    }
    if (!startIso) {
      return NextResponse.json(
        {
          error:
            "Either (startDate & endDate) or (earliest=true & endDate) is required",
        },
        { status: 400 }
      );
    }

    // ETag snapshot
    const etagSeed = JSON.stringify({
      accounts: validInfos.map((a) => a.redisName).sort(),
      startIso,
      endIso,
      earliest: earliestFlag,
      includeUpnl,
      boundary: "shifted",
      dayStartHour,
      zeroIsLoss: false,
    });
    const etag = hashETag(etagSeed);
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }

    // Build per-account in parallel (REALIZED-only aggregations)
    const perEntries = await Promise.all(
      validInfos.map(async (info) => {
        const m = await buildAccountMetrics(
          info,
          startIso as ISODate,
          endIso,
          includeUpnl, // still appends UPNL to last day equity only
          dayStartHour
        );
        return [info.redisName, m] as const;
      })
    );
    const per_account: Record<string, MetricsSlim> =
      Object.fromEntries(perEntries);
    const merged = mergeMetrics(per_account);

    // LIVE UPNL payloads for realtime overlays (only if requested)
    let live_upnl:
      | {
          as_of: string;
          combined_upnl: number;
          per_account_upnl: Record<string, number>;
          combined_symbol_upnl?: Record<string, number>;
          per_account_symbol_upnl?: Record<string, Record<string, number>>;
        }
      | undefined;

    if (includeUpnl) {
      const r = getRedis();

      const per_account_upnl: Record<string, number> = {};
      const per_account_symbol_upnl: Record<
        string,
        Record<string, number>
      > = {};

      await Promise.all(
        validInfos.map(async (info) => {
          const [sum, symMap] = await Promise.all([
            loadUpnlSum(r, info.redisName),
            loadUpnlPerSymbolMap(r, info.redisName),
          ]);
          per_account_upnl[info.redisName] = Number.isFinite(sum) ? sum : 0;
          if (symMap && Object.keys(symMap).length > 0) {
            const norm: Record<string, number> = {};
            for (const [k, v] of Object.entries(symMap)) {
              norm[k.toUpperCase()] = Number.isFinite(v) ? Number(v) : 0;
            }
            per_account_symbol_upnl[info.redisName] = norm;
          }
        })
      );

      const combined_upnl = validInfos.reduce(
        (s, a) => s + (per_account_upnl[a.redisName] ?? 0),
        0
      );

      let combined_symbol_upnl: Record<string, number> | undefined;
      if (Object.keys(per_account_symbol_upnl).length > 0) {
        const agg = new Map<string, number>();
        for (const a of validInfos) {
          const m = per_account_symbol_upnl[a.redisName];
          if (!m) continue;
          for (const [sym, v] of Object.entries(m)) {
            agg.set(sym, (agg.get(sym) ?? 0) + (Number.isFinite(v) ? v : 0));
          }
        }
        combined_symbol_upnl = Object.fromEntries(
          Array.from(agg.entries()).sort(
            (a, b) => Math.abs(b[1]) - Math.abs(a[1])
          )
        );
      }

      live_upnl = {
        as_of: new Date().toISOString(),
        combined_upnl,
        per_account_upnl,
        combined_symbol_upnl,
        per_account_symbol_upnl:
          Object.keys(per_account_symbol_upnl).length > 0
            ? per_account_symbol_upnl
            : undefined,
      };
    }

    const resp: MultiMetricsResponseSlim & {
      debug?: DebugInfo;
      live_upnl?: typeof live_upnl;
    } = {
      selected: validInfos.map((a) => a.redisName),
      window: {
        start: startIso as ISODate,
        end: endIso,
        earliest: earliestFlag,
      },
      merged,
      per_account,
      ignored: ignored.length ? ignored : undefined,
      meta: {
        server_time_utc: new Date().toISOString(),
        run_date_used: endIso,
        day_start_hour: dayStartHour,
      },
      live_upnl, // live UPNL for realtime overlays
    };

    // Optional debug tail
    if (debugFlag) {
      const tails: Record<string, DebugTailItem[]> = {};
      for (const [k, m] of Object.entries(per_account)) {
        const d = [...m.daily].sort((a, b) => a.day.localeCompare(b.day));
        const tail: DebugTailItem[] = d.slice(-15).map((r) => ({
          day: r.day,
          net: r.net_pnl,
        }));
        tails[k] = tail;
      }
      resp.debug = {
        day_start_hour: dayStartHour,
        window: { start: resp.window.start, end: resp.window.end },
        tails,
      };
    }

    return NextResponse.json(resp, {
      status: 200,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
