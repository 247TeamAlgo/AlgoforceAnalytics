// app/(analytics)/analytics/components/Controls.tsx
"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Account } from "../lib/performance_metric_types";
import { cn, displayName } from "../lib/performance_metric_types";
import DateRangePicker from "./DateRangePicker";

type IsoDate = string;

interface Range {
  start?: IsoDate;
  end?: IsoDate;
}

type Props = {
  accounts?: Account[] | null; // resilient: may be undefined/null
  selected?: string[] | null; // resilient: may be undefined/null
  setSelected: (ids: string[]) => void;

  range: Range;
  setRange: (r: Range) => void;
  earliest: boolean;
  setEarliest: (b: boolean) => void;

  loading: boolean;
  error?: string | null;
};

/** Narrow unknown values to an Account-ish shape we can safely render. */
function isAccountLike(v: unknown): v is Account {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  // minimal guard: must have a redisName string
  return typeof o.redisName === "string" && o.redisName.length > 0;
}

export default function Controls({
  accounts,
  selected,
  setSelected,
  range,
  setRange,
  earliest,
  setEarliest,
  loading,
  error,
}: Props) {
  // Normalize possibly-bad inputs
  const list: Account[] = Array.isArray(accounts)
    ? accounts.filter(isAccountLike)
    : [];

  const selectedArr: string[] = Array.isArray(selected)
    ? selected.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];

  const selectedSet = new Set<string>(selectedArr);

  const toggleOne = (id: string): void => {
    if (selectedSet.has(id)) {
      setSelected(selectedArr.filter((x) => x !== id));
    } else {
      setSelected([...selectedArr, id]);
    }
  };

  const selectAll = (): void => setSelected(list.map((a) => a.redisName));
  const clearSel = (): void => setSelected([]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Controls</CardTitle>
        <CardDescription>Date range &amp; account selection</CardDescription>
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
              Accounts ({selectedArr.length}/{list.length} selected)
            </span>
            <div className="flex gap-2">
              <button
                className="text-xs underline"
                onClick={selectAll}
                disabled={loading || list.length === 0}
              >
                Select All
              </button>
              <button
                className="text-xs underline"
                onClick={clearSel}
                disabled={loading || selectedArr.length === 0}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {list
              .filter((a) => Boolean(a?.monitored))
              .concat(list.filter((a) => !a?.monitored))
              .map((a) => {
                const checked = selectedSet.has(a.redisName);
                const titleBits: string[] = [a.redisName];
                if (a.display) titleBits.push(String(a.display));
                const titleAttr = titleBits.join(" • ");

                return (
                  <label
                    key={a.redisName}
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-2 cursor-pointer transition",
                      checked
                        ? "bg-secondary/60 border-secondary"
                        : "hover:bg-muted/40"
                    )}
                    title={titleAttr}
                  >
                    <input
                      type="checkbox"
                      className="accent-foreground"
                      checked={checked}
                      onChange={() => toggleOne(a.redisName)}
                      disabled={loading}
                    />
                    <span className="truncate">{displayName(a)}</span>
                    {a.monitored ? (
                      <Badge className="ml-auto" variant="outline">
                        Monitored
                      </Badge>
                    ) : null}
                  </label>
                );
              })}
          </div>

          {/* Only surface the error text once we actually have an accounts response */}
          {Array.isArray(accounts) && error ? (
            <div className="mt-2 text-sm text-destructive">{error}</div>
          ) : null}

          {/* Friendly hint if backend hasn’t returned accounts yet */}
          {!Array.isArray(accounts) ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Waiting for accounts…
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
