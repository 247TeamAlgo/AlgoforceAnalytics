"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useMemo } from "react";

function usd(n?: number): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type Props = {
  combined?: number;
  perAccount?: Record<string, number>;
  maxAccounts?: number; // <=0 means unlimited
};

function toneValue(n: number | undefined): "pos" | "neg" | "flat" {
  if (typeof n !== "number" || Number.isNaN(n)) return "flat";
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "flat";
}

function valueTextCls(n: number | undefined): string {
  const t = toneValue(n);
  if (t === "pos") return "text-emerald-600 dark:text-emerald-400";
  if (t === "neg") return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function accountBadgeCls(n: number | undefined): string {
  const t = toneValue(n);
  if (t === "pos")
    return "bg-emerald-500/6 border-emerald-500/30 text-emerald-700/90 dark:text-emerald-300/90";
  if (t === "neg")
    return "bg-red-500/6 border-red-500/30 text-red-700/90 dark:text-red-300/90";
  return "bg-muted/20 border-muted/30 text-muted-foreground";
}

function accountIcon(n: number | undefined) {
  const t = toneValue(n);
  if (t === "pos") return <TrendingUp className="h-3.5 w-3.5" />;
  if (t === "neg") return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5 opacity-70" />;
}

export default function LiveUpnlStrip({
  combined,
  perAccount,
  maxAccounts = 10,
}: Props) {
  const rows = useMemo(() => {
    const entries = Object.entries(perAccount ?? {}).map(([key, v]) => ({
      key,
      label: key,
      v: typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0,
    }));
    entries.sort((a, b) => b.v - a.v);
    return entries;
  }, [perAccount]);

  const visible = useMemo(
    () => (maxAccounts > 0 ? rows.slice(0, maxAccounts) : rows),
    [rows, maxAccounts]
  );
  const hiddenCount = rows.length - visible.length;

  const combinedValue = useMemo(() => {
    if (typeof combined === "number" && Number.isFinite(combined)) return combined;
    return rows.reduce((s, r) => s + (Number.isFinite(r.v) ? r.v : 0), 0);
  }, [combined, rows]);

  return (
    <Card className="p-2 sm:p-2.5 rounded-xl border shadow-sm">
      <div
        className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto whitespace-nowrap [&>*]:shrink-0"
        aria-label="Unrealized PnL summary"
      >
        {/* TOTAL — same size as account chips, but subtly highlighted */}
        <span
          className={[
            "inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] leading-none",
          ].join(" ")}
          title="Total Unrealized PnL"
        >
          <Activity
            className={["h-3.5 w-3.5", valueTextCls(combinedValue)].join(" ")}
            aria-hidden
          />
          <span className="tracking-wide text-[11px] text-muted-foreground">
            Total Unrealized PnL
          </span>
          <span
            className={[
              "font-semibold tabular-nums text-sm sm:text-[15px]",
              valueTextCls(combinedValue),
            ].join(" ")}
          >
            {usd(combinedValue)}
          </span>
        </span>

        {/* Account badges — colored + trend icon */}
        {visible.map((r) => (
          <span
            key={r.key}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] leading-none",
              "transition-colors",
              accountBadgeCls(r.v),
            ].join(" ")}
            title={r.key}
          >
            {accountIcon(r.v)}
            <span className="font-medium truncate max-w-[140px]">{r.label}</span>
            <span
              className={[
                "font-semibold tabular-nums text-sm sm:text-[15px]",
                valueTextCls(r.v),
              ].join(" ")}
            >
              {usd(r.v)}
            </span>
          </span>
        ))}

        {hiddenCount > 0 ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] leading-none bg-muted/20 border-muted/30 text-muted-foreground"
            title="Some accounts hidden due to maxAccounts"
          >
            +{hiddenCount} more
          </span>
        ) : null}
      </div>
    </Card>
  );
}
