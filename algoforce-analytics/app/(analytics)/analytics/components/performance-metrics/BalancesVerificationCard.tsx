"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { BulkMetricsResponse } from "../../hooks/useAnalyticsData";

function fmtUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return (
    (v < 0 ? "-" : "") +
    "$" +
    Math.abs(v).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function sumSelected(
  row: Record<string, unknown> | undefined,
  selected: readonly string[]
): number {
  if (!row) return 0;
  let s = 0;
  for (const acc of selected) {
    const v = row[acc];
    if (typeof v === "number") s += v;
    else if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) s += n;
    }
  }
  return s;
}

export default function BalancesVerificationCard({
  bulk,
  selected,
  title = "Balances — Verification",
}: {
  bulk: BulkMetricsResponse;
  selected: string[]; // ONLY these accounts will be shown and summed
  title?: string;
}) {
  const dates = React.useMemo(
    () => Object.keys(bulk?.balance ?? {}).sort(),
    [bulk?.balance]
  );

  const rows = React.useMemo(() => {
    const out: Array<{
      day: string;
      per: Record<string, number>;
      combined: number;
      deltaFromPrev: number | null;
    }> = [];

    let prevCombined: number | null = null;

    for (const day of dates) {
      const row = bulk.balance[day] as Record<string, unknown>;
      const per: Record<string, number> = {};
      for (const acc of selected) {
        const raw = row?.[acc];
        const n =
          typeof raw === "number"
            ? raw
            : typeof raw === "string"
              ? Number(raw)
              : NaN;
        per[acc] = Number.isFinite(n) ? (n as number) : 0;
      }
      const combined = sumSelected(row, selected);
      const deltaFromPrev =
        prevCombined == null ? null : combined - prevCombined;
      prevCombined = combined;
      out.push({ day, per, combined, deltaFromPrev });
    }
    return out;
  }, [bulk?.balance, dates, selected]);

  const windowLabel =
    bulk?.window?.startDay && bulk?.window?.endDay
      ? `${bulk.window.startDay} → ${bulk.window.endDay}`
      : "MTD";

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-xl sm:text-2xl">{title}</CardTitle>
            <CardDescription className="text-base">
              {windowLabel}
            </CardDescription>
          </div>
          <div className="hidden sm:flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>Accounts:</span>
            <span className="font-medium text-foreground">
              {selected.length ? selected.join(", ") : "—"}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {selected.length === 0 ? (
          <div className="text-sm text-muted-foreground px-2 py-6">
            Select at least one account to view balances.
          </div>
        ) : dates.length === 0 ? (
          <div className="text-sm text-muted-foreground px-2 py-6">
            No balance data.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b">
                  <th className="text-left px-3 py-2 font-semibold text-foreground text-base">
                    Date
                  </th>
                  {selected.map((acc) => (
                    <th
                      key={acc}
                      className="text-right px-3 py-2 font-semibold text-foreground text-base"
                    >
                      {acc}
                    </th>
                  ))}
                  <th className="text-right px-3 py-2 font-semibold text-foreground text-base">
                    Combined (selected)
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-foreground text-base">
                    Δ vs prev
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.day} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">
                      {r.day.slice(0, 10)}
                    </td>
                    {selected.map((acc) => (
                      <td
                        key={`${r.day}-${acc}`}
                        className="px-3 py-2 text-right tabular-nums"
                      >
                        {fmtUsd(r.per[acc] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {fmtUsd(r.combined)}
                    </td>
                    <td
                      className={[
                        "px-3 py-2 text-right tabular-nums",
                        r.deltaFromPrev == null
                          ? "text-muted-foreground"
                          : r.deltaFromPrev > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : r.deltaFromPrev < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {r.deltaFromPrev == null ? "—" : fmtUsd(r.deltaFromPrev)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Optional footer with latest */}
              <tfoot>
                <tr>
                  <td
                    className="px-3 py-2 text-muted-foreground"
                    colSpan={selected.length + 3}
                  >
                    Values are rendered exactly from backend payload; combined
                    is a simple sum of the selected accounts for each day.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
