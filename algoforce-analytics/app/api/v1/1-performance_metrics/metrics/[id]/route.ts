// app/api/metrics/[id]/route.ts
import { NextResponse } from "next/server";
import { computeAccountMetrics } from "../../calculators/z_math_helpers";
import type { MetricConfig } from "../types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
    res.headers.set("Cache-Control", "no-store");
    return res;
}

function localDateTimeISO(d: Date, tz: string): string {
    // Format yyyy-mm-ddThh:mm:ss in tz (no offset tail to keep it simple)
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse> {
    try {
        const url = new URL(req.url);
        const tz = url.searchParams.get("tz") || "Asia/Manila";
        const lastNDays = Number(url.searchParams.get("lastNDays") || 10);
        const runDate = url.searchParams.get("runDate") || undefined;

        const payload = await computeAccountMetrics(ctx.params.id, {
            tz,
            lastNDays,
            runDate,
        } as MetricConfig);

        const now = new Date();
        const meta = {
            server_time_utc: now.toISOString(),
            server_time_in_tz: localDateTimeISO(now, tz),
            tz_resolved: tz,
            run_date_used: payload.config.run_date,
        };

        // non-breaking: add meta on top
        return noStore(NextResponse.json({ ...payload, meta }, { status: 200 }));
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to compute metrics";
        return noStore(NextResponse.json({ error: msg }, { status: 500 }));
    }
}
