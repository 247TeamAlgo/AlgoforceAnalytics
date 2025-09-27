// app/api/v1/1-performance_metrics/calculators/accounts_json.ts
import raw from "@/data/accounts.json";

export type AccountKey = string;

export interface AccountInfo {
  binanceName: string;
  redisName: AccountKey;
  dbName: string;
  strategy: string;
  leverage: number;
  monitored: boolean;
  createdAt: string;
  updatedAt: string;
}

const ARR: readonly AccountInfo[] = (raw as AccountInfo[]).map((a) => ({
  ...a,
  leverage: Number(a.leverage) || 0,
}));

export const ACCOUNTS_INFO = ARR;
export const ACCOUNT_SET = new Set(ARR.map((a) => a.redisName));

export function getAccountInfo(key: AccountKey): AccountInfo | undefined {
  return ARR.find((a) => a.redisName === key);
}

export function tableCandidatesFor(a: AccountInfo): string[] {
  // Try redisName first, then binanceName (per your spec).
  const cands = [a.redisName, a.binanceName].filter(Boolean);
  // Deduplicate case-insensitively while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cands) {
    const k = c.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

export function resolveRequestedAccounts(requested: string[] | undefined): {
  accepted: AccountInfo[];
  ignored: string[];
} {
  if (!requested?.length) return { accepted: [], ignored: [] };
  const accepted: AccountInfo[] = [];
  const ignored: string[] = [];
  for (const r of requested) {
    const a = getAccountInfo(r);
    if (a) accepted.push(a);
    else ignored.push(r);
  }
  return { accepted, ignored };
}
