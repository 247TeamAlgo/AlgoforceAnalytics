// app/api/metrics_v2/route.ts
import { NextResponse } from "next/server";
import { computeSelectedMetricsV2 } from "@/lib/metrics_v2";
import { readAccounts } from "@/lib/jsonStore";
import type { MetricConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse { res.headers.set("Cache-Control", "no-store"); return res; }

export async function GET(req: Request): Promise<NextResponse> {
    try {
        const url = new URL(req.url);
        const tz = url.searchParams.get("tz") || "Asia/Manila";

        const raw = (url.searchParams.get("accounts") || "").trim();
        if (!raw) return noStore(NextResponse.json({ error: "accounts query is required (comma-separated)" }, { status: 400 }));

        const input = [...new Set(raw.split(",").map(s => s.trim()).filter(Boolean))];

        const all = await readAccounts();
        const monitoredSet = new Set(all.filter(a => a.monitored).map(a => a.redisName));
        const selected = input.filter(a => monitoredSet.has(a));
        if (!selected.length) {
            return noStore(NextResponse.json({ error: "no valid monitored accounts found in selection" }, { status: 400 }));
        }

        const lastNDaysRaw = url.searchParams.get("lastNDays");
        const cfg: Partial<MetricConfig> = { tz, lastNDays: lastNDaysRaw ? Number(lastNDaysRaw) : undefined };

        const result = await computeSelectedMetricsV2(selected, cfg);

        // meta
        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
        }).formatToParts(now);
        const g = (t: string) => parts.find(p => p.type === t)?.value ?? "";
        const meta = {
            server_time_utc: now.toISOString(),
            server_time_in_tz: `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`,
            tz_resolved: tz,
            run_date_used: result.merged.daily_return_last_n_days.window_end,
        };

        return noStore(NextResponse.json({ ...result, meta }, { status: 200 }));
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        return noStore(NextResponse.json({ error: msg }, { status: 500 }));
    }
}
