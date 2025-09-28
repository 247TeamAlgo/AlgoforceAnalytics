// src/components/analytics/DateRangeDialog.tsx
"use client";

import * as React from "react";
import {
  Calendar as CalendarIcon,
  CalendarRange,
  Info,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { usePrefs } from "@/components/prefs/PrefsContext";

/* -------------------- local date helpers (local calendar, no TZ) -------------------- */
type DraftRange = { from?: Date; to?: Date };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function toISODateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fromISODateLocal(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  // guard invalid (like 2025-02-31 rolling)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d)
    return undefined;
  return dt;
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
function prettyRangeText(
  earliest: boolean,
  start?: string,
  end?: string
): string {
  const left = earliest && !start ? "Earliest" : prettyLocal(start) || "—";
  const right = prettyLocal(end) || "—";
  return `${left} → ${right}`;
}

function todayISO(): string {
  return toISODateLocal(new Date());
}
/* ----------------------------------------------------------------------------------- */

export function DateRangeDialog() {
  const {
    analyticsRange,
    setAnalyticsRange,
    analyticsEarliest,
    setAnalyticsEarliest,
    analyticsLoading,
  } = usePrefs();

  const [open, setOpen] = React.useState<boolean>(false);

  // Draft (calendar-driven)
  const [draft, setDraft] = React.useState<DraftRange>({
    from: fromISODateLocal(analyticsRange.start),
    to: fromISODateLocal(analyticsRange.end),
  });
  const [draftEarliest, setDraftEarliest] =
    React.useState<boolean>(analyticsEarliest);

  // Manual inputs
  const [startText, setStartText] = React.useState<string>("");
  const [endText, setEndText] = React.useState<string>("");
  const [startErr, setStartErr] = React.useState<string>("");
  const [endErr, setEndErr] = React.useState<string>("");

  // Sync store → dialog on open
  React.useEffect(() => {
    if (!open) return;
    const from = fromISODateLocal(analyticsRange.start);
    const to = fromISODateLocal(analyticsRange.end);
    setDraft({ from, to });
    setDraftEarliest(analyticsEarliest);
    setStartText(analyticsEarliest ? "" : (analyticsRange.start ?? ""));
    setEndText(analyticsRange.end ?? "");
    setStartErr("");
    setEndErr("");
  }, [open, analyticsRange.start, analyticsRange.end, analyticsEarliest]);

  const disabled = analyticsLoading;

  /* -------------------- Calendar interactions -------------------- */
  const onCalendarSelect = (
    r: { from?: Date; to?: Date } | undefined
  ): void => {
    if (!r) return;
    // Selecting a concrete date disables "earliest"
    setDraftEarliest(false);
    const from = r.from ?? draft.from;
    const to = r.to ?? (r.from ? r.from : draft.to);
    setDraft({ from, to });

    // Reflect into manual inputs live
    setStartText(from ? toISODateLocal(from) : "");
    setEndText(to ? toISODateLocal(to) : "");
    setStartErr("");
    setEndErr("");
  };

  /* -------------------- Manual inputs -------------------- */
  const onStartInput = (v: string): void => {
    setStartText(v);
    if (v.trim() === "") {
      // Empty start means rely on earliest toggle or leave undefined
      setStartErr("");
      setDraft((d) => ({ ...d, from: undefined }));
      return;
    }
    const dt = fromISODateLocal(v);
    if (!dt) {
      setStartErr("Invalid date. Use YYYY-MM-DD.");
      return;
    }
    setStartErr("");
    setDraftEarliest(false);
    setDraft((d) => ({ ...d, from: dt, to: d.to ?? dt }));
  };

  const onEndInput = (v: string): void => {
    setEndText(v);
    if (v.trim() === "") {
      setEndErr("");
      setDraft((d) => ({ ...d, to: undefined }));
      return;
    }
    const dt = fromISODateLocal(v);
    if (!dt) {
      setEndErr("Invalid date. Use YYYY-MM-DD.");
      return;
    }
    setEndErr("");
    setDraft((d) => ({ ...d, to: dt, from: d.from ?? dt }));
  };

  /* -------------------- Presets -------------------- */
  const applyPresetDays = (days: number): void => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    setDraftEarliest(false);
    setDraft({ from: start, to: end });
    setStartText(toISODateLocal(start));
    setEndText(toISODateLocal(end));
    setStartErr("");
    setEndErr("");
  };

  const applyMTD = (): void => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setDraftEarliest(false);
    setDraft({ from: start, to: now });
    setStartText(toISODateLocal(start));
    setEndText(toISODateLocal(now));
    setStartErr("");
    setEndErr("");
  };

  const applyYTD = (): void => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    setDraftEarliest(false);
    setDraft({ from: start, to: now });
    setStartText(toISODateLocal(start));
    setEndText(toISODateLocal(now));
    setStartErr("");
    setEndErr("");
  };

  const applyThisMonth = (): void => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDraftEarliest(false);
    setDraft({ from: start, to: end });
    setStartText(toISODateLocal(start));
    setEndText(toISODateLocal(end));
    setStartErr("");
    setEndErr("");
  };

  const applyPrevMonth = (): void => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    setDraftEarliest(false);
    setDraft({ from: start, to: end });
    setStartText(toISODateLocal(start));
    setEndText(toISODateLocal(end));
    setStartErr("");
    setEndErr("");
  };

  const applyThisYear = (): void => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    setDraftEarliest(false);
    setDraft({ from: start, to: end });
    setStartText(toISODateLocal(start));
    setEndText(toISODateLocal(end));
    setStartErr("");
    setEndErr("");
  };

  const applyAllTime = (): void => {
    // Earliest available start with end=today
    const end = new Date();
    setDraftEarliest(true);
    setDraft({ from: undefined, to: end });
    setStartText("");
    setEndText(toISODateLocal(end));
    setStartErr("");
    setEndErr("");
  };

  /* -------------------- Apply / Clear -------------------- */
  const apply = (): void => {
    // Validate order if both present
    const startISO = draftEarliest
      ? undefined
      : draft.from
        ? toISODateLocal(draft.from)
        : undefined;
    const endISO = draft.to ? toISODateLocal(draft.to) : todayISO();

    if (startErr || endErr) return;
    if (
      !draftEarliest &&
      startISO &&
      endISO &&
      fromISODateLocal(startISO)! > fromISODateLocal(endISO)!
    ) {
      setStartErr("Start must be ≤ end.");
      return;
    }

    setAnalyticsEarliest(draftEarliest);
    setAnalyticsRange({ start: startISO, end: endISO });
    setOpen(false);
  };

  const clear = (): void => {
    setDraft({ from: undefined, to: undefined });
    setDraftEarliest(false);
    setStartText("");
    setEndText("");
    setStartErr("");
    setEndErr("");
  };

  /* -------------------- Derived labels -------------------- */
  const currentText = prettyRangeText(
    analyticsEarliest,
    analyticsRange.start,
    analyticsRange.end
  );
  const draftText = prettyRangeText(
    draftEarliest,
    draftEarliest
      ? undefined
      : draft.from
        ? toISODateLocal(draft.from)
        : undefined,
    draft.to ? toISODateLocal(draft.to) : undefined
  );

  const yearNow = new Date().getFullYear();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Open date range dialog"
          className="h-9 gap-2"
        >
          <CalendarRange className="h-4 w-4" aria-hidden />
          Date range
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            Date range
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5" />
            Choose a window via presets, manual input, or the calendar.
            Selecting on the calendar turns off “Earliest”.
          </DialogDescription>
        </DialogHeader>

        {/* Presets */}
        <div className="rounded-lg border p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Quick presets
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyPresetDays(7)}
            >
              Last 7d
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyPresetDays(30)}
            >
              Last 30d
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyPresetDays(90)}
            >
              Last 90d
            </Button>
            <Button variant="secondary" size="sm" onClick={applyMTD}>
              MTD
            </Button>
            <Button variant="secondary" size="sm" onClick={applyYTD}>
              YTD
            </Button>
            <Button variant="secondary" size="sm" onClick={applyThisMonth}>
              This month
            </Button>
            <Button variant="secondary" size="sm" onClick={applyPrevMonth}>
              Prev month
            </Button>
            <Button variant="secondary" size="sm" onClick={applyThisYear}>
              This year
            </Button>
            <Button variant="secondary" size="sm" onClick={applyAllTime}>
              All time
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-5">
          {/* Calendar (two months, year/month dropdowns) */}
          <div className="sm:col-span-3 rounded-lg border p-3">
            <Calendar
              mode="range"
              numberOfMonths={2}
              disabled={disabled}
              selected={{ from: draft.from, to: draft.to }}
              onSelect={onCalendarSelect}
              initialFocus
              fromYear={2018}
              toYear={yearNow + 1}
              showOutsideDays
              fixedWeeks
            />
          </div>

          {/* Controls */}
          <div className="sm:col-span-2 space-y-3">
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground mb-1">Current</div>
              <div className="text-sm font-medium">{currentText}</div>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm text-muted-foreground">Draft</div>
              <div className="text-sm font-medium mb-2">{draftText}</div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <Label htmlFor="start" className="text-xs">
                    Start (YYYY-MM-DD)
                  </Label>
                  <Input
                    id="start"
                    placeholder="YYYY-MM-DD"
                    value={startText}
                    onChange={(e) => onStartInput(e.target.value)}
                    disabled={disabled}
                  />
                  {startErr ? (
                    <span className="text-[11px] text-destructive">
                      {startErr}
                    </span>
                  ) : null}
                </label>
                <label className="flex flex-col gap-1">
                  <Label htmlFor="end" className="text-xs">
                    End (YYYY-MM-DD)
                  </Label>
                  <Input
                    id="end"
                    placeholder="YYYY-MM-DD"
                    value={endText}
                    onChange={(e) => onEndInput(e.target.value)}
                    disabled={disabled}
                  />
                  {endErr ? (
                    <span className="text-[11px] text-destructive">
                      {endErr}
                    </span>
                  ) : null}
                </label>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Switch
                id="earliest"
                checked={draftEarliest}
                onCheckedChange={(b) => {
                  setDraftEarliest(b);
                  if (b)
                    setDraft((d) => ({
                      from: undefined,
                      to: d.to ?? new Date(),
                    }));
                  setStartText(
                    b ? "" : draft.from ? toISODateLocal(draft.from) : ""
                  );
                  setStartErr("");
                }}
                disabled={disabled}
              />
              <Label htmlFor="earliest" className="text-sm cursor-pointer">
                Use earliest available as start
              </Label>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> If no end is chosen, it will
              default to today.
            </div>
          </div>
        </div>

        {/* Footer: Draft left, Controls right */}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            Draft: {draftText}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
            <Button
              size="sm"
              onClick={apply}
              disabled={disabled || Boolean(startErr || endErr)}
            >
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
