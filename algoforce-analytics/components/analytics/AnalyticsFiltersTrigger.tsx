// app/(analytics)/analytics/components/AnalyticsFiltersTrigger.tsx
"use client";

import { useMemo, useState } from "react";
import { CalendarIcon, Filter as FilterIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import DateRangePicker from "@/app/(analytics)/analytics/components/DateRangePicker";

import { displayName } from "@/app/(analytics)/analytics/lib/performance_metric_types";
import { usePrefs } from "../prefs/PrefsContext";

/* -------- mount helper to avoid SSR text mismatches -------- */
function useMounted(): boolean {
  const [m, setM] = useState(false);
  useState(() =>
    typeof window !== "undefined" ? setTimeout(() => setM(true), 0) : null
  );
  return m;
}

/* -------- local date formatters (aligned with DateRangePicker) -------- */
function fromISODateLocal(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
const LOCAL_FMT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});
function prettyLocal(s?: string): string {
  const dt = fromISODateLocal(s);
  return dt ? LOCAL_FMT.format(dt) : "";
}
function rangeLabel(earliest: boolean, start?: string, end?: string): string {
  const left = earliest && !start ? "Earliest" : prettyLocal(start) || "—";
  const right = prettyLocal(end) || "—";
  return `${left} → ${right}`;
}
/* --------------------------------------------------------------------- */

export function AnalyticsFiltersTrigger() {
  const mounted = useMounted();

  const {
    analyticsAccounts: accounts,
    analyticsSelectedAccounts: selected,
    setAnalyticsSelectedAccounts: setSelected,
    analyticsRange: range,
    setAnalyticsRange: setRange,
    analyticsEarliest: earliest,
    setAnalyticsEarliest: setEarliest,
    analyticsLoading: loading,
  } = usePrefs();

  const [open, setOpen] = useState<boolean>(false);
  const [q, setQ] = useState<string>("");

  const selectedSet = useMemo(() => new Set<string>(selected), [selected]);

  // During SSR (mounted === false), freeze to empty list so server & client markup match
  const safeAccounts = useMemo(() => (mounted ? accounts : []), [mounted, accounts]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = Array.isArray(safeAccounts) ? safeAccounts : [];
    const monitored = list.filter((a) => Boolean(a?.monitored));
    const rest = list.filter((a) => !a?.monitored);
    const ordered = monitored.concat(rest);
    if (!term) return ordered;
    return ordered.filter((a) => {
      const label = `${a.redisName} ${a.display ?? ""}`.toLowerCase();
      return label.includes(term);
    });
  }, [safeAccounts, q]);

  const onToggle = (id: string): void => {
    if (selectedSet.has(id)) {
      setSelected(selected.filter((x) => x !== id));
    } else {
      setSelected([...selected, id]);
    }
  };

  const selectAll = (): void =>
    setSelected((safeAccounts ?? []).map((a) => a.redisName));
  const clearAll = (): void => setSelected([]);

  const disabled = loading || (safeAccounts?.length ?? 0) === 0;

  const labelText = mounted
    ? rangeLabel(earliest, range.start, range.end)
    : "MTD";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2"
          aria-label="Open analytics filters"
        >
          <CalendarIcon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline" suppressHydrationWarning>
            {labelText}
          </span>
          <Badge variant="secondary" className="ml-1">
            <span suppressHydrationWarning>
              {mounted ? `${selected.length}/${safeAccounts.length}` : "—"}
            </span>
          </Badge>
          <FilterIcon className="h-4 w-4 sm:ml-1" aria-hidden />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:w-[560px]">
        <SheetHeader className="text-left">
          <SheetTitle>Analytics Filters</SheetTitle>
          <SheetDescription suppressHydrationWarning>
            {mounted
              ? `Range: ${rangeLabel(earliest, range.start, range.end)}`
              : "Range: MTD"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Date range (optional: disabled since backend is MTD-only) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">Date range</div>
              <div
                className="text-sm text-muted-foreground"
                suppressHydrationWarning
              >
                {labelText}
              </div>
            </div>
            <DateRangePicker
              value={range}
              onChange={setRange}
              earliest={earliest}
              onToggleEarliest={setEarliest}
              disabled
              className="w-full"
            />
          </div>

          <Separator />

          {/* Accounts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                Accounts{" "}
                <span
                  className="text-muted-foreground font-normal"
                  suppressHydrationWarning
                >
                  ({mounted ? `${selected.length}/${safeAccounts.length}` : "—"}
                  )
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  disabled={disabled}
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  disabled={disabled || selected.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 opacity-60" />
              <Input
                className="pl-8"
                placeholder="Search accounts…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <ScrollArea className="h-[320px] rounded-md border p-2">
              <div className="grid sm:grid-cols-2 gap-2">
                {filtered.map((a) => {
                  const checked = selectedSet.has(a.redisName);
                  const label = displayName(a);
                  const titleBits: string[] = [a.redisName];
                  if (a.display) titleBits.push(String(a.display));
                  const title = titleBits.join(" • ");
                  return (
                    <label
                      key={a.redisName}
                      title={title}
                      className={[
                        "flex items-center gap-2 rounded-md border p-2 cursor-pointer transition",
                        checked
                          ? "bg-secondary/60 border-secondary"
                          : "hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => onToggle(a.redisName)}
                        aria-label={`Toggle ${label}`}
                      />
                      <span className="truncate">{label}</span>
                      {a.monitored ? (
                        <Badge className="ml-auto" variant="outline">
                          Monitored
                        </Badge>
                      ) : null}
                    </label>
                  );
                })}
                {filtered.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2">
                    No accounts.
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
