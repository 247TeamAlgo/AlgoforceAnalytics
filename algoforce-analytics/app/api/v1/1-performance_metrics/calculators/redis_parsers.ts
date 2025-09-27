// app/api/v1/1-performance_metrics/calculators/redis_parsers.ts
import type { Redis } from "ioredis";

/* ---------- minimal shapes we can rely on ---------- */
export interface UpnlRow {
  unrealizedProfit?: number | string;
  // other fields ignored
}
export interface RedisArrayContainer {
  rows?: UpnlRow[];
  data?: UpnlRow[];
  [k: string]: unknown;
}
export interface DictLike {
  [k: string]: unknown;
}
export interface TradesheetRow {
  pair?: string;
  PAIR?: string;
  entry_order_0?: string | number | null;
  entry_order_1?: string | number | null;
  exit_order_0?: string | number | null;
  exit_order_1?: string | number | null;
  [k: string]: unknown;
}

/* -------------------- numeric helper ----------------------- */
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sumUnknownValues(values: readonly unknown[]): number {
  return values.reduce<number>((s, v) => s + num(v), 0);
}

/* ----------------- thin redis getter (JSON) ----------------- */
export async function redisGetJSON(
  r: Redis,
  key: string
): Promise<unknown | null> {
  const raw = await r.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // some feeds store python-dict-like strings in JSON; try to salvage
    const coerced = tryCoercePythonishToJson(raw);
    if (coerced) return coerced;
    return null;
  }
}

/* --------- coerce python-ish dict string into JSON ---------- */
export function tryCoercePythonishToJson(raw: string): unknown | null {
  // quick heuristic: looks like "{'0': '...'}" or contains "False"/"True"
  if (!/[{[]/.test(raw)) return null;
  let s = raw.trim();
  // replace single quotes with double quotes carefully:
  // this is best-effort; content is numbers/words, not nested quotes
  s = s.replace(/'/g, '"');
  // booleans/none
  s = s
    .replace(/\bFalse\b/g, "false")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bNone\b/g, "null");
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/* --------------- extract UPNL from many shapes -------------- */
export function extractUpnlSum(payload: unknown): number {
  // Arrays of rows with {unrealizedProfit}
  if (Array.isArray(payload)) {
    return (payload as UpnlRow[]).reduce<number>(
      (s, row) => s + num(row?.unrealizedProfit),
      0
    );
  }

  if (payload && typeof payload === "object") {
    const obj = payload as RedisArrayContainer & DictLike;

    // containers with rows/data arrays
    if (Array.isArray(obj.rows)) {
      return (obj.rows as UpnlRow[]).reduce<number>(
        (s, row) => s + num(row?.unrealizedProfit),
        0
      );
    }
    if (Array.isArray(obj.data)) {
      return (obj.data as UpnlRow[]).reduce<number>(
        (s, row) => s + num(row?.unrealizedProfit),
        0
      );
    }

    // columnar dict-like: { unrealizedProfit: { '0': '1.23', ... } }
    const col = obj["unrealizedProfit"];
    if (col && typeof col === "object" && !Array.isArray(col)) {
      return sumUnknownValues(Object.values(col as DictLike));
    }

    // pythonish-as-string inside a property
    if (typeof col === "string") {
      const coerced = tryCoercePythonishToJson(col);
      if (coerced && typeof coerced === "object" && !Array.isArray(coerced)) {
        return sumUnknownValues(Object.values(coerced as DictLike));
      }
    }
  }

  return 0;
}

export async function loadUpnlSum(
  r: Redis,
  redisName: string
): Promise<number> {
  const data = await redisGetJSON(r, `${redisName}_live`);
  return extractUpnlSum(data);
}

/* ------------------- tradesheet pair mapping ----------------- */

/** very light CSV parser (no quotes in your sample), returns array of dicts */
function parseCsvLoose(csv: string): TradesheetRow[] {
  const lines = csv.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  if (!lines.length) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim());
  const out: TradesheetRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i]!.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (cols[j] ?? "").trim();
    });
    out.push(row as unknown as TradesheetRow);
  }
  return out;
}

export type PairMap = Map<string, string>; // orderId(string) -> pair(upper)

export function extractTradesheetPairs(payload: unknown): PairMap {
  const map: PairMap = new Map();

  const rows: TradesheetRow[] = (() => {
    if (typeof payload === "string" && payload.includes(",")) {
      return parseCsvLoose(payload);
    }
    if (Array.isArray(payload)) return payload as TradesheetRow[];
    if (payload && typeof payload === "object") {
      const obj = payload as RedisArrayContainer & DictLike;
      if (Array.isArray(obj.rows)) return obj.rows as TradesheetRow[];
      if (Array.isArray(obj.data)) return obj.data as TradesheetRow[];
    }
    return [];
  })();

  for (const row of rows) {
    const pairRaw = row.pair ?? (row as DictLike)["PAIR"];
    const pair = typeof pairRaw === "string" ? pairRaw.trim() : "";
    if (!pair) continue;
    const pairU = pair.toUpperCase();

    for (const key of [
      "entry_order_0",
      "entry_order_1",
      "exit_order_0",
      "exit_order_1",
    ] as const) {
      const v = row[key];
      if (v === undefined || v === null || v === "") continue;
      const oid = String(v);
      if (oid.length) map.set(oid, pairU);
    }
  }

  return map;
}

export async function loadTradesheetPairMap(
  r: Redis,
  redisName: string
): Promise<PairMap> {
  const data = await redisGetJSON(r, `${redisName}_tradesheet`);
  return extractTradesheetPairs(data);
}
