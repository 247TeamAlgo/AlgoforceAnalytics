// app/api/metrics/overall/route.ts
import { NextResponse } from "next/server";
import { computeOverallMetrics } from "@/lib/metrics";
import type { MetricConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse { res.headers.set("Cache-Control", "no-store"); return res; }

function localDateTimeISO(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const tz = url.searchParams.get("tz") || "Asia/Manila";
    const cfg: MetricConfig = {
      tz,
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
      earliest: url.searchParams.get("earliest") === "true" || url.searchParams.has("earliest"),
    };

    // Legacy only if no date-range
    if (!cfg.startDate && !cfg.endDate) {
      const lastNDays = url.searchParams.get("lastNDays");
      const runDate = url.searchParams.get("runDate");
      if (lastNDays) cfg.lastNDays = Number(lastNDays);
      if (runDate) cfg.runDate = runDate;
    }

    const payload = await computeOverallMetrics(cfg);
    const now = new Date();
    const meta = {
      server_time_utc: now.toISOString(),
      server_time_in_tz: localDateTimeISO(now, tz),
      tz_resolved: tz,
      run_date_used: payload.config.run_date,
    };

    return noStore(NextResponse.json({ ...payload, meta }, { status: 200 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to compute metrics";
    return noStore(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
