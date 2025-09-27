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
  type PairMap,
} from "./calculators/redis_parsers";

import {
  buildDailySeries,
  drawdownMagnitude,
  equityFromDaily,
  losingStreaksFromDaily,
} from "./calculators/series_builders";

import type {
  ISODate,
  Bucket,
  MetricsSlim,
  MultiMetricsResponseSlim,
} from "./performance_metric_types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* -------------------------- helpers (UTC dates) -------------------------- */

function todayUTCISO(): ISODate {
  return new Date().toISOString().slice(0, 10) as ISODate;
}
function asISODateOrThrow(s: string | null): ISODate {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error("Invalid date format; expected YYYY-MM-DD");
  }
  return s as ISODate;
}

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
  return `"W/${h.toString(16)}"`;
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

function groupDailyAndBuckets(
  trades: TradeRow[],
  pairMap: PairMap
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

    const day = (t.time ?? "").slice(0, 10);
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
  daily: MetricsSlim["daily"]
): Pick<
  MetricsSlim,
  "drawdown_mag" | "streaks" | "total_return_pct_over_window"
> {
  const eq = equityFromDaily(initial, daily);
  const drawdown_mag = drawdownMagnitude(eq);
  const streaks = losingStreaksFromDaily(daily);
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
  includeUpnlOnEnd: boolean
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

  const trades = await selectFromFirstExistingTable(
    pool,
    tableCandidates,
    `${startIso} 00:00:00`,
    `${endIso} 23:59:59`
  );

  const pairMap = await loadTradesheetPairMap(r, info.redisName);
  const upnl = includeUpnlOnEnd ? await loadUpnlSum(r, info.redisName) : 0;

  const { byDay, perSymbolItems, perPairItems } = groupDailyAndBuckets(
    trades,
    pairMap
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
    pnl_per_symbol: bucketsFrom(perSymbolItems),
    pnl_per_pair: bucketsFrom(perPairItems),
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
    pnl_per_symbol: mergeBucketList(allSym),
    pnl_per_pair: mergeBucketList(allPair),
  };
}

/* --------------------------------- GET ---------------------------------- */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const rqp = req.nextUrl.searchParams;

    const accountsParam = (
      req.nextUrl.searchParams.get("accounts") || ""
    ).trim();
    let accountIds = accountsParam
      ? accountsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (!accountIds.length) {
      // Safe fallback: only use monitored accounts if ACCOUNTS_INFO is a real array
      if (Array.isArray(ACCOUNTS_INFO)) {
        accountIds = ACCOUNTS_INFO.filter((a) => a?.monitored).map(
          (a) => a.redisName
        );
      } else {
        // If even that isn't available, return a clear error rather than throwing on `.filter`
        return NextResponse.json(
          {
            error: "No accounts were provided and ACCOUNTS_INFO is unavailable",
          },
          { status: 400 }
        );
      }
    }

    // includeUpnl? default FALSE
    const includeUpnl =
      rqp.get("includeUpnl") === "1" || rqp.get("includeUpnl") === "true";

    const earliestFlag =
      rqp.get("earliest") === "true" || rqp.get("earliest") === "1";
    const startDateRaw = rqp.get("startDate");
    const endDateRaw = rqp.get("endDate") ?? todayUTCISO();

    const endIso = asISODateOrThrow(endDateRaw);
    let startIso: ISODate | null = startDateRaw
      ? asISODateOrThrow(startDateRaw)
      : null;

    // validate account ids -> AccountInfo
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

    // baseline validation: numeric only; allow 0 as legitimate
    for (const info of validInfos) {
      const v = readBaselineUsd(info.redisName);
      if (!Number.isFinite(v)) {
        return NextResponse.json(
          { error: `Baseline for ${info.redisName} is not numeric` },
          { status: 400 }
        );
      }
    }

    // earliest logic
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

    // Build per-account in parallel
    const perEntries = await Promise.all(
      validInfos.map(async (info) => {
        const m = await buildAccountMetrics(
          info,
          startIso as ISODate,
          endIso,
          includeUpnl
        );
        return [info.redisName, m] as const;
      })
    );
    const per_account: Record<string, MetricsSlim> =
      Object.fromEntries(perEntries);
    const merged = mergeMetrics(per_account);

    const resp: MultiMetricsResponseSlim = {
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
      },
    };

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
