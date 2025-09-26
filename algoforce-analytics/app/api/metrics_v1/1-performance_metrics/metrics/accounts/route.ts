// algoforce-analytics\app\api\metrics_v1\1-performance_metrics\metrics\accounts\route.ts
import { NextResponse } from "next/server";
import { readAccounts } from "@/lib/jsonStore";
import type { MetricConfig } from "../types";
import { computeAccountMetrics } from "../../calculators/z_math_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(
  req: Request,
  ctx: { params: { account: string } }
): Promise<NextResponse> {
  try {
    const id = (ctx.params.account || "").toLowerCase();
    const known = new Set(
      (await readAccounts()).map((a) => a.binanceName.toLowerCase())
    );
    if (!known.has(id))
      return noStore(
        NextResponse.json({ error: "unknown account" }, { status: 400 })
      );

    const url = new URL(req.url);
    const cfg: MetricConfig = {
      tz: url.searchParams.get("tz") ?? "Asia/Manila",
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
      earliest:
        url.searchParams.get("earliest") === "true" ||
        url.searchParams.has("earliest"),
    };

    if (!cfg.startDate && !cfg.endDate) {
      const lastNDays = url.searchParams.get("lastNDays");
      const runDate = url.searchParams.get("runDate");
      if (lastNDays) cfg.lastNDays = Number(lastNDays);
      if (runDate) cfg.runDate = runDate;
    }

    const payload = await computeAccountMetrics(id, cfg);
    return noStore(NextResponse.json(payload, { status: 200 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return noStore(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
