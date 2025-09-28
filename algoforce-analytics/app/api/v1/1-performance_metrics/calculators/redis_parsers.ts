import type { Redis } from "ioredis";

/* ---------- minimal shapes we can rely on ---------- */
export interface UpnlRow {
  symbol?: string;
  SYMBOL?: string;
  unrealizedProfit?: number | string;
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

/* ---------------- numeric helper ---------------- */
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/* --------- coerce python-ish dict string into JSON ---------- */
export function tryCoercePythonishToJson(raw: string): unknown | null {
  if (!/[{[]/.test(raw)) return null;
  let s = raw.trim();
  s = s.replace(/'/g, '"');
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

/* ----------------- thin redis getter (JSON or CSV) ----------------- */
export async function redisGetJSON(
  r: Redis,
  key: string
): Promise<unknown | null> {
  const raw = await r.get(key);
  if (!raw) return null;

  // Try proper JSON first
  try {
    return JSON.parse(raw);
  } catch {
    // Not JSON; may be python-ish dict OR CSV columnar text
    const coerced = tryCoercePythonishToJson(raw);
    if (coerced) return coerced;

    // If it looks like CSV and contains the unrealizedProfit column, return raw for CSV path
    if (raw.includes(",") && /(^|,) *unrealizedProfit *(,|$)/i.test(raw)) {
      return raw;
    }
    return null;
  }
}

/* ---------------- CSV helpers ------------------- */

/** very light CSV -> array of row objects (no quoted commas expected) */
function parseCsvLoose(csv: string): Array<Record<string, string>> {
  const lines = csv.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  if (!lines.length) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim());
  const out: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i]!.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (cols[j] ?? "").trim();
    });
    out.push(row);
  }
  return out;
}

/** CSV where the 'unrealizedProfit' cell is a python-ish dict string */
function extractUpnlFromCsvString(rawCsv: string): number {
  const rows = parseCsvLoose(rawCsv);
  if (!rows.length) return 0;

  const cell =
    rows[0]["unrealizedProfit"] ??
    rows[0]["UNREALIZEDPROFIT"] ??
    rows[0]["UnrealizedProfit"];
  if (!cell) return 0;

  const dict = tryCoercePythonishToJson(cell);
  if (dict && typeof dict === "object" && !Array.isArray(dict)) {
    const vals = Object.values(dict as Record<string, unknown>);
    return vals.reduce<number>((s, v) => s + num(v), 0);
  }

  // Fallback: it may be a flat number string
  return num(cell);
}

/** CSV -> per-symbol UPNL map using dict-string columns: 'symbol' + 'unrealizedProfit' */
function extractUpnlMapFromCsvString(rawCsv: string): Record<string, number> {
  const rows = parseCsvLoose(rawCsv);
  if (!rows.length) return {};

  const row0 = rows[0]!;
  const symCell =
    row0["symbol"] ?? row0["SYMBOL"] ?? row0["Symbol"] ?? row0["symbols"];
  const upnlCell =
    row0["unrealizedProfit"] ??
    row0["UNREALIZEDPROFIT"] ??
    row0["UnrealizedProfit"];

  if (!symCell || !upnlCell) return {};

  const symDict = tryCoercePythonishToJson(symCell);
  const upnlDict = tryCoercePythonishToJson(upnlCell);

  const symObj =
    symDict && typeof symDict === "object" && !Array.isArray(symDict)
      ? (symDict as Record<string, unknown>)
      : null;
  const upnlObj =
    upnlDict && typeof upnlDict === "object" && !Array.isArray(upnlDict)
      ? (upnlDict as Record<string, unknown>)
      : null;

  if (!symObj || !upnlObj) return {};

  const out: Record<string, number> = {};
  const idxs = new Set([...Object.keys(symObj), ...Object.keys(upnlObj)]);
  for (const i of idxs) {
    const sym = String(symObj[i] ?? "").toUpperCase();
    if (!sym) continue;
    const u = num(upnlObj[i]);
    out[sym] = (out[sym] ?? 0) + u;
  }
  return out;
}

/* --------------- extract UPNL from many shapes -------------- */
export function extractUpnlSum(payload: unknown): number {
  // CSV columnar string case
  if (typeof payload === "string" && payload.includes(",")) {
    if (/(^|,) *unrealizedProfit *(,|$)/i.test(payload)) {
      return extractUpnlFromCsvString(payload);
    }
  }

  // Arrays of rows with {unrealizedProfit}
  if (Array.isArray(payload)) {
    return (payload as UpnlRow[]).reduce<number>(
      (s, row) => s + num((row as UpnlRow)?.unrealizedProfit),
      0
    );
  }

  if (payload && typeof payload === "object") {
    const obj = payload as RedisArrayContainer & DictLike;

    // containers with rows/data arrays
    if (Array.isArray(obj.rows)) {
      return (obj.rows as UpnlRow[]).reduce<number>(
        (s, row) => s + num((row as UpnlRow)?.unrealizedProfit),
        0
      );
    }
    if (Array.isArray(obj.data)) {
      return (obj.data as UpnlRow[]).reduce<number>(
        (s, row) => s + num((row as UpnlRow)?.unrealizedProfit),
        0
      );
    }

    // columnar dict-like: { unrealizedProfit: { '0': '1.23', ... } }
    const col = (obj as DictLike)["unrealizedProfit"];
    if (col && typeof col === "object" && !Array.isArray(col)) {
      const vals = Object.values(col as Record<string, unknown>);
      return vals.reduce<number>((s, v) => s + num(v), 0);
    }

    // pythonish-as-string inside property
    if (typeof col === "string") {
      const coerced = tryCoercePythonishToJson(col);
      if (coerced && typeof coerced === "object" && !Array.isArray(coerced)) {
        const vals = Object.values(coerced as Record<string, unknown>);
        return vals.reduce<number>((s, v) => s + num(v), 0);
      }
    }
  }

  return 0;
}

