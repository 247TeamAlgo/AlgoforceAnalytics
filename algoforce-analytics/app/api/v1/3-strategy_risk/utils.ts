// FILE: app/analytics_adem_3_josh/utils.ts
import { createPool, type Pool } from "mysql2/promise";
import { redis } from "@/lib/redis";
import { fetchOHLCRows } from "@/lib/metrics_core";
import type { AccountsheetObject, PairRow } from "./types";

// ------------------ DATE HELPERS ------------------
export function localTodayISO(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function addDaysISODate(iso: string, n: number): string {
  return addDays(new Date(`${iso}T00:00:00`), n)
    .toISOString()
    .slice(0, 10);
}

// ------------------ MYSQL OHLC ------------------
let pool: Pool | null = null;

export function getSQLOHLCPool(): Pool {
  if (!pool) {
    pool = createPool({
      host: process.env.MYSQL_HOST ?? "192.168.50.238",
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? "247team",
      password: process.env.MYSQL_PASSWORD ?? "password",
      database: process.env.MYSQL_DATABASE ?? "OHLC",

      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_POOL_SIZE ?? 10),
      queueLimit: 0,

      // we store timestamps in UTC and convert in SQL via CONVERT_TZ
      timezone: "Z",

      // safer number handling
      supportBigNumbers: true,
      bigNumberStrings: true,

      // keep DATETIME as strings; you already handle parsing/formatting yourself
      dateStrings: true,
    });
  }
  return pool;
}

/**
 * Fetch OHLC rows for a given symbol (delegates to lib/metrics_core).
 */
export async function fetchOhlcForSymbol(
  symbol: string,
  tz: string,
  startISO: string,
  endExclusive: string
) {
  return fetchOHLCRows(symbol, tz, startISO, endExclusive);
}

// ------------------ REDIS UNIQUE PAIRS ------------------
function extractPairRows(data: unknown): PairRow[] {
  if (data == null || typeof data !== "object") return [];
  const obj = data as AccountsheetObject;

  const out: PairRow[] = [];
  for (const [id, entry] of Object.entries(obj)) {
    if (!entry || typeof entry !== "object") continue;
    const p = entry.pair;
    if (typeof p === "string" && p.length > 0) {
      out.push({ id, pair: p, entry });
    }
  }
  return out;
}

function uniquePairs(rows: PairRow[]): string[] {
  return [...new Set(rows.map((r) => r.pair))];
}

/**
 * Get all unique trading pairs across all accounts stored in Redis.
 */
export async function fetchUniquePairsFromRedis(): Promise<string[]> {
  const accounts = [
    "af1",
    "af5",
    "fund2",
    "fund3",
    "mirrorx1",
    "mirrorx2",
    "mirrorx3",
    "mirrorx4",
    "office",
    "team",
  ];

  // Only request the `_tradesheet` keys, since pairs live there
  const keys = accounts.map((acc) => `${acc}_tradesheet`);
  const values = await redis().mget(...keys); // (string | null)[]

  const allRows: PairRow[] = [];
  for (const raw of values) {
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw); // object keyed by "pair_xx"
      const rows = extractPairRows(parsed);
      allRows.push(...rows);
    } catch {
      // ignore malformed payloads
    }
  }

  return uniquePairs(allRows);
}
