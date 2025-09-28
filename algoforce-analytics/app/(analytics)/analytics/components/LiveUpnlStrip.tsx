// app/(analytics)/analytics/components/LiveUpnlStrip.tsx
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
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

type Props = {
  accounts: Account[];
  selected: string[]; // used to summarize; chips are sorted by PnL only
  upnlAsOf?: string; // freshness indicator uses this
  combined?: number; // combined for selected; if absent we compute from perAccount
  perAccount?: Record<string, number>;
  /**
   * Max number of account chips to render.
   * 0 (or negative) means "no limit".
   * Default: 10.
   */
  maxAccounts?: number;
};

/* -------------------------- helpers -------------------------- */

function clsPosNeg(n: number | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "text-muted-foreground";
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function chipStyle(n: number | undefined, isSelected: boolean): string {
  // Stronger emphasis for selected accounts (no extra dot)
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

function msSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return Date.now() - t;
}

/** Freshness thresholds: <=3s green, <=12s yellow, else red. */
function freshnessMeta(iso?: string): {
  dot: string; // bg color for dot
  text: string; // text color for relative label
  border: string; // border color for the pill
  relLabel: string; // "3s", "1m 05s", etc.
  absLabel?: string; // absolute when available
  tz?: string; // local timezone ID
} {
  const ms = msSince(iso);
  let rel = "unknown";
  let dot = "bg-muted-foreground/40";
  let text = "text-muted-foreground";
  let border = "border-muted/40";
  let abs: string | undefined;
  let tz: string | undefined;

  if (ms !== undefined) {
    const s = Math.max(0, Math.floor(ms / 1000));
    rel = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

    if (s <= 3) {
      dot = "bg-emerald-500";
      text = "text-emerald-600 dark:text-emerald-400";
      border = "border-emerald-500/40";
    } else if (s <= 12) {
      dot = "bg-yellow-500";
      text = "text-yellow-600 dark:text-yellow-400";
      border = "border-yellow-500/40";
    } else {
      dot = "bg-red-500";
      text = "text-red-600 dark:text-red-400";
      border = "border-red-500/40";
    }

    const dt = iso ? new Date(iso) : undefined;
    if (dt && !Number.isNaN(dt.getTime())) {
      abs = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(dt);
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }

  return { dot, text, border, relLabel: rel, absLabel: abs, tz };
}

/* ------------------------------------------------------------- */

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

  const selectedSet = React.useMemo(
    () => new Set<string>(selected),
    [selected]
  );

  // Build rows; sort by raw PnL descending (positive → negative)
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

  // Combined for selected (fallback if combined not provided)
  const combinedSelected = React.useMemo(() => {
    if (typeof combined === "number" && !Number.isNaN(combined))
      return combined;
    if (!perAccount) return undefined;
    let sum = 0;
    for (const id of selected) {
      const v = perAccount[id];
      if (typeof v === "number" && !Number.isNaN(v)) sum += v;
    }
    return sum;
  }, [combined, perAccount, selected]);

  const fresh = freshnessMeta(upnlAsOf);

  // Selected-only analytics (richer summary)
  const selectedRows = React.useMemo(
    () => allRows.filter((r) => r.isSelected),
    [allRows]
  );
  const pos = React.useMemo(
    () => selectedRows.filter((r) => r.v > 0),
    [selectedRows]
  );
  const neg = React.useMemo(
    () => selectedRows.filter((r) => r.v < 0),
    [selectedRows]
  );
  const posSum = React.useMemo(
    () => pos.reduce((acc, r) => acc + r.v, 0),
    [pos]
  );
  const negSum = React.useMemo(
    () => neg.reduce((acc, r) => acc + r.v, 0),
    [neg]
  );
  const topGainer = React.useMemo(
    () => (pos.length ? pos.slice().sort((a, b) => b.v - a.v)[0] : undefined),
    [pos]
  );
  const topLoser = React.useMemo(
    () => (neg.length ? neg.slice().sort((a, b) => a.v - b.v)[0] : undefined),
    [neg]
  );

  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl border shadow-sm">
      {/* Top row: Combined + freshness + ordered summary (Selected is last) */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {/* Left: Combined PnL and freshness pill (no "LIVE" word) */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className={[
              "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 border",
              "bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50",
            ].join(" ")}
          >
            <Activity
              className={["h-4 w-4", clsPosNeg(combinedSelected)].join(" ")}
            />
            <span
              className={[
                "text-xl font-semibold tabular-nums",
                clsPosNeg(combinedSelected),
              ].join(" ")}
            >
              {fmtUsd(combinedSelected ?? null)}
            </span>
            <span className="text-xs text-muted-foreground">UPNL</span>
          </div>

          {/* Freshness pill with relative + absolute time and timezone */}
          <span
            className={[
              "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] border",
              fresh.border,
            ].join(" ")}
            title={
              fresh.absLabel
                ? `${fresh.absLabel}${fresh.tz ? ` • ${fresh.tz}` : ""}`
                : "unknown"
            }
          >
            <span className={["h-2 w-2 rounded-full", fresh.dot].join(" ")} />
            {fresh.absLabel ? (
              <span className="hidden sm:inline text-muted-foreground">
                {fresh.absLabel}
                {fresh.tz ? ` • ${fresh.tz}` : ""}
              </span>
            ) : null}
          </span>
        </div>

        {/* Right: summary badges in required order, with Selected LAST */}
        <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-2 text-xs">
          {/* Positive */}
          <span
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
            title={`Positive (selected): ${pos.length}`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">{pos.length}</span>
            <span className="text-muted-foreground">({fmtUsd(posSum)})</span>
          </span>

          {/* Negative */}
          <span
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
            title={`Negative (selected): ${neg.length}`}
          >
            <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            <span className="font-medium">{neg.length}</span>
            <span className="text-muted-foreground">({fmtUsd(negSum)})</span>
          </span>

          {/* Top gainer */}
          {topGainer ? (
            <span
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
              title={`Top gainer (selected): ${topGainer.label}`}
            >
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="truncate max-w-[160px]">{topGainer.label}</span>
              <span className="font-medium">{fmtUsd(topGainer.v)}</span>
            </span>
          ) : null}

          {/* Top loser */}
          {topLoser ? (
            <span
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
              title={`Top loser (selected): ${topLoser.label}`}
            >
              <ArrowDownRight className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              <span className="truncate max-w-[160px]">{topLoser.label}</span>
              <span className="font-medium">{fmtUsd(topLoser.v)}</span>
            </span>
          ) : null}

          {/* Selected — MUST be last */}
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
            <span className="font-medium">Selected</span>
            <span className="text-muted-foreground">
              {selected.length}/{accounts.length}
            </span>
          </span>
        </div>
      </div>

      {/* Chips (sorted by raw PnL desc; selected emphasized; no grey dot) */}
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
