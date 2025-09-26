// app/api/metrics/selection/route.ts
import { NextResponse } from "next/server";
import { computeMergedMetricsForAccounts } from "@/lib/metrics";
import type { MetricConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse { res.headers.set("Cache-Control", "no-store"); return res; }

export async function GET(req: Request): Promise<NextResponse> {
    try {
        const url = new URL(req.url);
        const tz = url.searchParams.get("tz") || "Asia/Manila";
        const accountsParam = url.searchParams.get("accounts") || "";
        const accounts = accountsParam.split(",").map(s => s.trim()).filter(Boolean);

        const cfg: MetricConfig = {
            tz,
            startDate: url.searchParams.get("startDate") || undefined,
            endDate: url.searchParams.get("endDate") || undefined,
            earliest: url.searchParams.get("earliest") === "true" || url.searchParams.has("earliest"),
        };

        if (!cfg.startDate && !cfg.endDate) {
            const lastNDays = url.searchParams.get("lastNDays");
            const runDate = url.searchParams.get("runDate");
            if (lastNDays) cfg.lastNDays = Number(lastNDays);
            if (runDate) cfg.runDate = runDate;
        }

        const data = await computeMergedMetricsForAccounts(accounts, cfg);

        // meta
        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz, hour12: false,
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
        }).formatToParts(now);
        const val = (t: string) => parts.find(p => p.type === t)?.value ?? "";
        const server_time_in_tz = `${val("year")}-${val("month")}-${val("day")}T${val("hour")}:${val("minute")}:${val("second")}`;

        return noStore(NextResponse.json({
            ...data,
            meta: {
                server_time_utc: now.toISOString(),
                server_time_in_tz,
                tz_resolved: tz,
                run_date_used: data.config.run_date,
            }
        }, { status: 200 }));
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        return noStore(NextResponse.json({ error: msg }, { status: 500 }));
    }
}
