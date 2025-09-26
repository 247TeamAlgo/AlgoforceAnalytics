// src/lib/redis_metrics.ts
import { redis } from "@/lib/db/redis";
import type { DailyRow } from "./types";

/* ────────────────── wire types (mirror your report) ────────────────── */
export type Trade = {
    exit_dt?: string;
    qty_0?: number | string;
    entry_price_0?: number | string;
    exit_price_0?: number | string;
    qty_1?: number | string;
    entry_price_1?: number | string;
    exit_price_1?: number | string;
};

export type Tradesheet = { tradeslist?: Trade[] };

/* ───────────────────────── utils ───────────────────────── */
function toNum(x: unknown): number {
    if (typeof x === "number") return Number.isFinite(x) ? x : 0;
    if (typeof x === "string") {
        const n = Number(x);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function safeJson<T>(raw: string | null): T | null {
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
}

/** Return "YYYY-MM-DD" for a Date in a specific IANA tz (no DST math by hand). */
export function localDayISO(d: Date, tz: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(d);
    const g = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    return `${g("year")}-${g("month")}-${g("day")}`;
}

export function parseIsoDay(s: string): Date {
    // interpret as local day at 00:00:00 in system tz, then use only date fields
    // downstream we compare as strings (YYYY-MM-DD), so this is for validation only
    const [y, m, d] = s.split("-").map(n => Number(n));
    return new Date(y, (m || 1) - 1, d || 1);
}

export type ClosedTrade = Trade & { exit_dt: string };

function isClosed(t: Trade): t is ClosedTrade {
    return typeof t.exit_dt === "string" && Number.isFinite(Date.parse(t.exit_dt));
}

export async function loadClosedTrades(accountKey: string): Promise<ClosedTrade[]> {
    const [, , tsRaw] = await redis().mget(
        `${accountKey}_balance`,
        `${accountKey}_live`,
        `${accountKey}_tradesheet`
    );
    const ts = safeJson<Tradesheet>(tsRaw);
    const list = ts?.tradeslist ?? [];
    return list.filter(isClosed);
}

/** Per-trade PnL using the same math as /api/report. */
export function tradePnl(t: Trade): number {
    const leg0 = toNum(t.qty_0) * (toNum(t.exit_price_0) - toNum(t.entry_price_0));
    const leg1 = toNum(t.qty_1) * (toNum(t.exit_price_1) - toNum(t.entry_price_1));
    return leg0 + leg1;
}

/** Group closed trades by local day (YYYY-MM-DD) and sum PnL; fees are 0. */
export function groupDailyByExitDate(trades: Trade[], tz: string): Map<string, DailyRow> {
    const m = new Map<string, DailyRow>();
    for (const t of trades) {
        const exitMs = Date.parse(String(t.exit_dt));
        if (!Number.isFinite(exitMs)) continue;
        const day = localDayISO(new Date(exitMs), tz);
        const pnl = tradePnl(t);
        const prev = m.get(day) ?? { day, gross_pnl: 0, fees: 0, net_pnl: 0 };
        // No explicit gross vs net in Redis; fees unknown => 0; gross == net == pnl.
        prev.gross_pnl += pnl;
        prev.net_pnl += pnl;
        m.set(day, prev);
    }
    return m;
}

/** Returns sorted daily rows within [startInclusive, endExclusive). */
export function sliceDaily(
    daily: Map<string, DailyRow>,
    startInclusive: string,
    endExclusive: string
): DailyRow[] {
    const rows: DailyRow[] = [];
    for (const [day, r] of daily) {
        if (day >= startInclusive && day < endExclusive) rows.push(r);
    }
    rows.sort((a, b) => a.day.localeCompare(b.day));
    return rows;
}

/** Earliest / latest local day available for this account (from exit_dt). */
export function earliestDay(daily: Map<string, DailyRow>): string | null {
    if (daily.size === 0) return null;
    return [...daily.keys()].sort()[0] ?? null;
}
export function latestDay(daily: Map<string, DailyRow>): string | null {
    if (daily.size === 0) return null;
    const sorted = [...daily.keys()].sort();
    return sorted[sorted.length - 1] ?? null;
}
