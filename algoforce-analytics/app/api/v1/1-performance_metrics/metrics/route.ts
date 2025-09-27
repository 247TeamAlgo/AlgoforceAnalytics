// app/api/v1/1-performance_metrics/metrics/route.ts
import { NextResponse } from "next/server";
import { readAccounts } from "@/lib/jsonStore";
import { computeSelectedMetrics } from "../../1-performance_metrics/calculators/z_math_helpers";
import type { MetricConfig } from "./types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
    res.headers.set("Cache-Control", "no-store");
    return res;
}

function makeMeta(tz: string, window_end: string) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).formatToParts(now);
    const g = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    return {
        server_time_utc: now.toISOString(),
        server_time_in_tz: `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`,
        tz_resolved: tz,
        run_date_used: window_end,
    };
}

export async function GET(req: Request): Promise<NextResponse> {
    try {
        const url = new URL(req.url);
        const tz = url.searchParams.get("tz") || "Asia/Manila";

        // New knobs
        const startDate = url.searchParams.get("startDate") || undefined;
        const endDate = url.searchParams.get("endDate") || undefined;
        const earliest = url.searchParams.get("earliest") === "true" || url.searchParams.has("earliest");

        // Legacy (ignored if start/end provided)
        const lastNDays = startDate || endDate ? undefined : (url.searchParams.get("lastNDays") ? Number(url.searchParams.get("lastNDays")) : undefined);
        const runDate = startDate || endDate ? undefined : (url.searchParams.get("runDate") || undefined);

        const raw = (url.searchParams.get("accounts") || "").trim();
        if (!raw) return noStore(NextResponse.json({ error: "accounts query is required (comma-separated)" }, { status: 400 }));
        const input = [...new Set(raw.split(",").map(s => s.trim()).filter(Boolean))];

        const all = await readAccounts();
        const monitoredSet = new Set(all.filter(a => a.monitored).map(a => a.redisName));
        const selected = input.filter(a => monitoredSet.has(a));
        if (!selected.length) {
            return noStore(NextResponse.json({ error: "no valid monitored accounts found in selection" }, { status: 400 }));
        }

        const cfg: MetricConfig = { tz, startDate, endDate, earliest, lastNDays, runDate };
        const result = await computeSelectedMetrics(selected, cfg);
        const meta = makeMeta(tz, result.merged.daily_return_last_n_days.window_end);

        return noStore(NextResponse.json({ ...result, meta }, { status: 200 }));
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        return noStore(NextResponse.json({ error: msg }, { status: 500 }));
    }
}