/** Extract per-symbol UPNL map from various payload shapes. */
export function extractUpnlPerSymbolMap(
  payload: unknown
): Record<string, number> {
  // CSV with columnar dict strings
  if (typeof payload === "string" && payload.includes(",")) {
    if (/(^|,) *unrealizedProfit *(,|$)/i.test(payload)) {
      return extractUpnlMapFromCsvString(payload);
    }
  }

  // Arrays of row objects
  if (Array.isArray(payload)) {
    const out: Record<string, number> = {};
    for (const row of payload as UpnlRow[]) {
      const sym = String((row.symbol ?? row.SYMBOL ?? "") || "").toUpperCase();
      if (!sym) continue;
      out[sym] = (out[sym] ?? 0) + num(row.unrealizedProfit);
    }
    return out;
  }

  // Objects with rows/data arrays OR columnar objects
  if (payload && typeof payload === "object") {
    const obj = payload as RedisArrayContainer & DictLike;

    if (Array.isArray(obj.rows) || Array.isArray(obj.data)) {
      const arr: UpnlRow[] = (
        Array.isArray(obj.rows) ? obj.rows : obj.data
      ) as UpnlRow[];
      const out: Record<string, number> = {};
      for (const row of arr) {
        const sym = String(
          (row.symbol ?? row.SYMBOL ?? "") || ""
        ).toUpperCase();
        if (!sym) continue;
        out[sym] = (out[sym] ?? 0) + num(row.unrealizedProfit);
      }
      return out;
    }

    // Columnar dict-like: { symbol: {'0':'BTCUSDT',...}, unrealizedProfit: {'0':'1.2',...} }
    const symCol = (obj as DictLike)["symbol"] ?? (obj as DictLike)["SYMBOL"];
    const upnlCol = (obj as DictLike)["unrealizedProfit"];
    const dictOrStrToObj = (v: unknown): Record<string, unknown> | null => {
      if (!v) return null;
      if (typeof v === "object" && !Array.isArray(v))
        return v as Record<string, unknown>;
      if (typeof v === "string") {
        const coerced = tryCoercePythonishToJson(v);
        if (coerced && typeof coerced === "object" && !Array.isArray(coerced)) {
          return coerced as Record<string, unknown>;
        }
      }
      return null;
    };

    const symObj = dictOrStrToObj(symCol);
    const upnlObj = dictOrStrToObj(upnlCol);
    if (symObj && upnlObj) {
      const out: Record<string, number> = {};
      const idxs = new Set([...Object.keys(symObj), ...Object.keys(upnlObj)]);
      for (const i of idxs) {
        const sym = String(symObj[i] ?? "").toUpperCase();
        if (!sym) continue;
        out[sym] = (out[sym] ?? 0) + num(upnlObj[i]);
      }
      return out;
    }
  }

  return {};
}

export async function loadUpnlSum(
  r: Redis,
  redisName: string
): Promise<number> {
  const data = await redisGetJSON(r, `${redisName}_live`);
  return extractUpnlSum(data);
}

/** Try multiple candidate names (e.g., redisName, binanceName) and pick the first */
export async function loadUpnlSumMulti(
  r: Redis,
  redisNames: string[]
): Promise<number> {
  for (const name of redisNames) {
    const raw = await r.get(`${name}_live`);
    if (!raw) continue;

    // Try JSON first
    try {
      const parsed = JSON.parse(raw);
      return extractUpnlSum(parsed);
    } catch {
      // pythonish or CSV
      const coerced = tryCoercePythonishToJson(raw);
      if (coerced !== null) return extractUpnlSum(coerced);
      if (raw.includes(",") && /(^|,) *unrealizedProfit *(,|$)/i.test(raw)) {
        return extractUpnlFromCsvString(raw);
      }
    }
  }
  return 0;
}

/** Load per-symbol UPNL map for a single account from `${redisName}_live`. */
export async function loadUpnlPerSymbolMap(
  r: Redis,
  redisName: string
): Promise<Record<string, number>> {
  const data = await redisGetJSON(r, `${redisName}_live`);
  return extractUpnlPerSymbolMap(data);
}

/* ------------------- tradesheet pair mapping ----------------- */
export type PairMap = Map<string, string>; // orderId(string) -> pair(upper)

function parseTradesheetCsv(csv: string): TradesheetRow[] {
  const rows = parseCsvLoose(csv);
  return rows as unknown as TradesheetRow[];
}

export function extractTradesheetPairs(payload: unknown): PairMap {
  const map: PairMap = new Map();

  const rows: TradesheetRow[] = (() => {
    if (typeof payload === "string" && payload.includes(",")) {
      return parseTradesheetCsv(payload);
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
