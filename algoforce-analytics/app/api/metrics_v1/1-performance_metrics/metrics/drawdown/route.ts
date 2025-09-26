import { NextResponse } from "next/server";
import { readAccounts } from "@/lib/jsonStore";
import type { MetricConfig } from "../types";
import { computePerAccountAndCombinedMinDD } from "../../calculators/per_account_drawdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  try {
    const tz = url.searchParams.get("tz") || "Asia/Manila";

    const raw = (url.searchParams.get("accounts") || "").trim();
    if (!raw) {
      return noStore(
        NextResponse.json(
          { error: "accounts query is required (comma-separated)" },
          { status: 400 }
        )
      );
    }
    const input = [
      ...new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    ];

    // Validate against known accounts (redisName)
    const all = await readAccounts();
    const known = new Set(all.map((a) => a.redisName));
    const selected = input.filter((a) => known.has(a));
    if (!selected.length) {
      return noStore(
        NextResponse.json(
          { error: "no valid accounts in selection" },
          { status: 400 }
        )
      );
    }

    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;
    const earliest =
      url.searchParams.get("earliest") === "true" ||
      url.searchParams.has("earliest");

    const cfg: MetricConfig = { tz, startDate, endDate, earliest };
    const result = await computePerAccountAndCombinedMinDD(selected, cfg);

    const now = new Date();
    const meta = {
      server_time_utc: now.toISOString(),
      tz_resolved: tz,
      run_date_used: result.window_end,
      accounts_used: selected,
    };

    return noStore(NextResponse.json({ ...result, meta }, { status: 200 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    console.error("[drawdown_bars] error:", err);
    return noStore(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
