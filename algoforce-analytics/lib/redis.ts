// src/lib/redis.ts
import Redis from "ioredis";

/* ---------------------------------------------------------------
   A SINGLE process-wide Redis connection that survives hot reload
---------------------------------------------------------------- */
declare global {
  var _afRedis: Redis | undefined;
}

export function redis(): Redis {
  if (!global._afRedis) {
    global._afRedis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null, // never reject pending commands
      reconnectOnError: () => true, // auto-retry on ECONNRESET & friends
      enableReadyCheck: true,
      keepAlive: 10_000,
    });
  }
  return global._afRedis;
}

/* -----------------  Helpers  ---------------------------------- */

/** Some producers write NaN/Infinity; replace with null so JSON.parse succeeds. */
function tolerantParse<T = unknown>(raw: string): T | object {
  try {
    return JSON.parse(raw) as T;
  } catch {
    try {
      const cleaned = raw
        .replace(/\bNaN\b/gi, "null")
        .replace(/\b-?Infinity\b/gi, "null");
      return JSON.parse(cleaned) as T;
    } catch {
      console.error("[redis] tolerantParse failed; returning {}", {
        sample: raw.slice(0, 256),
      });
      return {};
    }
  }
}

/** Recursively coerce any non-finite numbers into 0 (leave nulls as-is). */
function sanitizeNumbers(v: unknown): unknown {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (Array.isArray(v)) return v.map(sanitizeNumbers);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = sanitizeNumbers(o[k]);
    return out;
  }
  return v;
}

export async function getJson<T>(key: string): Promise<T> {
  const raw = await redis().get(key);
  if (!raw) return {} as T;
  const parsed = tolerantParse<T>(raw);
  return sanitizeNumbers(parsed) as T;
}

/** Fetch several keys in ONE round-trip and parse them to JSON */
export async function getManyJson(
  ...keys: string[]
): Promise<Record<string, unknown>[]> {
  if (keys.length === 0) return [];
  const raw = await redis().mget(...keys);
  return raw.map((x) => {
    if (!x) return {};
    const parsed = tolerantParse<Record<string, unknown>>(x);
    return sanitizeNumbers(parsed) as Record<string, unknown>;
  });
}
