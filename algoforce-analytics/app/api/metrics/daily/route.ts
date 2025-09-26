// app/api/trades/daily/route.ts
import { NextResponse } from "next/server";
import { readAccounts } from "@/lib/jsonStore";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getSQLTradesPool } from "@/lib/db/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse { res.headers.set("Cache-Control", "no-store"); return res; }

interface DailyAggRow extends RowDataPacket {
  day: string;
  gross_pnl: number | null;
  fees: number | null;
  net_pnl: number | null;
}

async function tableNameFor(account: string): Promise<string> {
  const all = await readAccounts();
  const found = all.find(a => a.redisName.toLowerCase() === account.toLowerCase());
  return (found?.binanceName || account).toLowerCase();
}

function parseYmd(s: string): Date { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m ?? 1) - 1, d ?? 1); }
function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayInTZ(tz: string): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date());
}

interface MinRow extends RowDataPacket { day: string | null; }
async function earliestLocalDateForAccount(tz: string, account: string): Promise<string | null> {
  const pool: Pool = getSQLTradesPool();
  const table = await tableNameFor(account);
  const [rows] = await pool.query<MinRow[]>(
    `SELECT DATE(CONVERT_TZ(MIN(time),'UTC', ?)) AS day FROM \`${table}\``, [tz]
  );
  return rows?.[0]?.day ?? null;
}
async function latestLocalDateForAccount(tz: string, account: string): Promise<string | null> {
  const pool: Pool = getSQLTradesPool();
  const table = await tableNameFor(account);
  const [rows] = await pool.query<MinRow[]>(
    `SELECT DATE(CONVERT_TZ(MAX(time),'UTC', ?)) AS day FROM \`${table}\``, [tz]
  );
  return rows?.[0]?.day ?? null;
}

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

    if (earliest && !start) {
      const early = await earliestLocalDateForAccount(tz, account);
      start = early ?? todayInTZ(tz);
    }
    if (!end) end = todayInTZ(tz);

    // clamp end to latest
    const latest = await latestLocalDateForAccount(tz, account);
    if (latest && end > latest) end = latest;

    if (start && end && parseYmd(start) > parseYmd(end)) { const tmp = start; start = end; end = tmp; }

    const table = await tableNameFor(account);
    const pool: Pool = getSQLTradesPool();
    const sql = `
      SELECT
        DATE(CONVERT_TZ(time,'UTC', ?)) AS day,
        SUM(realizedPnl)               AS gross_pnl,
        SUM(commission)                AS fees,
        SUM(realizedPnl - commission)  AS net_pnl
      FROM \`${table}\`
      WHERE time >= CONVERT_TZ(CONCAT(?, ' 00:00:00'), ?, 'UTC')
        AND time <  CONVERT_TZ(CONCAT(?, ' 00:00:00'), ?, 'UTC')
      GROUP BY 1
      ORDER BY 1`;
    const endExclusive = toYYYYMMDD(new Date(parseYmd(end!).getTime() + 86_400_000)); // end + 1 day
    const [rows] = await pool.query<DailyAggRow[]>(sql, [tz, start, tz, endExclusive, tz]);
    const daily = rows.map(r => ({
      day: r.day,
      gross_pnl: Number(r.gross_pnl ?? 0),
      fees: Number(r.fees ?? 0),
      net_pnl: Number(r.net_pnl ?? 0),
    }));
    return noStore(NextResponse.json({ account, tz, startDate: start, endDate: end, daily }, { status: 200 }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return noStore(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
