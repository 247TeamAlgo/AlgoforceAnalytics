import { readAccounts, type Account } from "@/lib/jsonStore";

let accCache: { byKey: Map<string, Account>; last: number } | null = null;
async function getAccountByKey(key: string): Promise<Account | undefined> {
  const now = Date.now();
  if (!accCache || now - accCache.last > 10_000) {
    const all = await readAccounts();
    accCache = {
      byKey: new Map(all.map((a) => [a.redisName.toLowerCase(), a])),
      last: now,
    };
  }
  return accCache.byKey.get(key.toLowerCase());
}
export async function getTableName(key: string): Promise<string> {
  const acc = await getAccountByKey(key);
  return (acc?.binanceName || key).toLowerCase();
}