// src/app/.../Controls.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Account } from "./types";
import { cn, displayName } from "./types";
import DateRangePicker from "./DateRangePicker";
import * as React from "react";

type IsoDate = string;
interface Range { start?: IsoDate; end?: IsoDate; }

export default function Controls({
  accounts, selected, setSelected,
  range, setRange, earliest, setEarliest,
  loading, error,
  onAutoFetch,
}: {
  accounts: Account[];
  selected: string[];
  setSelected: (ids: string[]) => void;

  range: Range;
  setRange: (r: Range) => void;
  earliest: boolean;
  setEarliest: (b: boolean) => void;

  loading: boolean;
  error: string | null;
  onAutoFetch: () => void;
}) {
  const selectedSet = new Set(selected);
  const toggleOne = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const selectAll = () => setSelected(accounts.map(a => a.redisName));
  const clearSel = () => setSelected([]);

  /**
   * BOOTSTRAP GUARD
   * Prevent any auto-fetch from firing during initial state normalization.
   * We’ll set last-30-days and force earliest=false, then release the guard.
   */
  const bootstrappingRef = React.useRef<boolean>(true);

  React.useEffect(() => {
    // Default to last 30 days if no range provided
    if (!range.start && !range.end) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);

      setRange({
        start: start.toISOString().slice(0, 10), // YYYY-MM-DD
        end: end.toISOString().slice(0, 10),
      });
    }
    // Hard-disable "earliest" at startup — user can enable it later.
    setEarliest(false);

    // Release guard on next tick so state above settles first.
    const id = window.setTimeout(() => { bootstrappingRef.current = false; }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * AUTO-FETCH: range/earliest changes
   * - Respect explicit [start, end] always.
   * - Fall back to 'earliest → end' ONLY if no explicit start exists AND user set earliest=true.
   * - Suppress during bootstrap.
   */
  React.useEffect(() => {
    if (bootstrappingRef.current) return;

    const hasExplicitRange = Boolean(range.start && range.end);
    if (hasExplicitRange) {
      onAutoFetch();
      return;
    }
    if (!hasExplicitRange && earliest && range.end) {
      onAutoFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, earliest]);

  /**
   * AUTO-FETCH: account selection changes
   * - Same validity rules as above.
   * - Suppress during bootstrap.
   */
  React.useEffect(() => {
    if (bootstrappingRef.current) return;

    const hasExplicitRange = Boolean(range.start && range.end);
    if (selected.length > 0 && (hasExplicitRange || (earliest && range.end))) {
      onAutoFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join("|")]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Controls</CardTitle>
        <CardDescription>Date range &amp; account selection (auto-applies)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col md:col-span-2">
            <span className="text-sm text-neutral-600">Date Range</span>
            <DateRangePicker
              value={range}
              onChange={setRange}
              earliest={earliest}
              onToggleEarliest={setEarliest}
              disabled={loading}
            />
          </label>
        </div>

        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Accounts ({selected.length}/{accounts.length} selected)
            </span>
            <div className="flex gap-2">
              <button className="text-xs underline" onClick={selectAll} disabled={loading}>Select All</button>
              <button className="text-xs underline" onClick={clearSel} disabled={loading}>Clear</button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {accounts
              .filter(a => a.monitored)
              .concat(accounts.filter(a => !a.monitored))
              .map(a => {
                const checked = selectedSet.has(a.redisName);
                return (
                  <label
                    key={a.redisName}
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-2 cursor-pointer transition",
                      checked ? "bg-secondary/60 border-secondary" : "hover:bg-muted/40"
                    )}
                    title={`${a.redisName} • ${a.strategy} • ${a.leverage}x`}
                  >
                    <input
                      type="checkbox"
                      className="accent-foreground"
                      checked={checked}
                      onChange={() => toggleOne(a.redisName)}
                      disabled={loading}
                    />
                    <span className="truncate">{displayName(a)}</span>
                    {a.monitored ? <Badge className="ml-auto" variant="outline">Monitored</Badge> : null}
                  </label>
                );
              })}
          </div>

          {error ? <div className="mt-2 text-sm text-destructive">{error}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
