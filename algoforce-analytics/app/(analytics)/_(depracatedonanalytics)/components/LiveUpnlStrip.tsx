// app/(analytics)/analytics/components/LiveUpnlStrip.tsx
"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";

function usd(n?: number): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type Props = {
  combined?: number;                    // total unrealized PnL
  perAccount?: Record<string, number>;  // { fund2: 123, fund3: -45 }
  maxAccounts?: number;                 // <=0 means unlimited; default 10
};

function clsPosNeg(n: number | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "text-muted-foreground";
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function chipStyle(n: number | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n))
    return "bg-muted/20 border-muted/30 text-muted-foreground";
  if (n > 0)
    return "bg-emerald-500/6 border-emerald-500/25 text-emerald-700/80 dark:text-emerald-300/80";
  if (n < 0)
    return "bg-red-500/6 border-red-500/25 text-red-700/80 dark:text-red-300/80";
  return "bg-muted/20 border-muted/30 text-muted-foreground";
}

function chipIcon(n: number | undefined) {
  if (typeof n !== "number" || Number.isNaN(n)) return <Minus className="h-3.5 w-3.5" />;
  if (n > 0) return <TrendingUp className="h-3.5 w-3.5" />;
  if (n < 0) return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

export default function LiveUpnlStrip({
  combined,
  perAccount,
  maxAccounts = 10,
}: Props) {
  const rows = React.useMemo(() => {
    const entries = Object.entries(perAccount ?? {}).map(([key, v]) => ({
      key,
      label: key,
      v: typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0,
    }));
    entries.sort((a, b) => b.v - a.v);
    return entries;
  }, [perAccount]);

  const visible = React.useMemo(
    () => (maxAccounts > 0 ? rows.slice(0, maxAccounts) : rows),
    [rows, maxAccounts]
  );

  const hiddenCount = rows.length - visible.length;

  const combinedValue = React.useMemo(() => {
    if (typeof combined === "number" && Number.isFinite(combined)) return combined;
    return rows.reduce((s, r) => s + (Number.isFinite(r.v) ? r.v : 0), 0);
  }, [combined, rows]);

  return (
    <Card className="p-3 sm:p-4 rounded-xl border shadow-sm">
      {/* ONE-LINER container */}
      <div
        className="
          flex items-center gap-2 flex-nowrap overflow-x-auto whitespace-nowrap
          [&>*]:shrink-0
        "
        aria-label="Unrealized PnL summary"
      >
        {/* Combined pill */}
        <span
          className={[
            "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 border",
            "bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50",
          ].join(" ")}
          title="Combined unrealized PnL"
        >
          <Activity className={["h-4 w-4", clsPosNeg(combinedValue)].join(" ")} />
          <span
            className={[
              "text-xl font-semibold tabular-nums",
              clsPosNeg(combinedValue),
            ].join(" ")}
          >
            {usd(combinedValue)}
          </span>
          <span className="text-xs text-muted-foreground">Unrealized PnL</span>
        </span>

        {/* Account chips (all on the same line) */}
        {visible.map((r) => (
          <span
            key={r.key}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              "transition-colors",
              chipStyle(r.v),
            ].join(" ")}
            title={r.key}
          >
            {chipIcon(r.v)}
            <span className="font-medium truncate max-w-[160px]">{r.label}</span>
            <span className="tabular-nums">{usd(r.v)}</span>
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
      </div>
    </Card>
  );
}
