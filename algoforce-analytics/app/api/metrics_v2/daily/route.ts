// app/api/trades/daily/route.ts  (REDIS VERSION)
import { NextResponse } from "next/server";
import { readAccounts } from "@/lib/jsonStore";
import { groupDailyByExitDate, loadClosedTrades, localDayISO, sliceDaily } from "@/lib/redis_metrics";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse { res.headers.set("Cache-Control", "no-store"); return res; }

function parseYmd(s: string): Date { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m ?? 1) - 1, d ?? 1); }
function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayInTZ(tz: string): string { return localDayISO(new Date(), tz); }

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const account = (searchParams.get("account") ?? "").toLowerCase();
    const tz = searchParams.get("tz") ?? "Asia/Manila";

    // New param names (preferred)
    let start = searchParams.get("startDate") || undefined;
    let end = searchParams.get("endDate") || undefined;
    const earliest = searchParams.get("earliest") === "true" || searchParams.has("earliest");

    // Back-compat aliases
    start = start ?? (searchParams.get("start") || undefined);
    end = end ?? (searchParams.get("end") || undefined);

    const known = new Set((await readAccounts()).map(a => a.redisName.toLowerCase()));
    if (!known.has(account)) return noStore(NextResponse.json({ error: "unknown account" }, { status: 400 }));

    // Load and group once
    const trades = await loadClosedTrades(account);
    const grouped = groupDailyByExitDate(trades, tz);

    // earliest bootstrap
    const allDays = [...grouped.keys()].sort();
    const earliestDay = allDays[0] ?? todayInTZ(tz);
    const latestDay = allDays.length ? allDays[allDays.length - 1] : todayInTZ(tz);

    if (earliest && !start) start = earliestDay;
    if (!end) end = todayInTZ(tz);

    // clamp end to latest available
    if (end > latestDay) end = latestDay;

    // normalize order
    if (start && end && parseYmd(start) > parseYmd(end)) { const tmp = start; start = end; end = tmp; }

    // compute [start, end+1)
    const endExclusive = toYYYYMMDD(new Date(parseYmd(end!).getTime() + 86_400_000));
    const rows = sliceDaily(grouped, start!, endExclusive);
    const daily = rows.map(r => ({
      day: r.day,
      gross_pnl: Number(r.gross_pnl ?? 0),
      fees: 0,                       // Redis doesn't have fees; keep explicit
      net_pnl: Number(r.net_pnl ?? 0),
    }));

    return noStore(NextResponse.json({ account, tz, startDate: start, endDate: end, daily }, { status: 200 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return noStore(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
