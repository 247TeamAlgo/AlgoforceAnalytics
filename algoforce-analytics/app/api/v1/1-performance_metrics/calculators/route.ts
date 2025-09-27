import { NextResponse } from "next/server";
import { consecutiveLosingDays } from "./consecutive_losing_days";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
    res.headers.set("Cache-Control", "no-store");
    return res;
}
export async function GET(req: Request): Promise<NextResponse> {
    try {
        const accountKey = "fund2";
        const startISO = "2025-09-01T00:00:00";
        const endISO = "2025-09-27 12:00:28";
        const result = await consecutiveLosingDays(accountKey, startISO, endISO);
        return noStore(NextResponse.json(result, { status: 200 }));
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        return noStore(NextResponse.json({ error: msg }, { status: 500 }));
    }
}