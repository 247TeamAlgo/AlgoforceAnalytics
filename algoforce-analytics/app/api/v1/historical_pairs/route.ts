// app/api/historical_pairs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/db/redis";

type TradeRow = {
  pair: string;
  entry_price_0?: number; entry_price_1?: number;
  exit_price_0?: number;  exit_price_1?: number;
  qty_0?: number;         qty_1?: number;
  exit_dt?: string | null;
};

type BucketAgg = { pnl_pos: number; pnl_neg: number; count: number; wins: number };
type Bucket = { label: string; pnl_pos: number; pnl_neg: number; count: number; winrate_pct: number };

function add(a: BucketAgg, pnl: number) {
  a.count += 1;
  if (pnl >= 0) { a.pnl_pos += pnl; a.wins += 1; }
  else          { a.pnl_neg += pnl; } // keep NEGATIVE
}

function toBuckets(map: Map<string, BucketAgg>): Bucket[] {
  return Array.from(map.entries()).map(([label, v]) => ({
    label,
    pnl_pos: Number(v.pnl_pos.toFixed(2)),
    pnl_neg: Number(v.pnl_neg.toFixed(2)),
    count: v.count,
    winrate_pct: v.count ? (v.wins / v.count) * 100 : 0,
  }));
}

function safeNum(n: unknown): number { const v = Number(n); return Number.isFinite(v) ? v : 0; }

/** Unlevered USD PnL for a trade (sum of legs) */
function tradePnlUSD(t: TradeRow): number {
  const e0 = safeNum(t.entry_price_0), x0 = safeNum(t.exit_price_0), q0 = safeNum(t.qty_0);
  const e1 = safeNum(t.entry_price_1), x1 = safeNum(t.exit_price_1), q1 = safeNum(t.qty_1);
  const leg0 = (x0 - e0) * q0;
  const leg1 = (x1 - e1) * q1;
  return leg0 + leg1;
}

/** Split "AAAUSDT_BBBUSDT" -> ["AAAUSDT","BBBUSDT"] safely */
function baseSymbols(pair: string): [string, string] {
  const [a, b] = (pair || "").split("_");
  return [a ?? "", b ?? ""];
}

/* ───────────── date helpers: YYYY-MM-DD + optional dayStartHour ───────────── */

type Hour0to23 = 0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23;

function parseDayStartHour(raw: string | null): Hour0to23 {
  const n = raw == null ? NaN : Number(raw);
  if (Number.isFinite(n)) {
    const h = Math.trunc(n);
    if (h >= 0 && h <= 23) return h as Hour0to23;
  }
  return 0;
}

function parseYmdOrThrow(s: string | null, name: string): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Invalid ${name}; expected YYYY-MM-DD`);
  }
  // Construct at local midnight; we only use it as a numeric boundary.
  const y = Number(s.slice(0,4));
  const m = Number(s.slice(5,7));
  const d = Number(s.slice(8,10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function shiftBackHours(dt: Date, hours: Hour0to23): Date {
  const z = new Date(dt.getTime());
  z.setHours(z.getHours() - hours);
  return z;
}

function inShiftedWindow(exitIso: string, startYmd: Date, endYmd: Date, dayStartHour: Hour0to23): boolean {
  const t = new Date(exitIso);                // parse whatever tz the string has
  if (isNaN(+t)) return false;
  const shifted = shiftBackHours(t, dayStartHour);
  const start = shiftBackHours(startYmd, dayStartHour);
  const end   = shiftBackHours(endYmd,   dayStartHour);
  return shifted >= start && shifted <= end;
}

/* ─────────────────────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const account = (searchParams.get("account") ?? "").toLowerCase();
    if (!account) {
      return NextResponse.json({ error: "missing account" }, { status: 400 });
    }

    // Optional date window (inclusive)
    const startRaw = searchParams.get("startDate"); // YYYY-MM-DD
    const endRaw   = searchParams.get("endDate");   // YYYY-MM-DD
    const dayStartHour = parseDayStartHour(searchParams.get("dayStartHour")); // default 0

    let startYmd: Date | null = null;
    let endYmd: Date | null = null;

    if (startRaw && endRaw) {
      startYmd = parseYmdOrThrow(startRaw, "startDate");
      endYmd   = parseYmdOrThrow(endRaw,   "endDate");
      if (endYmd < startYmd) {
        return NextResponse.json({ error: "endDate must be >= startDate" }, { status: 400 });
      }
      // Use full-day inclusive end
      endYmd.setHours(23, 59, 59, 999);
    } else if (startRaw || endRaw) {
      return NextResponse.json({ error: "Provide both startDate and endDate, or neither" }, { status: 400 });
    }

    // Read redis JSON
    const raw = await redis().get(`${account}_tradesheet`);
    if (!raw) return NextResponse.json({ perPair: [], perSymbol: [] });

    let rows: TradeRow[] = [];
    try {
      const parsed = JSON.parse(raw as string);
      if (Array.isArray(parsed?.tradeslist)) {
        rows = parsed.tradeslist as TradeRow[];
      } else if (parsed && typeof parsed === "object") {
        rows = Object.values(parsed) as TradeRow[];
      }
    } catch {
      // ignore parse errors -> empty rows
    }

    // only closed trades (exit_dt present)
    rows = rows.filter(r => r?.exit_dt);

    // optional date-window filter (by exit_dt, inclusive), with boundary shift
    if (startYmd && endYmd) {
      rows = rows.filter(r => r.exit_dt && inShiftedWindow(String(r.exit_dt), startYmd!, endYmd!, dayStartHour));
    }

    // per PAIR aggregation
    const byPair = new Map<string, BucketAgg>();
    // per SYMBOL aggregation (split PnL evenly to each leg, matching your existing route)
    const bySym  = new Map<string, BucketAgg>();

    for (const t of rows) {
      const pnl = tradePnlUSD(t);
      const pair = t.pair ?? "";
      if (!byPair.has(pair)) byPair.set(pair, { pnl_pos: 0, pnl_neg: 0, count: 0, wins: 0 });
      add(byPair.get(pair)!, pnl);

      const [s0, s1] = baseSymbols(pair);
      const half = pnl / 2;
      if (s0) { if (!bySym.has(s0)) bySym.set(s0, { pnl_pos: 0, pnl_neg: 0, count: 0, wins: 0 }); add(bySym.get(s0)!, half); }
      if (s1) { if (!bySym.has(s1)) bySym.set(s1, { pnl_pos: 0, pnl_neg: 0, count: 0, wins: 0 }); add(bySym.get(s1)!, half); }
    }

    // Sort by absolute magnitude
    const perPair = toBuckets(byPair).sort((a, b) =>
      Math.abs(b.pnl_pos + b.pnl_neg) - Math.abs(a.pnl_pos + a.pnl_neg)
    );
    const perSymbol = toBuckets(bySym).sort((a, b) =>
      Math.abs(b.pnl_pos + b.pnl_neg) - Math.abs(a.pnl_pos + a.pnl_neg)
    );

    return NextResponse.json({ perPair, perSymbol, window: startYmd && endYmd ? {
      startDate: startRaw, endDate: endRaw, dayStartHour
    } : undefined });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
