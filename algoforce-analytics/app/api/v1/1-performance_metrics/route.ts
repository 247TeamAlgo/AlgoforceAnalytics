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
  loadUpnlSum,
  loadUpnlPerSymbolMap, // ← added
  type PairMap,
} from "./calculators/redis_parsers";

import {
  buildDailySeries,
  drawdownMagnitude,
  equityFromDaily,
} from "./calculators/series_builders";
import {
  ISODate,
  MetricsSlim,
  Bucket,
  MultiMetricsResponseSlim,
} from "./performance_metric_types";

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

/**
 * Per-day sums and bucket items.
 */
function groupDailyAndBuckets(
  trades: TradeRow[],
  pairMap: PairMap,
  dayStartHour: Hour0to23
): {
  byDay: Map<string, { gross: number; fees: number; net: number }>;
  perSymbolItems: Array<{ label: string; total: number }>;
  perPairItems: Array<{ label: string; total: number }>;
} {
  const byDay = new Map<string, { gross: number; fees: number; net: number }>();
  const perSymbolItems: Array<{ label: string; total: number }> = [];
  const perPairItems: Array<{ label: string; total: number }> = [];

  for (const t of trades) {
    const realized = num(t.realizedPnl);
    const fees = num(t.commission);
    const net = realized - fees;

    const ts = String(t.time ?? "");
    if (!ts) continue;

    const day = isoDayFromLocalDatetime(ts, dayStartHour);

    const sym = (t.symbol ?? "").toString().toUpperCase();
    const oid = (t.orderId ?? "").toString();

    const cur = byDay.get(day) ?? { gross: 0, fees: 0, net: 0 };
    cur.gross += realized;
    cur.fees += fees;
    cur.net += net;
    byDay.set(day, cur);

    if (sym) perSymbolItems.push({ label: sym, total: net });

    const pair = pairMap.get(oid) || sym || "UNMAPPED";
    perPairItems.push({ label: pair, total: net });
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

function recomputeFromDaily(
  initial: number,
  dailyIn: MetricsSlim["daily"]
): Pick<
  MetricsSlim,
  "drawdown_mag" | "streaks" | "total_return_pct_over_window"
> {
  const daily = [...dailyIn].sort((a, b) => a.day.localeCompare(b.day));

  const eq = equityFromDaily(initial, daily);
  const drawdown_mag = drawdownMagnitude(eq);

  const streaks = streaksFromDailyStrictNegative(daily);

  const endEq = eq.length ? eq[eq.length - 1]! : initial;
  const total_return_pct_over_window =
    initial > 0
      ? Number((((endEq - initial) / initial) * 100).toFixed(2))
      : null;
  return { drawdown_mag, streaks, total_return_pct_over_window };
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

  const trades = await selectFromFirstExistingTable(
    pool,
    tableCandidates,
    startTs,
    endTs
  );

  const pairMap = await loadTradesheetPairMap(r, info.redisName);
  const upnl = includeUpnlOnEnd ? await loadUpnlSum(r, info.redisName) : 0;

  const { byDay, perSymbolItems, perPairItems } = groupDailyAndBuckets(
    trades,
    pairMap,
    dayStartHour
  );

  const daily = buildDailySeries(startIso, endIso, byDay, upnl);
  const { drawdown_mag, streaks, total_return_pct_over_window } =
    recomputeFromDaily(initial_balance, daily);

  return {
    initial_balance,
    window_start: startIso,
    window_end: endIso,
    total_return_pct_over_window,
    drawdown_mag,
    streaks,
    daily,
    pnl_per_symbol: bucketsFrom(perSymbolItems), // REALIZED only (Python parity)
    pnl_per_pair: bucketsFrom(perPairItems), // REALIZED only
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
    const debug = rqp.get("debug") === "1";

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
      live_upnl, // ← NEW: live UPNL for realtime overlays
    };

    // Optional debug tail
    if (debug) {
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
