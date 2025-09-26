"use client";

import { useState } from "react";
import { toast } from "sonner";
import JsonAccountsView, { type JsonAccountRow } from "./view/JsonAccountsView";
import type { Account } from "@/lib/jsonStore";

export type Strategy = "Charm" | "Janus" | "None";

export default function TablesPageClient(props: {
  initialAccounts: JsonAccountRow[];
  setAccountMonitored: (id: string, monitored: boolean) => Promise<Account>;
  bulkSetAccountMonitored: (
    ids: string[],
    monitored: boolean
  ) => Promise<Account[]>;
}) {
  const { initialAccounts, setAccountMonitored, bulkSetAccountMonitored } =
    props;
  const [rows, setRows] = useState<JsonAccountRow[]>(initialAccounts);

  const upsertLocal = (a: JsonAccountRow): void =>
    setRows((old) => {
      const i = old.findIndex((x) => x.redisName === a.redisName);
      if (i >= 0) {
        const copy = old.slice();
        copy[i] = a;
        return copy;
      }
      return [a, ...old];
    });

  async function toggleMonitored(id: string, next: boolean): Promise<void> {
    const p = setAccountMonitored(id, next);
    toast.promise(p, {
      loading: "Saving…",
      success: "Updated",
      error: "Update failed",
    });
    const saved = await p;
    upsertLocal(saved);
  }

  async function bulkToggleMonitored(
    ids: string[],
    next: boolean
  ): Promise<void> {
    const p = bulkSetAccountMonitored(ids, next);
    toast.promise(p, {
      loading: next ? "Enabling monitor…" : "Disabling monitor…",
      success: "Updated",
      error: "Bulk update failed",
    });
    const saved = await p;
    const map = new Map(saved.map((a) => [a.redisName, a] as const));
    setRows((old) => old.map((r) => map.get(r.redisName) ?? r));
  }

  return (
    <JsonAccountsView
      accounts={rows}
      onToggleMonitored={toggleMonitored}
      onBulkToggleMonitored={bulkToggleMonitored}
    />
  );
}
