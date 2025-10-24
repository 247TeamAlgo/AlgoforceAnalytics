// app/(analytics)/analytics/components/performance-metrics/LiveUpnlStrip.tsx
"use client";

import type { PerformanceMetricsWindow } from "@/components/prefs/types";
import { Card } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiBinance } from "react-icons/si";
import {
  Activity,
  CalendarRange,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
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
  /** preserved for backward-compat; ignored now (we show all accounts) */
  maxAccounts?: number;
  /** Pass payload.meta.window to show the current analytics date range on the right */
  window?: PerformanceMetricsWindow;
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

/** Right-aligned date-range pill (Window) */
function WindowBadge({
  window,
  label,
}: {
  window?: PerformanceMetricsWindow;
  label: string;
}) {
  const startDay = window?.startDay;
  const endDay = window?.endDay;

  const windowLabel = useMemo(() => {
    if (startDay && endDay) return `${startDay} \u2192 ${endDay}`;
    return "—";
  }, [startDay, endDay]);

  const hasWindow = Boolean(startDay && endDay);

  return (
    <span
      className={[
        "ml-auto inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px] leading-none",
        hasWindow ? "bg-card/60" : "bg-muted/30",
        "shadow-sm",
      ].join(" ")}
      aria-label="Analytics date window"
    >
      <CalendarRange className="h-3.5 w-3.5 text-foreground/80" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{windowLabel}</span>
    </span>
  );
}

/** Accounts pill — same style as Window; embeds ALL account UPNL chips with horizontal scroll */
function AccountsBadge({ rows }: { rows: { label: string; v: number }[] }) {
  if (!rows.length) {
    return (
      <span
        className={[
          "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px] leading-none",
          "bg-muted/30 shadow-sm",
        ].join(" ")}
        aria-label="Accounts in this view"
      >
        <SiBinance className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-muted-foreground">Accounts</span>
        <span className="font-medium text-foreground">—</span>
      </span>
    );
  }

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px] leading-none",
        "bg-card/60 shadow-sm",
        "max-w-full",
      ].join(" ")}
      aria-label="Accounts in this view"
    >
      <SiBinance className="h-3.5 w-3.5 text-amber-400" />
      <span className="text-muted-foreground">Accounts</span>

      {/* divider */}
      <span className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />

      {/* horizontally scrollable chip rail; responsive max-widths */}
      <div className="flex items-center gap-1 overflow-x-auto pr-1 max-w-[60vw] sm:max-w-[70vw] md:max-w-[55vw] lg:max-w-[50vw]">
        {rows.map((r) => (
          <span
            key={r.label}
            className={[
              "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] leading-none",
              "transition-colors",
              accountBadgeCls(r.v),
            ].join(" ")}
            title={r.label}
          >
            {accountIcon(r.v)}
            <span className="font-medium truncate max-w-[120px]">
              {r.label}
            </span>
            <span
              className={["font-semibold tabular-nums", valueTextCls(r.v)].join(
                " "
              )}
            >
              {usd(r.v)}
            </span>
          </span>
        ))}
      </div>
    </span>
  );
}

export default function LiveUpnlStrip({ combined, perAccount, window }: Props) {
  const rows = useMemo(() => {
    const entries = Object.entries(perAccount ?? {}).map(([key, v]) => ({
      label: key,
      v: typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0,
    }));
    // sort desc by value (largest gain first)
    entries.sort((a, b) => b.v - a.v);
    return entries;
  }, [perAccount]);

  const combinedValue = useMemo(() => {
    if (typeof combined === "number" && Number.isFinite(combined))
      return combined;
    return rows.reduce((s, r) => s + (Number.isFinite(r.v) ? r.v : 0), 0);
  }, [combined, rows]);

  return (
    <Card className="p-2 sm:p-2.5 rounded-xl border shadow-sm">
      <TooltipProvider delayDuration={120}>
        <div
          className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto whitespace-nowrap [&>*]:shrink-0"
          aria-label="Unrealized PnL summary"
        >
          {/* TOTAL — compact badge with colored value */}
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] leading-none"
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

          {/* ACCOUNTS — pill with ALL per-account UPNL chips (x-scroll inside) */}
          <AccountsBadge rows={rows} />

          {/* Right-aligned date window badge */}
          <WindowBadge window={window} label="Window (UTC)" />
        </div>
      </TooltipProvider>
    </Card>
  );
}
