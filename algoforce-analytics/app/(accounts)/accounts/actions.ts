"use server";

import { type Account } from "@/lib/jsonStore";

export async function setAccountMonitoredSA(
  id: string,
  monitored: boolean
): Promise<Account> {
  const updated = await updateAccount(id, { monitored });
  return updated;
}

export async function bulkSetAccountMonitoredSA(
  ids: string[],
  monitored: boolean
): Promise<Account[]> {
  const results = await Promise.all(
    ids.map((id) => updateAccount(id, { monitored }))
  );
  return results;
}
