// app/(analytics)/analytics/components/LiveUpnlStrip.tsx
"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { fmtUsd, displayName, type Account } from "../lib/types";

type Props = {
  accounts: Account[];
  selected: string[]; // kept for upstream coupling, not used to build the list
  upnlAsOf?: string;
  combined?: number;
  perAccount?: Record<string, number>;
  /**
   * Max number of account chips to render.
   * 0 (or negative) means "no limit".
   * Default: 8 (preserves prior behavior).
   */
  maxAccounts?: number;
};

function clsPosNeg(n: number | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "text-muted-foreground";
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export default function LiveUpnlStrip({
  accounts,
  selected,
  upnlAsOf,
  combined,
  perAccount,
  maxAccounts = 10,
}: Props) {
  const labelByKey = React.useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.redisName] = displayName(a);
    return m;
  }, [accounts]);

  const rows = React.useMemo(() => {
    const keys = perAccount ? Object.keys(perAccount) : [];
    const r = keys.map((k) => ({
      key: k,
      label: labelByKey[k] ?? k,
      v: perAccount?.[k] ?? 0,
    }));
    r.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    return r;
  }, [perAccount, labelByKey]);

  const visible = React.useMemo(() => {
    if (maxAccounts > 0) return rows.slice(0, maxAccounts);
    return rows;
  }, [rows, maxAccounts]);

  const hiddenCount = rows.length - visible.length;

  return (
    <Card className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Live UPNL</div>
        <div className="text-xs text-muted-foreground">
          {upnlAsOf ? new Date(upnlAsOf).toLocaleTimeString() : "—"}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <div className={`text-xl font-semibold ${clsPosNeg(combined)}`}>
          {fmtUsd(combined ?? null)}
        </div>
        <div className="text-xs text-muted-foreground">combined</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {visible.map((r) => (
          <span
            key={r.key}
            className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
            title={r.key}
          >
            <span className="font-medium truncate max-w-[120px]">
              {r.label}
            </span>
            <span className={clsPosNeg(r.v)}>{fmtUsd(r.v)}</span>
          </span>
        ))}

        {hiddenCount > 0 ? (
          <span
            className="inline-flex items-center rounded-md border px-2 py-1 text-xs text-muted-foreground"
            title="Some accounts hidden due to maxAccounts"
          >
            +{hiddenCount} more
          </span>
        ) : null}

        {rows.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No per-account data.
          </span>
        ) : null}
      </div>
    </Card>
  );
}
