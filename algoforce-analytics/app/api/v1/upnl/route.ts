import { NextResponse } from "next/server";
import { redis } from "@/lib/db/redis";
import {
  ACCOUNT_SET,
  ACCOUNTS_INFO,
} from "@/app/api/v1/1-performance_metrics/calculators/accounts_json";
import {
  loadUpnlSum,
  loadUpnlPerSymbolMap,
} from "@/app/api/v1/1-performance_metrics/calculators/redis_parsers";

type UpnlResponse = {
  as_of: string;
  combined_upnl: number;
  per_account_upnl: Record<string, number>;
  /** Optional live per-symbol breakdown per account. */
  per_account_symbol_upnl?: Record<string, Record<string, number>>;
  base_snapshot_id?: string;
  accounts: string[];
};

function parseAccountsParam(sp: URLSearchParams): string[] {
  const raw = sp.get("accounts");
  if (!raw || raw.trim().length === 0) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const includeBreakdown =
      sp.get("includeBreakdown") === "1" ||
      sp.get("includeBreakdown") === "true";

    const requested = parseAccountsParam(sp);
    const monitoredDefaults = ACCOUNTS_INFO.filter((a) => !!a.monitored).map(
      (a) => a.redisName
    );
    const allRedisNames = ACCOUNTS_INFO.map((a) => a.redisName);
    const defaults =
      monitoredDefaults.length > 0 ? monitoredDefaults : allRedisNames;
    const accounts = requested.length > 0 ? requested : defaults;

    const unknown = accounts.filter((a) => !ACCOUNT_SET.has(a));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: "Unknown accounts", details: { unknown } },
        { status: 400 }
      );
    }

    const r = redis();

    const per_account_upnl: Record<string, number> = {};
    const per_account_symbol_upnl: Record<string, Record<string, number>> = {};

    await Promise.all(
      accounts.map(async (acc) => {
        const v = await loadUpnlSum(r, acc);
        per_account_upnl[acc] = Number.isFinite(v) ? v : 0;

        if (includeBreakdown) {
          per_account_symbol_upnl[acc] = await loadUpnlPerSymbolMap(r, acc);
        }
      })
    );

    const combined_upnl = accounts.reduce(
      (s, a) => s + (per_account_upnl[a] ?? 0),
      0
    );
    const base_snapshot_id = sp.get("base_snapshot_id") || undefined;

    const body: UpnlResponse = {
      as_of: new Date().toISOString(),
      combined_upnl,
      per_account_upnl,
      base_snapshot_id,
      accounts,
      ...(includeBreakdown ? { per_account_symbol_upnl } : {}),
    };

    const res = NextResponse.json(body, { status: 200 });
    res.headers.set("Cache-Control", "no-store, must-revalidate");
    return res;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/v1/upnl] error:", err);
    return NextResponse.json({ error: "UPNL fetch failed" }, { status: 500 });
  }
}
