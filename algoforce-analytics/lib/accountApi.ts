// lib/accountApi.ts
// Keep this file browser-safe: do not import from fs/path/jsonStore at runtime.
export type Strategy = "Charm" | "Janus" | "None";

export type Account = {
  binanceName: string;
  redisName: string;
  dbName?: string | null;
  strategy: Strategy;
  leverage: number;
  monitored: boolean;
  createdAt: string;
  updatedAt: string;
};

// Payloads mirror server rules (timestamps server-managed)
export type NewAccount = Omit<Account, "createdAt" | "updatedAt">;
export type AccountPatch = Partial<
  Omit<Account, "redisName" | "createdAt" | "updatedAt">
>;

async function asJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return data as T;
}

export async function createAccount(payload: NewAccount): Promise<Account> {
  const res = await fetch("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return asJson<Account>(res);
}

export async function updateAccount(
  id: string,
  patch: AccountPatch
): Promise<Account> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return asJson<Account>(res);
}

export async function removeAccounts(
  ids: string[]
): Promise<{ removed: number }> {
  const res = await fetch("/api/accounts", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return asJson<{ removed: number }>(res);
}
