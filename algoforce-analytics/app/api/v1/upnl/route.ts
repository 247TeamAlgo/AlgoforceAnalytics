// app/api/v1/upnl/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis as getRedis } from "@/lib/db/redis";
import { loadUpnlSum } from "../1-performance_metrics/calculators/redis_parsers";
import { getAccountInfo } from "../1-performance_metrics/calculators/accounts_json";

interface UpnlItem {
  account: string; // redisName
  upnl: number;
}

interface UpnlResponse {
  selected: string[];
  per_account: Record<string, UpnlItem>;
  combined_upnl: number;
  meta: {
    server_time_utc: string;
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const rqp = req.nextUrl.searchParams;
    const accountsParam = (rqp.get("accounts") || "").trim();
    const accountIds = accountsParam
      ? accountsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (!accountIds.length) {
      return NextResponse.json(
        { error: "accounts is required (comma-separated redisName list)" },
        { status: 400 }
      );
    }

    // validate accounts (ignore unknown, but report)
    const valid: string[] = [];
    const ignored: string[] = [];
    for (const k of accountIds) {
      if (getAccountInfo(k)) valid.push(k);
      else ignored.push(k);
    }
    if (!valid.length) {
      return NextResponse.json(
        { error: "No valid accounts in request", ignored },
        { status: 400 }
      );
    }

    const r = getRedis();

    const pairs = await Promise.all(
      valid.map(async (k) => {
        const v = await loadUpnlSum(r, k);
        return [k, { account: k, upnl: Number(v.toFixed(2)) }] as const;
      })
    );

    const per_account: Record<string, UpnlItem> = Object.fromEntries(pairs);
    const combined_upnl = Number(
      pairs.reduce((s, [, it]) => s + it.upnl, 0).toFixed(2)
    );

    const resp: UpnlResponse = {
      selected: valid,
      per_account,
      combined_upnl,
      meta: { server_time_utc: new Date().toISOString() },
    };

    return NextResponse.json(resp, {
      status: 200,
      headers: {
        "Cache-Control": "no-store", // realtime
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
