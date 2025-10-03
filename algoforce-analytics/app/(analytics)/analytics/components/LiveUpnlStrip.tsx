"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import {
  fmtUsd,
  displayName,
  type Account,
} from "../lib/performance_metric_types";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

type Props = {
  accounts: Account[];
  selected: string[]; // used to summarize; chips are sorted by PnL only
  combined?: number; // combined for selected; if absent we compute from perAccount
  perAccount?: Record<string, number>;
  maxAccounts?: number;
};

function clsPosNeg(n: number | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "text-muted-foreground";
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function chipStyle(n: number | undefined, isSelected: boolean): string {
  if (typeof n !== "number" || Number.isNaN(n))
    return isSelected
      ? "bg-muted/40 border-muted/40 text-muted-foreground"
      : "bg-muted/20 border-muted/30 text-muted-foreground";
  if (n > 0)
    return isSelected
      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
      : "bg-emerald-500/6 border-emerald-500/25 text-emerald-700/80 dark:text-emerald-300/80";
  if (n < 0)
    return isSelected
      ? "bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300"
      : "bg-red-500/6 border-red-500/25 text-red-700/80 dark:text-red-300/80";
  return isSelected
    ? "bg-muted/40 border-muted/40 text-muted-foreground"
    : "bg-muted/20 border-muted/30 text-muted-foreground";
}

function chipIcon(n: number | undefined) {
  if (typeof n !== "number" || Number.isNaN(n))
    return <Minus className="h-3.5 w-3.5" />;
  if (n > 0) return <TrendingUp className="h-3.5 w-3.5" />;
  if (n < 0) return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

export default function LiveUpnlStrip({
  accounts,
  selected,
  combined,
  perAccount,
  maxAccounts = 10,
}: Props) {
  const labelByKey = React.useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.redisName] = displayName(a);
    return m;
  }, [accounts]);

  const selectedSet = React.useMemo(
    () => new Set<string>(selected),
    [selected]
  );

  const allRows = React.useMemo(() => {
    const keys = perAccount ? Object.keys(perAccount) : [];
    const r = keys.map((k) => ({
      key: k,
      label: labelByKey[k] ?? k,
      v: perAccount?.[k] ?? 0,
      isSelected: selectedSet.has(k),
    }));
    r.sort((a, b) => b.v - a.v);
    return r;
  }, [perAccount, labelByKey, selectedSet]);

  const visible = React.useMemo(() => {
    if (maxAccounts > 0) return allRows.slice(0, maxAccounts);
    return allRows;
  }, [allRows, maxAccounts]);

  const hiddenCount = allRows.length - visible.length;

  const combinedSelected = React.useMemo(() => {
    if (typeof combined === "number" && !Number.isNaN(combined)) return combined;
    if (!perAccount) return undefined;
    let sum = 0;
    for (const id of selected) {
      const v = perAccount[id];
      if (typeof v === "number" && !Number.isNaN(v)) sum += v;
    }
    return sum;
  }, [combined, perAccount, selected]);

  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl border shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className={[
              "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 border",
              "bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50",
            ].join(" ")}
          >
            <Activity className={["h-4 w-4", clsPosNeg(combinedSelected)].join(" ")} />
            <span className={["text-xl font-semibold tabular-nums", clsPosNeg(combinedSelected)].join(" ")}>
              {fmtUsd(combinedSelected ?? null)}
            </span>
            <span className="text-xs text-muted-foreground">Unrealized PnL</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {visible.map((r) => (
          <span
            key={r.key}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              "transition-colors",
              chipStyle(r.v, r.isSelected),
            ].join(" ")}
            title={`${r.key}${r.isSelected ? " • selected" : ""}`}
          >
            {chipIcon(r.v)}
            <span className="font-medium truncate max-w-[160px]">
              {r.label}
            </span>
            <span className="tabular-nums">{fmtUsd(r.v)}</span>
          </span>
        ))}

        {hiddenCount > 0 ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-muted/20 border-muted/30 text-muted-foreground"
            title="Some accounts hidden due to maxAccounts"
          >
            +{hiddenCount} more
          </span>
        ) : null}

        {allRows.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No per-account data.
          </span>
        ) : null}
      </div>
    </Card>
  );
}
